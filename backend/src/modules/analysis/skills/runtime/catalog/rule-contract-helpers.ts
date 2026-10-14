import type { EvidencePackage } from "../../../models/evidence-package.js";
import type {
  AnalysisSkillConfig,
  ComplianceComposition,
  SkillRegimeRule,
  SkillRegimeRuleInvestigation,
  SkillRegimeRuleSelection,
} from "./types.js";

/**
 * Generic, regime-agnostic helpers for the rule-first compliance requirement
 * contract. Regime-specific citation parsing (e.g. GDPR's `gdpr.artN...`
 * ruleId grammar) lives beside each regime's skill.config.ts instead of here.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "by", "with",
  "this", "that", "must", "may", "shall", "is", "are", "be", "only", "not",
  "its", "their", "other", "any", "when", "where", "if", "under", "upon",
  "from", "as", "at", "than", "such", "into", "which", "who", "each", "does",
  "do", "has", "have", "had", "will", "would", "can", "could", "including",
  "without", "within", "before", "after", "between", "about", "also", "more",
  "all", "these", "those", "were", "was", "been", "being", "so", "no", "not",
]);

/** Baseline lexical vocabulary for BM25/exact matching. Not authoritative on
 * its own — dense retrieval and the bounded LLM review step are the
 * precision backstops for whatever this mechanical extraction misses. */
export function deriveSelectionFromText(label: string, ruleText: string): SkillRegimeRuleSelection {
  const text = `${label} ${ruleText}`;
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
  const concepts = [...new Set(words)].slice(0, 24);
  const actors: string[] = [];
  if (/\bsub-?processors?\b/i.test(text)) actors.push("subprocessor");
  if (/\bprocessors?\b/i.test(text)) actors.push("processor");
  if (/\bcontrollers?\b/i.test(text)) actors.push("controller");
  if (/\bdata subjects?|individuals?|consumers?\b/i.test(text)) actors.push("data_subject");
  if (/\bbusiness associates?\b/i.test(text)) actors.push("business_associate");
  if (/\bcovered entit(?:y|ies)\b/i.test(text)) actors.push("covered_entity");
  if (/\bproviders?\b/i.test(text)) actors.push("provider");
  if (/\bdeployers?\b/i.test(text)) actors.push("deployer");
  if (/\bimporters?\b/i.test(text)) actors.push("importer");
  if (/\bdistributors?\b/i.test(text)) actors.push("distributor");

  const actions: string[] = [];
  const actionPatterns: Array<[RegExp, string]> = [
    [/\bassist(?:ance)?\b/i, "assist"],
    [/\bnotif(?:y|ication)\b/i, "notify"],
    [/\berase|erasure|delet(?:e|ion)\b/i, "erase"],
    [/\brectif/i, "rectify"],
    [/\bportab/i, "port"],
    [/\bobject(?:ion)?\b/i, "object"],
    [/\btransfer/i, "transfer"],
    [/\baudit/i, "audit"],
    [/\baccess\b/i, "access"],
    [/\brestrict/i, "restrict"],
    [/\breturn|destroy\b/i, "return_or_destroy"],
  ];
  for (const [pattern, action] of actionPatterns) if (pattern.test(text)) actions.push(action);

  const objects: string[] = [];
  if (/\bpersonal data|personal information|phi|protected health information\b/i.test(text)) objects.push("regulated_data");
  if (/\brequests?|rights?\b/i.test(text)) objects.push("rights_request");
  if (/\btimeframes?|deadlines?|without undue delay|within\b/i.test(text)) objects.push("timeframe");
  if (/\bsecurity|safeguards?|technical and organi[sz]ational\b/i.test(text)) objects.push("security_measures");

  return {
    aliases: [label.toLowerCase()],
    concepts,
    actors: [...new Set(actors)],
    actions: [...new Set(actions)],
    objects: [...new Set(objects)],
  };
}

export interface FinalizeRegimeRuleContractsOptions {
  /** Stable legal instrument name used in structured authority metadata. */
  instrument: string;
  /** Optional explicit package-requirement to atomic-rule bridge. */
  requirementToRuleId?: Record<string, string>;
  /** Prefer explicitly authored compositions when a regime has them. */
  compositions?: ComplianceComposition[];
}

/**
 * Apply shared defaults and derive package compatibility FROM atomic rules.
 * Missing proof profiles stay missing: the compiler emits baseline_unavailable.
 * This helper must never invent proof elements or copy legal meaning from packages.
 */
