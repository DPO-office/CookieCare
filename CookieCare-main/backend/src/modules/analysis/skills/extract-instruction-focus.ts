import type {
  CompletenessCheckItem,
  InstructionFocus,
  InstructionRequirement,
  RequirementCapabilityMapping,
  ResolutionProvenance,
  ResolutionSource,
  UnresolvedNeedDetail,
} from "../models/analysis-plan.js";
import type { AnalysisSkillConfig } from "./types.js";
import { pacWarn } from "../utils/pac-log.js";
import {
  buildClauseTypeGlossary,
  buildResolutionCatalog,
  resolveFocusViaCatalog,
  validateAgainstCatalog,
  type ResolutionCandidate,
} from "./build-resolution-catalog.js";

/** Shared normalization for all deterministic instruction-focus matching. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = normalizeForMatch(phrase);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;

  if (/^\d+\s*-\s*\d+$/.test(needle)) {
    const [a, b] = needle.split("-").map((s) => s.trim());
    if (haystack.includes(`${a} to ${b}`) || haystack.includes(`${a}-${b}`)) return true;
    const numbers = new Set(haystack.match(/\b\d+\b/g) ?? []);
    const start = Number(a);
    const end = Number(b);
    if (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      Array.from({ length: end - start + 1 }, (_, index) => String(start + index)).every(
        (value) => numbers.has(value)
      )
    ) {
      return true;
    }
  }
  return false;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Parse article references after an explicit "article(s)" / "art(s)" marker.
 * Supports ranges, comma lists, whitespace lists, and "and"/"&"-joined lists.
 */
export function extractArticleNumbers(instruction: string): number[] {
  const normalized = normalizeForMatch(instruction);
  const numbers = new Set<number>();
  const reference =
    /\b(?:articles?|arts?)\.?\s*(\d{1,3}(?:(?:\s*(?:-|to|,|and|&)\s*|\s+)\d{1,3})*)/g;

  for (const match of normalized.matchAll(reference)) {
    const expression = match[1];
    for (const range of expression.matchAll(
      /(\d{1,3})\s*(?:-|to)\s*(\d{1,3})/g
    )) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end >= start && end - start <= 100) {
        for (let article = start; article <= end; article++) numbers.add(article);
      }
    }

    for (const token of expression.match(/\d{1,3}/g) ?? []) {
      numbers.add(Number(token));
    }
  }

  return [...numbers].filter(Number.isInteger).sort((a, b) => a - b);
}

function articleNumberFromRuleId(ruleId: string): number | undefined {
  const match = ruleId.match(/(?:^|\.)art(\d{1,3})(?:\.|$)/i);
  return match ? Number(match[1]) : undefined;
}

function articleNumberFromMatrixArticle(article: string): number | undefined {
  const match = article.match(/\d{1,3}/);
  return match ? Number(match[0]) : undefined;
}

function explicitArticleFocus(
  instruction: string,
  skills: AnalysisSkillConfig[]
): Pick<InstructionFocus, "ruleIds" | "matrixRowIds" | "riskCategoryIds"> | undefined {
  const requested = extractArticleNumbers(instruction);
  if (requested.length === 0) return undefined;
  const requestedSet = new Set(requested);

  const rules = skills
    .flatMap((skill) => skill.regimeRules)
    .filter((rule) => requestedSet.has(articleNumberFromRuleId(rule.ruleId) ?? -1));
  const rows = skills
    .flatMap((skill) => skill.rightsMatrixRows ?? [])
    .filter((row) =>
      requestedSet.has(articleNumberFromMatrixArticle(row.article) ?? -1)
    );
  const matrixArticles = new Set(
    rows
      .map((row) => articleNumberFromMatrixArticle(row.article))
      .filter((article): article is number => article !== undefined)
  );
  const directlyEvaluatedRules = rules.filter(
    (rule) => !matrixArticles.has(articleNumberFromRuleId(rule.ruleId) ?? -1)
  );

  if (rules.length === 0 && rows.length === 0) return undefined;

  return {
    ruleIds: dedupe(directlyEvaluatedRules.map((rule) => rule.ruleId)),
    matrixRowIds: dedupe(rows.map((row) => row.rowId)),
    riskCategoryIds: dedupe(
      directlyEvaluatedRules.map((rule) => rule.findingCategory)
    ),
  };
}

