import type { AnalysisSkillConfig } from "../../types.js";

/**
 * California — includes non-compete enforceability comparative check
 * (genuine jurisdiction-varying correctness question).
 */
export const californiaJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/california",
  axis: "jurisdiction",
  label: "California",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: ["california", "ca law", "cal. bus", "bus. & prof. code"],
  promptLibraryIds: ["california"],
  clauseTypes: ["governing_law", "non_compete"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
  },
  expectedClauses: [],
  riskCategories: [
    {
      category: "ca_non_compete_unenforceable",
      displayLabel: "California non-compete unenforceability",
      guidance:
        "California generally voids employee non-competes (Bus. & Prof. Code §16600); flag as likely unenforceable.",
    },
    { category: "other_known_risk", displayLabel: "Other material contractual risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [],
  regimeRuleIds: [],
  comparativeChecks: [
    {
      checkId: "ca.non_compete_enforceability",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Under Cal. Bus. & Prof. Code §16600, employee non-competes are generally void. Compare any non-compete / customer non-solicit against this baseline and flag as a likely unenforceability gap (sale-of-business carve-outs excepted).",
    },
  ],
  defaultOperation: "risk_flag",
};
