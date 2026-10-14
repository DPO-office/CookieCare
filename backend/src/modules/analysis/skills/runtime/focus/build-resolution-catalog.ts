import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../../llm/index.js";
import type {
  ExplicitScope,
  InstructionRequirement,
  RequirementCapabilityMapping,
  UnresolvedNeedDetail,
} from "../../../models/analysis-plan.js";
import {
  filterIdsByScope,
  renderScopeForCatalogPrompt,
} from "./extract-explicit-scope.js";
import type { IntentRequirement } from "../../../models/intent.js";
import type { AnalysisSkillConfig } from "../catalog/types.js";
import { pacWarn } from "../../../utils/pac-log.js";
import { dedupeStrings } from "../../../shared/dedupe.js";

export interface ResolutionCandidate {
  id: string;
  kind: "rule" | "matrix_row" | "risk_category" | "package";
  label: string;
  skillId: string;
  /** Semantic substance the candidate covers (rule text / matrix article / risk guidance). */
  description?: string;
  /** Clause types a rule applies to; interpreted via the clause-type glossary. */
  applicableClauseTypes?: string[];
  checkType?: string;
  legalHook?: string;
  /** Package-only: PLAN requirement types this package can satisfy. */
  requirementKinds?: string[];
  /** Package-only: semantic topics for requirement→package matching. */
  semanticTopics?: string[];
}

export interface CatalogResolutionResult {
  requirements: InstructionRequirement[];
  selectedIds: string[];
  requiredIds: string[];
  supportingIds: string[];
  requirementMappings: RequirementCapabilityMapping[];
  unresolvedNeeds: UnresolvedNeedDetail[];
  reasoning?: string;
}

const FOCUS_RESOLUTION_SCHEMA = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          sourceText: { type: "string" },
        },
        required: ["id", "label"],
      },
    },
    selectedIds: {
      type: "array",
      items: { type: "string" },
    },
    requiredIds: {
      type: "array",
      items: { type: "string" },
    },
    supportingIds: {
      type: "array",
      items: { type: "string" },
    },
    requirementMappings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string" },
          capabilityIds: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["requirementId", "capabilityIds"],
      },
    },
    unresolvedNeeds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string" },
          reason: { type: "string" },
        },
        required: ["requirement", "reason"],
      },
    },
    reasoning: { type: "string" },
  },
  required: [
    "requirements",
    "selectedIds",
    "requiredIds",
    "supportingIds",
    "requirementMappings",
    "unresolvedNeeds",
  ],
};

