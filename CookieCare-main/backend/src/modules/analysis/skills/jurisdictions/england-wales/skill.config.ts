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
    "ew.simple_contract_or_deed",
    "Classify as simple contract or deed before execution",
    "Most commercial agreements (NDA, MSA, DPA, SLA) are simple contracts: signature by an authorised person plus consideration is enough. Deeds (certain releases, guarantees, assignments without consideration) need stricter formalities. Do not use a deed execution block on a simple contract, or a simple-contract block on a deed. Name 'England and Wales', not 'UK', in the governing-law clause unless Scotland or Northern Ireland is confirmed.",
    "ew_execution_classification_gap",
    ["execution_formalities", "governing_law"],
    "English common-law simple contract vs deed; name England and Wales expressly."
  ),
  rule(
    "ew.companies_act_s44",
    "Company deeds must follow Companies Act 2006 s.44",
    "A company-signed deed must be executed by two directors, a director and the company secretary, or one director in the presence of a witness. Companies without a secretary should use director-plus-witness.",
    "ew_s44_execution_gap",
    ["execution_formalities"],
    "Companies Act 2006 s.44."
  ),
  rule(
    "ew.physical_witnessing",
    "Deed witnesses must be physically present",
    "Even where e-signatures are used, a witness to a deed must be physically present with the signatory. Do not rely on remote or video witnessing for a deed.",
    "ew_remote_witness_gap",
    ["execution_formalities", "electronic_signature"],
    "English deed witnessing — physical presence required."
  ),
];

export const englandWalesJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/england-wales",
  axis: "jurisdiction",
  label: "England and Wales",
  version: "0.2.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "england and wales",
    "english law",
    "laws of england",
    "england",
    "uk law",
    "united kingdom",
  ],
  promptLibraryIds: ["england-wales", "england", "uk"],
  clauseTypes: ["governing_law", "non_compete", "execution_formalities", "electronic_signature"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
    execution_formalities: "Signing, witnessing, deed, or company-seal formalities.",
    electronic_signature:
      "Electronic signature validity and any required prior consent to transact electronically.",
  },
  expectedClauses: [],
  riskCategories: [
    {
      category: "ew_execution_classification_gap",
      displayLabel: "Simple contract vs deed not classified",
      guidance: "Execution formalities do not distinguish a simple contract from a deed, or governing law says 'UK' without confirming England and Wales.",
    },
    {
      category: "ew_s44_execution_gap",
      displayLabel: "Company deed execution does not meet s.44",
      guidance: "A company deed is not executed by two directors, a director and secretary, or one director plus a witness.",
    },
    {
      category: "ew_remote_witness_gap",
      displayLabel: "Remote witnessing used for a deed",
      guidance: "A deed relies on remote or video witnessing rather than physical presence.",
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
      checkId: "ew.restrictive_covenant_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "English courts require legitimate interest and reasonableness; flag garden-leave + long non-compete stacking.",
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["deed", "s.44", "section 44", "witness"],
      focus: {
        ruleIds: ["ew.simple_contract_or_deed", "ew.companies_act_s44", "ew.physical_witnessing"],
        riskCategoryIds: [
          "ew_execution_classification_gap",
          "ew_s44_execution_gap",
          "ew_remote_witness_gap",
        ],
      },
    },
  ],
  defaultOperation: "risk_flag",
};
