import type { AnalysisSkillConfig } from "../../types.js";

export const englandWalesJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/england-wales",
  axis: "jurisdiction",
  label: "England and Wales",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: ["england and wales", "english law", "laws of england"],
  promptLibraryIds: ["england-wales"],
  clauseTypes: ["governing_law", "non_compete"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
  },
  expectedClauses: [],
  riskCategories: [
    { category: "other_known_risk", displayLabel: "Other material contractual risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [],
  regimeRuleIds: [],
  comparativeChecks: [
    {
      checkId: "ew.restrictive_covenant_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "English courts require legitimate interest and reasonableness; flag garden-leave + long non-compete stacking.",
    },
  ],
  defaultOperation: "risk_flag",
};
