import type {
  CompletenessCheckItem,
  ExplicitScope,
  InstructionFocus,
  InstructionRequirement,
  RequirementCapabilityMapping,
  ResolutionProvenance,
  ResolutionSource,
  UnresolvedNeedDetail,
} from "../../../models/analysis-plan.js";
import type { IntentRequirement } from "../../../models/intent.js";
import type { AnalysisSkillConfig } from "../catalog/types.js";
import { pacLog, pacWarn } from "../../../utils/pac-log.js";
import {
  buildClauseTypeGlossary,
  buildResolutionCatalog,
  resolveFocusViaCatalog,
  validateAgainstCatalog,
  type ResolutionCandidate,
} from "./build-resolution-catalog.js";
import {
  extractExplicitScope,
  filterIdsByScope,
  capabilityIdMatchesScope,
  ruleIdMatchesScope,
  scopeBoundaryActive,
} from "./extract-explicit-scope.js";

import { normalizeForMatch } from "./normalize-for-match.js";
import { dedupeStrings } from "../../../shared/dedupe.js";
import { matchMetaRequirementBindings } from "../graph/meta-requirement-bindings.js";

export { normalizeForMatch } from "./normalize-for-match.js";

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
    addArticleExpression(numbers, match[1]);
  }

  // Also accept "15 16 17 18 19 20 21 22 article(s) of gdpr" — numbers before the noun.
  const trailingNoun =
    /\b(\d{1,3}(?:(?:\s*(?:-|to|,|and|&)\s*|\s+)\d{1,3}){1,20})\s+articles?\b/g;
  for (const match of normalized.matchAll(trailingNoun)) {
    addArticleExpression(numbers, match[1]);
  }

  return [...numbers].filter(Number.isInteger).sort((a, b) => a - b);
}