const HEURISTIC_REQUIREMENT_PATTERNS: Array<{
  id: string;
  label: string;
  pattern: RegExp;
}> = [
  { id: "subject_matter", label: "Subject matter of processing", pattern: /\bsubject matter\b/i },
  { id: "duration", label: "Duration of processing", pattern: /\bduration\b/i },
  {
    id: "nature_and_purpose",
    label: "Nature and purpose of processing",
    pattern: /\bnature and purpose\b|\bnature\b.*\bpurpose\b/i,
  },
  {
    id: "categories_of_data",
    label: "Categories of personal data",
    pattern: /\bcategor(?:y|ies) of (?:personal )?data\b|\bdata categor/i,
  },
  {
    id: "categories_of_data_subjects",
    label: "Categories of data subjects",
    pattern: /\bcategor(?:y|ies) of data subjects\b|\bdata subject categor/i,
  },
  {
    id: "controller_obligations_and_rights",
    label: "Controller obligations and rights",
    pattern: /\bcontroller(?:'s)? (?:obligations|rights)\b|\bcontroller obligations and rights\b/i,
  },
  {
    id: "mandatory_article_28_3_clauses",
    label: "Mandatory Article 28(3) clauses",
    pattern: /\bmandatory\b.*\barticle\s*28\s*\(\s*3\s*\)|\barticle\s*28\s*\(\s*3\s*\)\s*\([a-h]\)/i,
  },
  {
    id: "clause_adequacy",
    label: "Clause adequacy assessment",
    pattern: /\badequa(?:cy|te)\b|\bassess(?:ment)?\b.*\b(?:adequa|sufficient|appropriate)\b/i,
  },
  {
    id: "data_subject_rights",
    label: "Data subject rights",
    pattern: /\bdata subject rights?\b|\barticles?\s*15\s*[-–—to]+\s*22\b/i,
  },
];

/** Deterministic fallback when catalog LLM does not return requirements. */
export function extractRequirementsHeuristic(instruction: string): InstructionRequirement[] {
  const requirements: InstructionRequirement[] = [];
  for (const entry of HEURISTIC_REQUIREMENT_PATTERNS) {
    const match = instruction.match(entry.pattern);
    if (!match) continue;
    requirements.push({
      id: entry.id,
      label: entry.label,
      sourceText: match[0],
    });
  }
  return requirements;
}

function kindOfId(
  id: string,
  catalog: ResolutionCandidate[]
): ResolutionProvenance["kind"] | undefined {
  return catalog.find((candidate) => candidate.id === id)?.kind;
}

function addProvenance(
  provenance: Map<string, ResolutionProvenance>,
  ids: string[],
  source: ResolutionSource,
  required: boolean,
  catalog: ResolutionCandidate[],
  reason?: string,
  kindHint?: ResolutionProvenance["kind"]
): void {
  for (const id of ids) {
    if (!id) continue;
    const existing = provenance.get(id);
    if (existing) {
      if (required && !existing.required) existing.required = true;
      if (source === "explicit_number" || (source === "catalog_llm" && required)) {
        existing.source = source;
      }
      continue;
    }
    const kind = kindOfId(id, catalog) ?? kindHint;
    if (!kind) continue;
    provenance.set(id, { id, kind, source, required, reason });
  }
}

function buildCompletenessCheck(
  requirements: InstructionRequirement[],
  mappings: RequirementCapabilityMapping[],
  unresolved: UnresolvedNeedDetail[],
  validCatalogIds: Set<string>,
  explicitRequiredIds: Set<string>
): CompletenessCheckItem[] {
  return requirements.map((requirement) => {
    const unresolvedItem = unresolved.find(
      (item) =>
        item.requirement === requirement.id ||
        item.requirement === requirement.label ||
        item.requirement.toLowerCase() === requirement.id.replace(/_/g, " ")
    );
    if (unresolvedItem) {
      return {
        requirementId: requirement.id,
        label: requirement.label,
        status: "missing",
        mappedCapabilityIds: [],
        reason: unresolvedItem.reason,
      };
    }

    const mapping = mappings.find((item) => item.requirementId === requirement.id);
    const mappedCapabilityIds = dedupe(
      (mapping?.capabilityIds ?? []).filter((id) => validCatalogIds.has(id))
    );

    const explicitHits = mappedCapabilityIds.filter((id) => explicitRequiredIds.has(id));
    if (mappedCapabilityIds.length === 0) {
      return {
        requirementId: requirement.id,
        label: requirement.label,
        status: "missing",
        mappedCapabilityIds: [],
        reason: "No capability mapped to this requirement",
      };
    }

    if (explicitHits.length > 0 && mappedCapabilityIds.length > explicitHits.length) {
      return {
        requirementId: requirement.id,
        label: requirement.label,
        status: "covered",
        mappedCapabilityIds,
      };
    }

    return {
      requirementId: requirement.id,
      label: requirement.label,
      status: mappedCapabilityIds.length > 0 ? "covered" : "partial",
      mappedCapabilityIds,
      reason:
        mappedCapabilityIds.length > 0 ? undefined : "Partial capability coverage only",
    };
  });
}

/**
 * Closed-catalog instruction focus:
 * 1. Catalog LLM extracts semantic requirements and selects capabilities (primary).
 * 2. Explicit article references are hard required signals.
 * 3. Phrase-map is supporting/compatibility only — never decides meaning alone.
 */
export async function extractInstructionFocus(
  instruction: string,
  skills: AnalysisSkillConfig[],
  options: { riskAnalysisRequested?: boolean } = {}
): Promise<InstructionFocus | undefined> {
  const riskAnalysisRequested = options.riskAnalysisRequested === true;
  const haystack = normalizeForMatch(instruction);
  if (!haystack) return undefined;

  const catalog = buildResolutionCatalog(skills);
  const clauseTypeGlossary = buildClauseTypeGlossary(skills);
  const catalogResult = await resolveFocusViaCatalog(
    instruction,
    catalog,
    clauseTypeGlossary
  );
  const { valid: catalogValidIds, dropped } = validateAgainstCatalog(
    catalogResult.selectedIds,
    catalog,
    instruction
  );
  const validCatalogSet = new Set(catalogValidIds);

  const catalogRequiredIds = catalogResult.requiredIds.filter((id) => validCatalogSet.has(id));
  const catalogSupportingIds = catalogResult.supportingIds.filter((id) =>
    validCatalogSet.has(id)
  );

  const articleFocus = explicitArticleFocus(instruction, skills);
  const isExplicitlyRestricted =
    /\b(?:only|nothing more(?:\s+than)?(?:\s+that)?|no more than that|limited to|exclusively)\b/i.test(
      instruction
    );

  const phraseRuleIds: string[] = [];
  const phraseMatrixRowIds: string[] = [];
  const phraseRiskCategoryIds: string[] = [];
  let phraseMatched = false;

  for (const skill of skills) {
    for (const entry of skill.instructionFocusMap ?? []) {
      if (!entry.triggerPhrases.some((p) => containsPhrase(haystack, p))) continue;
      phraseMatched = true;
      phraseRuleIds.push(...(entry.focus.ruleIds ?? []));
      phraseMatrixRowIds.push(...(entry.focus.matrixRowIds ?? []));
      phraseRiskCategoryIds.push(...(entry.focus.riskCategoryIds ?? []));
    }
  }

  const explicitRuleIds = articleFocus?.ruleIds ?? [];
  const explicitMatrixRowIds = articleFocus?.matrixRowIds ?? [];
  const explicitRiskCategoryIds = articleFocus?.riskCategoryIds ?? [];
  const explicitIds = new Set([
    ...explicitRuleIds,
    ...explicitMatrixRowIds,
    ...explicitRiskCategoryIds,
  ]);

  const supportingPhraseRuleIds = isExplicitlyRestricted
    ? phraseRuleIds.filter((id) => explicitIds.has(id))
    : phraseRuleIds;
  const supportingPhraseMatrixRowIds = isExplicitlyRestricted
    ? phraseMatrixRowIds.filter((id) => explicitIds.has(id))
    : phraseMatrixRowIds;
  const supportingPhraseRiskCategoryIds = isExplicitlyRestricted
    ? phraseRiskCategoryIds.filter((id) => explicitIds.has(id))
    : phraseRiskCategoryIds;

  const catalogRuleIds = catalogValidIds.filter((id) => kindOfId(id, catalog) === "rule");
  const catalogMatrixRowIds = catalogValidIds.filter(
    (id) => kindOfId(id, catalog) === "matrix_row"
  );
  const catalogRiskCategoryIds = catalogValidIds.filter(
    (id) => kindOfId(id, catalog) === "risk_category"
  );

  const provenance = new Map<string, ResolutionProvenance>();
  addProvenance(
    provenance,
    explicitRuleIds,
    "explicit_number",
    true,
    catalog,
    "explicit article reference",
    "rule"
  );
  addProvenance(
    provenance,
    explicitMatrixRowIds,
    "explicit_number",
    true,
    catalog,
    "explicit article reference",
    "matrix_row"
  );
  // Referencing a legal article (e.g. "Article 28") must NOT auto-promote every
  // related risk-category detector to a required capability. For a pure
  // compliance_check the legal rules carry the requirement; risk categories stay
  // supporting/available unless the user actually asked for risk analysis. They
  // are still resolved (not dropped from the catalog) — only their PLAN selection
  // priority changes.
  addProvenance(
    provenance,
    explicitRiskCategoryIds,
    "explicit_number",
    riskAnalysisRequested,
    catalog,
    riskAnalysisRequested
      ? "explicit article reference with requested risk analysis"
      : "related risk category (supporting; risk analysis not explicitly requested)",
    "risk_category"
  );
  addProvenance(
    provenance,
    catalogRequiredIds,
    "catalog_llm",
    true,
    catalog,
    catalogResult.reasoning ?? "required by semantic instruction resolution"
  );
  addProvenance(
    provenance,
    catalogSupportingIds,
    "catalog_llm",
    false,
    catalog,
    catalogResult.reasoning ?? "supporting semantic context"
  );
  addProvenance(
    provenance,
    supportingPhraseRuleIds,
    "phrase_map",
    false,
    catalog,
    "authored phrase map (supporting signal)",
    "rule"
  );
  addProvenance(
    provenance,
    supportingPhraseMatrixRowIds,
    "phrase_map",
    false,
    catalog,
    "authored phrase map (supporting signal)",
    "matrix_row"
  );
  addProvenance(
    provenance,
    supportingPhraseRiskCategoryIds,
    "phrase_map",
    false,
    catalog,
    "authored phrase map (supporting signal)",
    "risk_category"
  );

  const requiredIds = dedupe(
    [...provenance.values()].filter((item) => item.required).map((item) => item.id)
  );
  const supportingIds = dedupe(
    [...provenance.values()].filter((item) => !item.required).map((item) => item.id)
  );

  const executionIds = isExplicitlyRestricted
    ? requiredIds
    : dedupe([...requiredIds, ...supportingIds]);
  const executionSet = new Set(executionIds);

  const combinedRuleIds = dedupe(
    [
      ...explicitRuleIds,
      ...catalogRuleIds,
      ...supportingPhraseRuleIds.filter(
        (id) => !catalogRequiredIds.includes(id) && !catalogSupportingIds.includes(id)
      ),
    ].filter((id) => executionSet.has(id))
  );
  const combinedMatrixRowIds = dedupe(
    [
      ...explicitMatrixRowIds,
      ...catalogMatrixRowIds,
      ...supportingPhraseMatrixRowIds.filter(
        (id) => !catalogRequiredIds.includes(id) && !catalogSupportingIds.includes(id)
      ),
    ].filter((id) => executionSet.has(id))
  );
  const combinedRiskCategoryIds = dedupe(
    [
      ...explicitRiskCategoryIds,
      ...catalogRiskCategoryIds,
      ...supportingPhraseRiskCategoryIds.filter(
        (id) => !catalogRequiredIds.includes(id) && !catalogSupportingIds.includes(id)
      ),
    ].filter((id) => executionSet.has(id))
  );

  const requirements =
    catalogResult.requirements.length > 0
      ? catalogResult.requirements
      : extractRequirementsHeuristic(instruction);

  const requirementMappings = catalogResult.requirementMappings.map((mapping) => ({
    ...mapping,
    capabilityIds: mapping.capabilityIds.filter((id) => validCatalogSet.has(id)),
  }));

  const unresolvedNeedDetails = catalogResult.unresolvedNeeds;
  const completenessCheck = buildCompletenessCheck(
    requirements,
    requirementMappings,
    unresolvedNeedDetails,
    validCatalogSet,
    new Set(requiredIds)
  );

  const hasExecutionIds =
    combinedRuleIds.length > 0 ||
    combinedMatrixRowIds.length > 0 ||
    combinedRiskCategoryIds.length > 0;

  if (!hasExecutionIds && unresolvedNeedDetails.length === 0 && requirements.length === 0) {
    if (!phraseMatched && !articleFocus) {
      const mappedSkillIds = skills
        .filter((skill) => (skill.instructionFocusMap?.length ?? 0) > 0)
        .map((skill) => skill.skillId);
      if (mappedSkillIds.length > 0) {
        pacWarn("focus map present but no match — running full skill", {
          skills: mappedSkillIds,
          instruction,
        });
      }
    }
    return undefined;
  }

  return {
    ruleIds: combinedRuleIds,
    matrixRowIds: combinedMatrixRowIds,
    riskCategoryIds: combinedRiskCategoryIds,
    instructionText: instruction,
    requirements,
    requiredCapabilities: requiredIds,
    supportingCapabilities: supportingIds.filter((id) => !requiredIds.includes(id)),
    requirementMappings,
    completenessCheck,
    requiredIds,
    supportingIds: supportingIds.filter((id) => !requiredIds.includes(id)),
    unresolvedNeeds: unresolvedNeedDetails.map((item) => item.requirement),
    unresolvedNeedDetails,
    droppedCandidateIds: dropped,
    provenance: [...provenance.values()],
  };
}
