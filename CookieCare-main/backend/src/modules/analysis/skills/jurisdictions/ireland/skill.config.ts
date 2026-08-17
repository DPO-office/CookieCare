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
    "ie.eca_eidas_esign",
    "E-signature is generally permitted but not universal",
    "The Electronic Commerce Act 2000 generally permits electronic signatures, and EU eIDAS (Regulation (EU) 910/2014) applies directly in Ireland and takes precedence in conflict. Do not assume standard e-signature covers documents requiring a seal, statutory witnessing, or an interest in real property — those need advanced electronic signature or wet-ink.",
    "ie_esign_overreach",
    ["electronic_signature"],
    "Electronic Commerce Act 2000; Regulation (EU) 910/2014 (eIDAS) as applicable in Ireland."
  ),
  rule(
    "ie.companies_act_s43_seal",
    "Company seal requires prior board authorisation",
    "Use of the company seal must follow a prior board resolution under Companies Act 2014 s.43. Flag execution blocks that apply the seal without board authority.",
    "ie_seal_without_board",
    ["execution_formalities"],
    "Companies Act 2014 s.43."
  ),
];

export const irelandJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/ireland",
  axis: "jurisdiction",
  label: "Ireland",
  version: "0.2.0",
  appliesToDocTypes: [],
  triggerPhrases: ["ireland", "irish law", "laws of ireland"],
  promptLibraryIds: ["ireland"],
  clauseTypes: ["governing_law", "non_compete", "electronic_signature", "execution_formalities"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
    electronic_signature:
      "Electronic signature validity and any required prior consent to transact electronically.",
    execution_formalities: "Signing, witnessing, deed, or company-seal formalities.",
  },
  expectedClauses: [],
  riskCategories: [
    {
      category: "ie_esign_overreach",
      displayLabel: "Irish e-signature used on an excluded document type",
      guidance:
        "Standard e-signature is used on a document that needs a seal, statutory witnessing, or concerns an interest in real property.",
    },
    {
      category: "ie_seal_without_board",
      displayLabel: "Company seal used without board authority",
      guidance: "The company seal is applied without a prior board resolution under Companies Act 2014 s.43.",
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
      checkId: "ie.non_compete_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Irish courts scrutinise employee non-competes; flag broad post-term restraints without consideration.",
    },
  ],
  relatedChecks: [
    {
      primary: "governing_law",
      related: ["data_protection"],
      note: "Irish-established controllers or processors should also run the GDPR pack. This jurisdiction skill does not duplicate GDPR.",
    },
  ],
  defaultOperation: "risk_flag",
};
