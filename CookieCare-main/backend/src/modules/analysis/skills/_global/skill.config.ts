import type { AnalysisSkillConfig } from "../types.js";

/**
 * Always-active global baseline. Selection hardcodes inclusion — no trigger matching.
 */
export const globalSkill: AnalysisSkillConfig = {
  skillId: "_global",
  axis: "global",
  label: "General Contract Review",
  version: "1.0.0",
  appliesToDocTypes: [],
  triggerPhrases: [],
  promptLibraryIds: ["general-review", "_global"],
  clauseTypes: [
    "indemnity",
    "limitation_of_liability",
    "termination",
    "governing_law",
    "confidentiality",
    "payment",
    "dispute_resolution",
    "assignment",
    "force_majeure",
    "warranties",
  ],
  clauseTypeDefinitions: {
    indemnity: "Obligation to indemnify or hold harmless for third-party claims.",
    limitation_of_liability: "Cap or exclusion of liability between the parties.",
    termination: "Rights and process to end the agreement.",
    governing_law: "Choice of law and/or forum.",
  },
  expectedClauses: [
    {
      clauseType: "limitation_of_liability",
      severityIfMissing: "high",
      findingCategory: "missing_limitation_of_liability",
      textSynonyms: ["limitation of liability", "liability shall not exceed", "cap on liability"],
    },
    {
      clauseType: "indemnity",
      severityIfMissing: "high",
      findingCategory: "missing_indemnity",
      textSynonyms: ["indemnif", "hold harmless"],
    },
    {
      clauseType: "termination",
      severityIfMissing: "medium",
      findingCategory: "other_known_risk",
      textSynonyms: ["terminat", "notice period"],
    },
    {
      clauseType: "governing_law",
      severityIfMissing: "medium",
      findingCategory: "other_known_risk",
      textSynonyms: ["governing law", "jurisdiction"],
    },
  ],
  riskCategories: [
    { category: "uncapped_liability", displayLabel: "Uncapped liability", guidance: "Liability is unlimited or effectively uncapped." },
    { category: "one_sided_indemnity", displayLabel: "One-sided indemnity", guidance: "Indemnity obligations fall disproportionately on one party." },
    { category: "unilateral_termination", displayLabel: "Unilateral termination right", guidance: "Termination rights favor one party without reciprocal rights." },
    { category: "ambiguous_definition", displayLabel: "Ambiguous definition or obligation", guidance: "Defined terms or obligations are vague or unmeasurable." },
    { category: "missing_limitation_of_liability", displayLabel: "Missing limitation of liability", guidance: "No limitation of liability clause identified." },
    { category: "missing_indemnity", displayLabel: "Missing indemnity protection", guidance: "No indemnity clause identified where expected." },
    { category: "other_known_risk", displayLabel: "Other material contractual risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [],
  regimeRuleIds: [],
  defaultOperation: "risk_flag",
};
