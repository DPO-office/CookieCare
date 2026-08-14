import type { AnalysisSkillConfig } from "../../types.js";

export const delawareJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/delaware",
  axis: "jurisdiction",
  label: "Delaware",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: ["delaware", "de law", "laws of the state of delaware"],
  promptLibraryIds: ["delaware"],
  clauseTypes: ["governing_law", "non_compete"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
  },
  expectedClauses: [],
  riskCategories: [
    { category: "other_known_risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [],
  regimeRuleIds: [],
  comparativeChecks: [
    {
      checkId: "de.non_compete_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Delaware courts enforce reasonable non-competes; flag unbounded duration/geography as high risk.",
    },
  ],
  defaultOperation: "risk_flag",
};