function addArticleExpression(numbers: Set<number>, expression: string): void {
  for (const range of expression.matchAll(/(\d{1,3})\s*(?:-|to)\s*(\d{1,3})/g)) {
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

export function phraseMapCompanionRuleIds(
  skills: AnalysisSkillConfig[],
  matrixRowIds: string[]
): string[] {
  if (matrixRowIds.length === 0) return [];
  const matrixSet = new Set(matrixRowIds);
  const out: string[] = [];
  for (const skill of skills) {
    for (const entry of skill.instructionFocusMap ?? []) {
      const mapRows = entry.focus.matrixRowIds ?? [];
      if (mapRows.length === 0) continue;
      if (!mapRows.every((id) => matrixSet.has(id))) continue;
      out.push(...(entry.focus.ruleIds ?? []));
    }
  }
  return dedupeStrings(out);
}

function matrixLinkedSupportingRuleIds(
  skills: AnalysisSkillConfig[],
  matrixRowIds: string[]
): string[] {
  if (matrixRowIds.length === 0) return [];
  const matrixSet = new Set(matrixRowIds);
  const out: string[] = [];
  for (const skill of skills) {
    for (const rule of skill.regimeRules ?? []) {
      const linked = rule.matrixLinkage?.matrixRowIds ?? [];
      if (linked.length === 0) continue;
      if (!linked.some((id) => matrixSet.has(id))) continue;
      // 1:1 row linkage is the matrix evaluator itself — do not also schedule the rule.
      if (linked.length === 1) continue;
      // Cross-cutting linkage only when every linked row is in focus (do not broaden).
      if (!linked.every((id) => matrixSet.has(id))) continue;
      out.push(rule.ruleId);
    }
  }
  return dedupeStrings([...out, ...phraseMapCompanionRuleIds(skills, matrixRowIds)]);
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
  skills: AnalysisSkillConfig[],
  explicitScope?: ExplicitScope
): Pick<InstructionFocus, "ruleIds" | "matrixRowIds" | "riskCategoryIds"> | undefined {
  const requested = extractArticleNumbers(instruction);
  if (requested.length === 0 && !explicitScope?.subsections?.length) return undefined;
  const requestedSet = new Set(
    explicitScope && scopeBoundaryActive(explicitScope)
      ? explicitScope.articles
      : requested
  );
  if (requestedSet.size === 0) return undefined;

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

  const scopedRules = explicitScope
    ? directlyEvaluatedRules.filter((rule) =>
        ruleIdMatchesScope(rule.ruleId, explicitScope)
      )
    : directlyEvaluatedRules;

  return {
    ruleIds: dedupeStrings(scopedRules.map((rule) => rule.ruleId)),
    matrixRowIds: dedupeStrings(rows.map((row) => row.rowId)),
    riskCategoryIds: dedupeStrings(
      scopedRules.map((rule) => rule.findingCategory)
    ),
  };
}

const RESTRICTED_SCOPE_RE =
  /\b(?:only|nothing more(?:\s+than)?(?:\s+that)?|no more than that|limited to|exclusively)\b/i;

/**
 * Strong explicit signals that can shrink the catalog LLM prompt without
 * changing meaning: article numbers, instructionFocusMap phrase hits, or
 * "only/limited to" restriction. Package siblings of any matched capability
 * are included so grouped evaluation still sees the full package.
 */
export function collectStrongCatalogShortlist(
  instruction: string,
  skills: AnalysisSkillConfig[],
  explicitScope?: ExplicitScope,
  catalog?: ResolutionCandidate[]
): { strong: boolean; ids: Set<string> } {
  const haystack = normalizeForMatch(instruction);
  const ids = new Set<string>();
  const articleFocus = explicitArticleFocus(instruction, skills, explicitScope);
  if (articleFocus) {
    for (const id of articleFocus.ruleIds ?? []) ids.add(id);
    for (const id of articleFocus.matrixRowIds ?? []) ids.add(id);
    for (const id of articleFocus.riskCategoryIds ?? []) ids.add(id);
  }
  for (const skill of skills) {
    for (const entry of skill.instructionFocusMap ?? []) {
      if (!entry.triggerPhrases.some((p) => containsPhrase(haystack, p))) continue;
      for (const id of entry.focus.ruleIds ?? []) ids.add(id);
      for (const id of entry.focus.matrixRowIds ?? []) ids.add(id);
      for (const id of entry.focus.riskCategoryIds ?? []) ids.add(id);
    }
  }
  const restricted = RESTRICTED_SCOPE_RE.test(instruction);
  const strong = ids.size > 0 || restricted;
  if (!strong) return { strong: false, ids };

  if (explicitScope && scopeBoundaryActive(explicitScope) && catalog) {
    for (const id of [...ids]) {
      if (!filterIdsByScope([id], explicitScope, catalog).length) ids.delete(id);
    }
  }

  for (const skill of skills) {
    for (const pkg of skill.evidencePackages ?? []) {
      if (
        pkg.capabilityIds.some((id) => ids.has(id)) ||
        pkg.requirementIds.some((id) => ids.has(id))
      ) {
        ids.add(pkg.id);
        for (const id of pkg.capabilityIds) {
          if (
            explicitScope &&
            scopeBoundaryActive(explicitScope) &&
            catalog &&
            !capabilityIdMatchesScope(id, explicitScope, catalog)
          ) {
            continue;
          }
          ids.add(id);
        }
      }
    }
  }
  return { strong: true, ids };
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
  {
    id: "international_data_transfer",
    label: "International data transfers",
    pattern:
      /\binternational (?:data )?transfers?\b|\bcross-border transfers?\b|\bthird countr/i,
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
    const mappedCapabilityIds = dedupeStrings(
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

function applyAuthoredMetaBindings(args: {
  requirements: InstructionRequirement[];
  requirementMappings: RequirementCapabilityMapping[];
  skills: AnalysisSkillConfig[];
  intentRequirements?: IntentRequirement[];
  validCatalogSet: Set<string>;
  catalog: ResolutionCandidate[];
}): { ruleIds: string[]; matrixRowIds: string[]; riskCategoryIds: string[] } {
  const typeById = new Map(
    (args.intentRequirements ?? []).map((req) => [req.id, req.type])
  );
  const ruleIds: string[] = [];
  const matrixRowIds: string[] = [];
  const riskCategoryIds: string[] = [];
  for (const req of args.requirements) {
    const extra = matchMetaRequirementBindings(
      {
        id: req.id,
        label: req.label,
        type: typeById.get(req.id),
      },
      args.skills
    ).filter((id) => args.validCatalogSet.has(id));
    if (extra.length === 0) continue;
    const existing = args.requirementMappings.find(
      (mapping) => mapping.requirementId === req.id
    );
    if (existing) {
      existing.capabilityIds = dedupeStrings([
        ...existing.capabilityIds,
        ...extra,
      ]);
    } else {
      args.requirementMappings.push({
        requirementId: req.id,
        capabilityIds: extra,
        source: "phrase_map",
      });
    }
    for (const id of extra) {
      const kind = kindOfId(id, args.catalog);
      if (kind === "rule") ruleIds.push(id);
      else if (kind === "matrix_row") matrixRowIds.push(id);
      else if (kind === "risk_category") riskCategoryIds.push(id);
    }
  }
  return {
    ruleIds: dedupeStrings(ruleIds),
    matrixRowIds: dedupeStrings(matrixRowIds),
    riskCategoryIds: dedupeStrings(riskCategoryIds),
  };
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
  options: {
    riskAnalysisRequested?: boolean;
    intentRequirements?: IntentRequirement[];
  } = {}
): Promise<InstructionFocus | undefined> {
  const riskAnalysisRequested = options.riskAnalysisRequested === true;
  const haystack = normalizeForMatch(instruction);
  if (!haystack) return undefined;

  const explicitScope = extractExplicitScope(instruction);
  const catalog = buildResolutionCatalog(skills);
  const clauseTypeGlossary = buildClauseTypeGlossary(skills);
  const shortlist = collectStrongCatalogShortlist(
    instruction,
    skills,
    explicitScope,
    catalog
  );
  pacLog("catalog prefilter", {
    full: catalog.length,
    strong: shortlist.strong,
    fullTextIds: shortlist.ids.size,
    scopeArticles: explicitScope.articles,
    scopeSubsections: explicitScope.subsections?.length ?? 0,
    contextArticles: explicitScope.contextArticles,
  });
  const catalogResult = await resolveFocusViaCatalog(
    instruction,
    catalog,
    clauseTypeGlossary,
    shortlist.strong && shortlist.ids.size > 0 ? shortlist.ids : undefined,
    options.intentRequirements,
    explicitScope
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

  const articleFocus = explicitArticleFocus(instruction, skills, explicitScope);
  const isExplicitlyRestricted = RESTRICTED_SCOPE_RE.test(instruction);

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

  const supportingPhraseRuleIds = filterIdsByScope(
    (isExplicitlyRestricted
      ? phraseRuleIds.filter((id) => explicitIds.has(id))
      : phraseRuleIds
    ).filter((id) => ruleIdMatchesScope(id, explicitScope)),
    explicitScope,
    catalog
  );
  const supportingPhraseMatrixRowIds = filterIdsByScope(
    isExplicitlyRestricted
      ? phraseMatrixRowIds.filter((id) => explicitIds.has(id))
      : phraseMatrixRowIds,
    explicitScope,
    catalog
  );
  const supportingPhraseRiskCategoryIds = isExplicitlyRestricted
    ? phraseRiskCategoryIds.filter((id) => explicitIds.has(id))
    : phraseRiskCategoryIds;

  const catalogRuleIds = filterIdsByScope(
    catalogValidIds.filter((id) => kindOfId(id, catalog) === "rule"),
    explicitScope,
    catalog
  );
  const catalogMatrixRowIds = filterIdsByScope(
    catalogValidIds.filter((id) => kindOfId(id, catalog) === "matrix_row"),
    explicitScope,
    catalog
  );
  const catalogRiskCategoryIds = catalogValidIds.filter(
    (id) => kindOfId(id, catalog) === "risk_category"
  );
  const catalogPackageIds = filterIdsByScope(
    catalogValidIds.filter((id) => kindOfId(id, catalog) === "package"),
    explicitScope,
    catalog
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
  const scopedCatalogRequiredIds = filterIdsByScope(catalogRequiredIds, explicitScope, catalog);
  const scopedCatalogSupportingIds = filterIdsByScope(
    catalogSupportingIds,
    explicitScope,
    catalog
  );

  addProvenance(
    provenance,
    catalogPackageIds,
    "catalog_llm",
    true,
    catalog,
    catalogResult.reasoning ?? "analysis package selected by semantic resolution",
    "package"
  );
  addProvenance(
    provenance,
    scopedCatalogRequiredIds,
    "catalog_llm",
    true,
    catalog,
    catalogResult.reasoning ?? "required by semantic instruction resolution"
  );
  addProvenance(
    provenance,
    scopedCatalogSupportingIds,
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

  const requiredIds = dedupeStrings(
    [...provenance.values()].filter((item) => item.required).map((item) => item.id)
  );
  const supportingIds = dedupeStrings(
    [...provenance.values()].filter((item) => !item.required).map((item) => item.id)
  );

  const executionIds = isExplicitlyRestricted
    ? requiredIds
    : dedupeStrings([...requiredIds, ...supportingIds]);
  const executionSet = new Set(executionIds);

  const combinedMatrixRowIds = dedupeStrings(
    [
      ...explicitMatrixRowIds,
      ...catalogMatrixRowIds,
      ...supportingPhraseMatrixRowIds.filter(
        (id) =>
          !scopedCatalogRequiredIds.includes(id) && !scopedCatalogSupportingIds.includes(id)
      ),
    ].filter((id) => executionSet.has(id))
  );
  // Matrix-linked assistance/timeframe rules (e.g. Art 28(3)(e) on a DSR package)
  // stay evaluable even when the user named only Articles 15–22.
  const matrixLinkedRules = matrixLinkedSupportingRuleIds(skills, combinedMatrixRowIds);
  addProvenance(
    provenance,
    matrixLinkedRules,
    "phrase_map",
    false,
    catalog,
    "matrix-linked supporting rule for focused rights rows",
    "rule"
  );
  const combinedRuleIds = dedupeStrings([
    ...[
      ...explicitRuleIds,
      ...catalogRuleIds,
      ...supportingPhraseRuleIds.filter(
        (id) =>
          !scopedCatalogRequiredIds.includes(id) && !scopedCatalogSupportingIds.includes(id)
      ),
    ].filter((id) => executionSet.has(id)),
    ...matrixLinkedRules,
  ]);
  const combinedRiskCategoryIds = dedupeStrings(
    [
      ...explicitRiskCategoryIds,
      ...catalogRiskCategoryIds,
      ...supportingPhraseRiskCategoryIds.filter(
        (id) =>
          !scopedCatalogRequiredIds.includes(id) && !scopedCatalogSupportingIds.includes(id)
      ),
    ].filter((id) => executionSet.has(id))
  );

  const requirements =
    catalogResult.requirements.length > 0
      ? catalogResult.requirements
      : options.intentRequirements && options.intentRequirements.length > 0
        ? options.intentRequirements.map((req) => ({
            id: req.id,
            label: req.description,
            sourceText: req.description,
          }))
        : extractRequirementsHeuristic(instruction);

  const requirementMappings = catalogResult.requirementMappings.map((mapping) => ({
    ...mapping,
    capabilityIds: mapping.capabilityIds.filter((id) => validCatalogSet.has(id)),
  }));

  const metaBound = applyAuthoredMetaBindings({
    requirements,
    requirementMappings,
    skills,
    intentRequirements: options.intentRequirements,
    validCatalogSet,
    catalog,
  });

  const unresolvedNeedDetails = catalogResult.unresolvedNeeds.filter(
    (item) =>
      !requirementMappings.some(
        (mapping) =>
          mapping.requirementId === item.requirement && mapping.capabilityIds.length > 0
      )
  );
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
    combinedRiskCategoryIds.length > 0 ||
    catalogPackageIds.length > 0 ||
    metaBound.ruleIds.length > 0 ||
    metaBound.matrixRowIds.length > 0 ||
    metaBound.riskCategoryIds.length > 0;

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
    ruleIds: dedupeStrings([...combinedRuleIds, ...metaBound.ruleIds]),
    matrixRowIds: dedupeStrings([...combinedMatrixRowIds, ...metaBound.matrixRowIds]),
    riskCategoryIds: dedupeStrings([
      ...combinedRiskCategoryIds,
      ...metaBound.riskCategoryIds,
    ]),
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
    selectedPackageIds: catalogPackageIds,
    explicitScope,
  };
}