export function buildResolutionCatalog(
  activeSkills: AnalysisSkillConfig[]
): ResolutionCandidate[] {
  const catalog: ResolutionCandidate[] = [];
  const seen = new Set<string>();

  for (const skill of activeSkills) {
    for (const rule of skill.regimeRules) {
      const key = `rule:${rule.ruleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({
        id: rule.ruleId,
        kind: "rule",
        label: rule.label ?? rule.ruleId,
        skillId: skill.skillId,
        description: rule.ruleText,
        applicableClauseTypes:
          rule.appliesToClauseTypes && rule.appliesToClauseTypes.length > 0
            ? rule.appliesToClauseTypes
            : undefined,
        checkType: rule.checkType,
        legalHook: rule.legalHook,
      });
    }

    for (const row of skill.rightsMatrixRows ?? []) {
      const key = `matrix_row:${row.rowId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({
        id: row.rowId,
        kind: "matrix_row",
        label: row.label,
        skillId: skill.skillId,
        description: `Article ${row.article}: ${row.label}`,
      });
    }

    for (const category of skill.riskCategories) {
      const key = `risk_category:${category.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({
        id: category.category,
        kind: "risk_category",
        label: category.displayLabel,
        skillId: skill.skillId,
        description: category.guidance,
      });
    }

    for (const pkg of skill.evidencePackages ?? []) {
      const key = `package:${pkg.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({
        id: pkg.id,
        kind: "package",
        label: pkg.label ?? pkg.id,
        skillId: skill.skillId,
        description:
          [
            pkg.description ??
              `${pkg.kind ?? "evaluation"} package covering ${
                pkg.requirementIds.join(", ") ||
                pkg.capabilityIds.join(", ") ||
                "authored analysis"
              }`,
            pkg.requirementKinds?.length
              ? `requirementKinds: ${pkg.requirementKinds.join(", ")}`
              : "",
            pkg.semanticTopics?.length
              ? `semanticTopics: ${pkg.semanticTopics.join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
        applicableClauseTypes: pkg.clauseTypes.length > 0 ? pkg.clauseTypes : undefined,
        requirementKinds: pkg.requirementKinds,
        semanticTopics: pkg.semanticTopics,
      });
    }
  }

  return catalog;
}

/**
 * Compact clause-type glossary across active skills so the LLM can interpret each
 * rule's applicableClauseTypes without repeating definitions per candidate.
 */
export function buildClauseTypeGlossary(
  activeSkills: AnalysisSkillConfig[]
): Map<string, string> {
  const glossary = new Map<string, string>();
  for (const skill of activeSkills) {
    for (const [clauseType, definition] of Object.entries(
      skill.clauseTypeDefinitions ?? {}
    )) {
      if (!clauseType || !definition) continue;
      if (!glossary.has(clauseType)) glossary.set(clauseType, definition);
    }
  }
  return glossary;
}

export async function resolveFocusViaCatalog(
  instruction: string,
  catalog: ResolutionCandidate[],
  clauseTypeGlossary: Map<string, string> = new Map(),
  fullTextIds?: Set<string>,
  seedRequirements?: IntentRequirement[],
  explicitScope?: ExplicitScope
): Promise<CatalogResolutionResult> {
  if (catalog.length === 0) {
    return emptyCatalogResult();
  }

  const rendered = catalog
    .map((candidate) =>
      renderCandidate(
        candidate,
        Boolean(fullTextIds && fullTextIds.size > 0 && !fullTextIds.has(candidate.id))
      )
    )
    .join("\n\n");

  const seedBlock =
    seedRequirements && seedRequirements.length > 0
      ? [
          "Seed requirements already extracted from the instruction (preserve these ids and types; add only if something distinct is missing):",
          ...seedRequirements.map(
            (req) => `- ${req.id} [${req.type}/${req.priority}]: ${req.description}`
          ),
          "",
        ].join("\n")
      : "";

  const scopeBlock = explicitScope ? renderScopeForCatalogPrompt(explicitScope) : undefined;

  try {
    const raw = (await executeJsonCompletion(
      [
        "Analyze this document-analysis instruction in two steps:",
        "",
        scopeBlock,
        scopeBlock ? "" : undefined,
        seedBlock,
        "STEP 1 — Extract semantic requirements:",
        seedRequirements && seedRequirements.length > 0
          ? "Start from the seed requirements above. Keep their ids. Add only genuinely missing distinct asks."
          : "List every distinct thing the user wants established, verified, or assessed.",
        "Use snake_case ids (e.g. subject_matter, clause_adequacy, mandatory_article_28_3_clauses).",
        "Each requirement must be a semantic ask, not just a keyword or article number.",
        "Include completeness/presence/adequacy asks when the user asks to verify, check, or assess.",
        "",
        "STEP 2 — Map requirements to catalog capabilities or analysis packages:",
        "The candidate catalog below is the complete universe of selectable items.",
        "Prefer a `package` candidate when the user wants inventory, extraction, listing, or a grouped evaluation that the package description covers.",
        "Do not map an inventory/extraction ask onto a list of individual legal-article rule ids when a package candidate exists.",
        "Select every catalog candidate needed to fully satisfy the instruction.",
        "Reason over each candidate's full description, not just its label — the user may express requirements in different words.",
        "A single candidate description often enumerates several sub-requirements; when it does, use that one candidate to satisfy all of those user requirements (e.g. a rule whose description lists subject matter, duration, nature, purpose, data categories, data-subject categories, and controller obligations covers each of those as one capability).",
        "Map a fine-grained requirement to a broad rule whenever that rule's description already covers it. Do not report a requirement as unresolved if any candidate description covers it.",
        "Use the clause-type glossary to interpret each rule's clauseTypes as additional semantic context.",
        "Put directly required capabilities or package ids in requiredIds.",
        explicitScope
          ? "Never put out-of-scope or context-only articles in requiredIds. Adjacent articles belong in supportingIds at most."
          : "Put contextual or adjacent capabilities in supportingIds (e.g. Article 29 when user asked for Article 28).",
        "Cross-referenced articles (e.g. Arts 32–36 mentioned inside Art 28(3)(f)) are context for the parent rule — do NOT schedule them as separate required rule checks.",
        "For each requirement, list which capability or package ids satisfy it in requirementMappings.",
        "Never map an extraction, inventory, or listing requirement onto individual legal-article rule ids when a package candidate's semanticTopics or description covers the same subject.",
        "Only return ids that appear in the candidate list. Never invent, rename, or derive an id.",
        "If a requirement cannot be satisfied by any catalog candidate, add it to unresolvedNeeds with a short reason.",
        "",
        renderClauseTypeGlossary(clauseTypeGlossary),
        `Candidates:\n${rendered}`,
        "",
        `Instruction: ${instruction}`,
      ]
        .filter(Boolean)
        .join("\n"),
      "You are a strict semantic planner. Extract requirements first, then select capabilities by reading each candidate's full description — never by guessing article ids alone, and never marking a requirement unresolved when a candidate description already covers it.",
      FOCUS_RESOLUTION_SCHEMA,
      LLMTask.STRUCTURAL_JSON_LITE,
      LLMProvider.GEMINI
    )) as {
      requirements?: unknown;
      selectedIds?: unknown;
      requiredIds?: unknown;
      supportingIds?: unknown;
      requirementMappings?: unknown;
      unresolvedNeeds?: unknown;
      reasoning?: unknown;
    };

    const parsedRequirements = parseRequirements(raw.requirements);
    const requirements =
      parsedRequirements.length > 0
        ? parsedRequirements
        : (seedRequirements ?? []).map((req) => ({
            id: req.id,
            label: req.description,
            sourceText: req.description,
          }));
    const selectedIds = asStringArray(raw.selectedIds);
    const requiredIds = asStringArray(raw.requiredIds);
    const supportingIds = asStringArray(raw.supportingIds);
    const requirementMappings = parseRequirementMappings(raw.requirementMappings);
    const unresolvedNeeds = parseUnresolvedNeeds(raw.unresolvedNeeds);

    const scopedRequiredIds = explicitScope
      ? filterIdsByScope(requiredIds, explicitScope, catalog)
      : requiredIds;
    const scopedSupportingIds = explicitScope
      ? filterIdsByScope(supportingIds, explicitScope, catalog)
      : supportingIds;
    const scopedSelectedIds = explicitScope
      ? filterIdsByScope(selectedIds, explicitScope, catalog)
      : selectedIds;
    const scopedMappings = explicitScope
      ? requirementMappings.map((mapping) => ({
          ...mapping,
          capabilityIds: filterIdsByScope(mapping.capabilityIds, explicitScope, catalog),
        }))
      : requirementMappings;

    return {
      requirements,
      selectedIds: dedupeStrings([...scopedSelectedIds, ...scopedRequiredIds, ...scopedSupportingIds]),
      requiredIds: scopedRequiredIds,
      supportingIds: scopedSupportingIds,
      requirementMappings: scopedMappings,
      unresolvedNeeds,
      reasoning: typeof raw.reasoning === "string" ? raw.reasoning : undefined,
    };
  } catch (error) {
    pacWarn("catalog focus resolution failed; falling back to deterministic focus", {
      instruction,
      error: error instanceof Error ? error.message : String(error),
    });
    return emptyCatalogResult();
  }
}

export function validateAgainstCatalog(
  selectedIds: string[],
  catalog: ResolutionCandidate[],
  instruction: string
): { valid: string[]; dropped: string[] } {
  const allowed = new Set(catalog.map((candidate) => candidate.id));
  const valid = selectedIds.filter((id) => allowed.has(id));
  const dropped = selectedIds.filter((id) => !allowed.has(id));

  if (dropped.length > 0) {
    pacWarn("catalog focus resolution returned unknown ids", {
      dropped,
      instruction,
    });
  }

  return { valid, dropped };
}

function renderCandidate(candidate: ResolutionCandidate, compact = false): string {
  const lines: string[] = [
    `- id: ${candidate.id}  (${candidate.kind}, skill: ${candidate.skillId})`,
    `  label: ${candidate.label}`,
  ];
  if (!compact && candidate.description) {
    lines.push(`  description: ${candidate.description}`);
  }
  if (candidate.applicableClauseTypes && candidate.applicableClauseTypes.length > 0) {
    lines.push(`  clauseTypes: ${candidate.applicableClauseTypes.join(", ")}`);
  }
  if (candidate.requirementKinds && candidate.requirementKinds.length > 0) {
    lines.push(`  requirementKinds: ${candidate.requirementKinds.join(", ")}`);
  }
  if (candidate.semanticTopics && candidate.semanticTopics.length > 0) {
    lines.push(`  semanticTopics: ${candidate.semanticTopics.join(", ")}`);
  }
  if (candidate.checkType) {
    lines.push(`  checkType: ${candidate.checkType}`);
  }
  if (candidate.legalHook) {
    lines.push(`  legalHook: ${candidate.legalHook}`);
  }
  return lines.join("\n");
}

function renderClauseTypeGlossary(glossary: Map<string, string>): string {
  if (glossary.size === 0) return "";
  const entries = [...glossary.entries()]
    .map(([clauseType, definition]) => `- ${clauseType}: ${definition}`)
    .join("\n");
  return `Clause-type glossary (interpret each candidate's clauseTypes):\n${entries}\n`;
}

function emptyCatalogResult(): CatalogResolutionResult {
  return {
    requirements: [],
    selectedIds: [],
    requiredIds: [],
    supportingIds: [],
    requirementMappings: [],
    unresolvedNeeds: [],
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function parseRequirements(value: unknown): InstructionRequirement[] {
  if (!Array.isArray(value)) return [];
  const results: InstructionRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!id || !label) continue;
    results.push({
      id,
      label,
      sourceText:
        typeof record.sourceText === "string" ? record.sourceText.trim() : undefined,
    });
  }
  return results;
}

function parseRequirementMappings(value: unknown): RequirementCapabilityMapping[] {
  if (!Array.isArray(value)) return [];
  const results: RequirementCapabilityMapping[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const requirementId =
      typeof record.requirementId === "string" ? record.requirementId.trim() : "";
    const capabilityIds = asStringArray(record.capabilityIds);
    if (!requirementId) continue;
    results.push({ requirementId, capabilityIds, source: "catalog_llm" });
  }
  return results;
}

function parseUnresolvedNeeds(value: unknown): UnresolvedNeedDetail[] {
  if (!Array.isArray(value)) return [];
  const results: UnresolvedNeedDetail[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const requirement =
      typeof record.requirement === "string" ? record.requirement.trim() : "";
    const reason = typeof record.reason === "string" ? record.reason.trim() : "";
    if (!requirement) continue;
    results.push({
      requirement,
      reason: reason || "No dedicated capability was found in the catalog",
    });
  }
  return results;
}
