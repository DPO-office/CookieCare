import type { AnalysisSkillConfig } from "../../types.js";

export const irelandJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/ireland",
  axis: "jurisdiction",
  label: "Ireland",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: ["ireland", "irish law", "laws of ireland"],
  promptLibraryIds: ["ireland"],
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
      checkId: "ie.non_compete_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Irish courts scrutinise employee non-competes; flag broad post-term restraints without consideration.",
    },
  ],
  defaultOperation: "risk_flag",
};