export function finalizeRegimeRuleContracts(
  skill: AnalysisSkillConfig,
  options: FinalizeRegimeRuleContractsOptions
): AnalysisSkillConfig {
  const ruleIds = new Set(skill.regimeRules.map(rule => rule.ruleId));
  const regimeRules = skill.regimeRules.map((rule): SkillRegimeRule => {
    const baseSelection = rule.selection ?? deriveSelectionFromText(rule.label ?? rule.ruleId, rule.ruleText);
    const evidenceHints = rule.investigation?.evidenceHints ?? [];
    const selection: SkillRegimeRuleSelection = {
      ...baseSelection,
      aliases: [...new Set([...baseSelection.aliases, ...evidenceHints.map(hint => hint.toLowerCase())])],
      concepts: [...new Set([...baseSelection.concepts,
        ...evidenceHints.flatMap(hint => deriveSelectionFromText(hint, hint).concepts)])].slice(0, 40),
    };
    return {
      ...rule,
      authority: rule.authority ?? {
        instrument: options.instrument, citation: rule.legalHook?.trim() || rule.ruleId,
        provisionPath: [rule.ruleId], citationAliases: [rule.ruleId, ...(rule.legalHook ? [rule.legalHook] : [])],
      },
      selection,
      applicability: rule.applicability ?? {
        documentTypes: skill.appliesToDocTypes, jurisdictions: skill.appliesToJurisdictions,
      },
      investigation: rule.investigation && { ...rule.investigation,
        proofElements: rule.investigation.proofElements.map(element => ({ ...element,
          required: element.kind ? element.kind === "mandatory" || element.kind === "conditional" : element.required })),
      },
      verification: rule.verification ?? { version: "1.0.0", reviewStatus: "authored" },
      legacyRequirementId: rule.legacyRequirementId ?? Object.entries(options.requirementToRuleId ?? {}).find(([,id])=>id===rule.ruleId)?.[0],
    };
  });
  const evidencePackages = skill.evidencePackages?.map(pkg => {
    if ((pkg.kind ?? "evaluation") !== "evaluation") return pkg;
    const requirementEvidence = { ...pkg.requirementEvidence };
    for (const id of pkg.requirementIds) {
      const owners = regimeRules.filter(rule => (rule.legacyRequirementId === id || rule.ruleId === id) && rule.investigation);
      if (!owners.length) continue;
      requirementEvidence[id] = {
        hypothesis: [...new Set(owners.map(rule => rule.investigation!.hypothesis))].join(" "),
        proofStandard: [...new Set(owners.map(rule => rule.investigation!.proofStandard))].join(" "),
        evidenceHints: [...new Set(owners.flatMap(rule => rule.investigation!.evidenceHints))],
      };
    }
    return { ...pkg, requirementEvidence };
  });
  return { ...skill, regimeRules, evidencePackages,
    compositions: options.compositions ?? derivePackageCompositions(skill, ruleIds) };
}

function derivePackageCompositions(
  skill: AnalysisSkillConfig,
  ruleIds: Set<string>
): ComplianceComposition[] {
  const out: ComplianceComposition[] = [];
  for (const pkg of skill.evidencePackages ?? []) {
    if ((pkg.kind ?? "evaluation") !== "evaluation") continue;
    const members = pkg.capabilityIds.filter((id) => ruleIds.has(id));
    if (members.length === 0) continue;
    const label = pkg.label?.trim() || pkg.id;
    out.push({
      id: pkg.id,
      label,
      aliases: [...new Set([label.toLowerCase(), pkg.id.toLowerCase(), ...(pkg.semanticTopics ?? [])])],
      description: pkg.description?.trim() || `Named shortcut for ${label}.`,
      ruleIds: members,
    });
  }
  return out;
}

/**
 * Compatibility helper: derive a legacy `EvidencePackage.requirementEvidence`
 * map FROM atomic rule investigation profiles, so a package never needs its
 * own hand-authored (and inevitably drifting) copy of the same content.
 *
 * `requirementToRuleId` maps this package's PLAN-vocabulary requirement id
 * to the single rule id whose `investigation` profile answers it.
 */
export function deriveRequirementEvidence(
  ruleInvestigation: Record<string, SkillRegimeRuleInvestigation | undefined>,
  requirementToRuleId: Record<string, string>
): NonNullable<EvidencePackage["requirementEvidence"]> {
  const out: NonNullable<EvidencePackage["requirementEvidence"]> = {};
  for (const [requirementId, ruleId] of Object.entries(requirementToRuleId)) {
    const investigation = ruleInvestigation[ruleId];
    if (!investigation) continue;
    out[requirementId] = {
      hypothesis: investigation.hypothesis,
      evidenceHints: investigation.evidenceHints,
      proofStandard: investigation.proofStandard,
    };
  }
  return out;
}
