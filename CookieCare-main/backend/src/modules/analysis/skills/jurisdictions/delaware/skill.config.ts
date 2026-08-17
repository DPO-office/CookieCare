import type { AnalysisSkillConfig, SkillRegimeRule } from "../../types.js";

function rule(
  ruleId: string,
  label: string,
  ruleText: string,
  findingCategory: string,
  appliesToClauseTypes: string[],
  legalHook: string
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType: "judgment",
    findingCategory,
    ruleScope: "per_document",
    appliesToClauseTypes,
    legalHook,
  };
}

const RULES: SkillRegimeRule[] = [
  rule(
    "de.choice_of_law_2708",
    "Delaware choice-of-law is strongly enforceable",
    "A Delaware choice-of-law clause should be treated as creating a significant, material, and reasonable relationship with Delaware regardless of other connections. Prefer language that can sit with 6 Del. C. §2708(a).",
    "de_choice_of_law_weak",
    ["governing_law"],
    "6 Del. C. §2708(a)."
  ),
  rule(
    "de.forum_exclusivity",
    "Forum-selection exclusivity must be express",
    "Pair governing law with an exclusive Delaware forum-selection clause if that is the intent. Under Delaware UETA, a forum clause is not exclusive unless the agreement expressly says so. Enforceability of a Delaware forum clause in a court outside Delaware is less certain — flag as drafting risk.",
    "de_forum_not_exclusive",
    ["governing_law"],
    "Delaware forum-selection practice; UETA — forum clause not exclusive unless expressly stated."
  ),
  rule(
    "de.public_policy_noncompete",
    "Delaware law does not automatically override another state's non-compete public policy",
    "Do not assume a Delaware choice-of-law clause overrides another state's fundamental public policy on non-competes. Delaware courts have limited enforcement in such conflicts. Flag California-touching or similar public-policy clashes.",
    "de_public_policy_noncompete",
    ["non_compete", "governing_law"],
    "Delaware conflict-of-laws limits on using §2708 to defeat another state's fundamental public policy (including non-competes)."
  ),
  rule(
    "de.ueta_esign",
    "Electronic signatures have the same effect as originals",
    "Do not require wet-ink signature for a standard commercial contract governed by Delaware law. Delaware UETA gives electronic signatures and records the same legal effect as originals. No general corporate-seal requirement for ordinary commercial contracts.",
    "de_wet_ink_required",
    ["electronic_signature"],
    "Delaware Uniform Electronic Transactions Act."
  ),
];

export const delawareJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/delaware",
  axis: "jurisdiction",
  label: "Delaware",
  version: "0.2.0",
  appliesToDocTypes: [],
  triggerPhrases: ["delaware", "de law", "laws of the state of delaware", "6 del. c."],
  promptLibraryIds: ["delaware"],
  clauseTypes: ["governing_law", "non_compete", "electronic_signature"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
    electronic_signature:
      "Electronic signature validity and any required prior consent to transact electronically.",
  },
  expectedClauses: [],
  riskCategories: [
    {
      category: "de_choice_of_law_weak",
      displayLabel: "Weak Delaware choice-of-law clause",
      guidance: "The Delaware governing-law clause is missing or does not sit cleanly with 6 Del. C. §2708.",
    },
    {
      category: "de_forum_not_exclusive",
      displayLabel: "Delaware forum not expressly exclusive",
      guidance: "Forum selection is not expressly exclusive, or exclusivity may fail outside Delaware.",
    },
    {
      category: "de_public_policy_noncompete",
      displayLabel: "Delaware law used to evade another state's non-compete policy",
      guidance:
        "Delaware choice-of-law is used as if it automatically overrides another state's fundamental non-compete public policy.",
    },
    {
      category: "de_wet_ink_required",
      displayLabel: "Unnecessary wet-ink requirement under Delaware UETA",
      guidance: "The contract requires wet-ink execution for a standard commercial contract governed by Delaware law.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  comparativeChecks: [
    {
      checkId: "de.non_compete_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Delaware courts enforce reasonable non-competes; flag unbounded duration/geography as high risk. Delaware choice-of-law does not automatically override another state's fundamental public policy on non-competes.",
    },
  ],
  defaultOperation: "risk_flag",
};
