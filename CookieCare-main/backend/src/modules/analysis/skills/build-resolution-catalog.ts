import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../llm/index.js";
import type {
  InstructionRequirement,
  RequirementCapabilityMapping,
  UnresolvedNeedDetail,
} from "../models/analysis-plan.js";
import type { AnalysisSkillConfig } from "./types.js";
import { pacWarn } from "../utils/pac-log.js";

export interface ResolutionCandidate {
  id: string;
  kind: "rule" | "matrix_row" | "risk_category";
  label: string;
  skillId: string;
  /** Semantic substance the candidate covers (rule text / matrix article / risk guidance). */
  description?: string;
  /** Clause types a rule applies to; interpreted via the clause-type glossary. */
  applicableClauseTypes?: string[];
  checkType?: string;
  legalHook?: string;
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
  clauseTypeGlossary: Map<string, string> = new Map()
): Promise<CatalogResolutionResult> {
  if (catalog.length === 0) {
    return emptyCatalogResult();
  }

  try {
    const raw = (await executeJsonCompletion(
      [
        "Analyze this document-analysis instruction in two steps:",
        "",
        "STEP 1 — Extract semantic requirements:",
        "List every distinct thing the user wants established, verified, or assessed.",
        "Use snake_case ids (e.g. subject_matter, clause_adequacy, mandatory_article_28_3_clauses).",
        "Each requirement must be a semantic ask, not just a keyword or article number.",
        "Include completeness/presence/adequacy asks when the user asks to verify, check, or assess.",
        "",
        "STEP 2 — Map requirements to catalog capabilities:",
        "The candidate catalog below is the complete universe of selectable capabilities.",
        "Select every catalog candidate needed to fully satisfy the instruction.",
        "Reason over each candidate's full description, not just its label — the user may express requirements in different words.",
        "A single candidate description often enumerates several sub-requirements; when it does, use that one candidate to satisfy all of those user requirements (e.g. a rule whose description lists subject matter, duration, nature, purpose, data categories, data-subject categories, and controller obligations covers each of those as one capability).",
        "Map a fine-grained requirement to a broad rule whenever that rule's description already covers it. Do not report a requirement as unresolved if any candidate description covers it.",
        "Use the clause-type glossary to interpret each rule's clauseTypes as additional semantic context.",
        "Put directly required capabilities in requiredIds.",
        "Put contextual or adjacent capabilities in supportingIds (e.g. Article 29 when user asked for Article 28).",
        "For each requirement, list which capability ids satisfy it in requirementMappings.",
        "Only return ids that appear in the candidate list. Never invent, rename, or derive an id.",
        "If a requirement cannot be satisfied by any catalog candidate, add it to unresolvedNeeds with a short reason.",
        "",
        renderClauseTypeGlossary(clauseTypeGlossary),
        `Candidates:\n${catalog.map(renderCandidate).join("\n\n")}`,
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

    const requirements = parseRequirements(raw.requirements);
    const selectedIds = asStringArray(raw.selectedIds);
    const requiredIds = asStringArray(raw.requiredIds);
    const supportingIds = asStringArray(raw.supportingIds);
    const requirementMappings = parseRequirementMappings(raw.requirementMappings);
    const unresolvedNeeds = parseUnresolvedNeeds(raw.unresolvedNeeds);

    return {
      requirements,
      selectedIds: dedupe([...selectedIds, ...requiredIds, ...supportingIds]),
      requiredIds,
      supportingIds,
      requirementMappings,
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

function renderCandidate(candidate: ResolutionCandidate): string {
  const lines: string[] = [
    `- id: ${candidate.id}  (${candidate.kind}, skill: ${candidate.skillId})`,
    `  label: ${candidate.label}`,
  ];
  if (candidate.description) {
    lines.push(`  description: ${candidate.description}`);
  }
  if (candidate.applicableClauseTypes && candidate.applicableClauseTypes.length > 0) {
    lines.push(`  clauseTypes: ${candidate.applicableClauseTypes.join(", ")}`);
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

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
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
