import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../types.js";

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
    "ccpa.sp.no_sell_share",
    "Service provider must not sell or share personal information",
    "A CCPA/CPRA service-provider contract must prohibit the provider from selling or sharing personal information processed for the business, including for cross-context behavioural advertising.",
    "ccpa_sell_share_gap",
    ["data_protection"],
    "CCPA/CPRA service-provider contract duties; CPRA Cal. Civ. Code §1798.140 / §1798.100 et seq. as reflected in the 20 March 2025 service-provider contract source."
  ),
  rule(
    "ccpa.sp.business_purpose_limit",
    "Retain, use, and disclose only for the business purpose",
    "The service provider may retain, use, or disclose personal information only for the specified business purpose (or as otherwise permitted by the contract and the CPRA), not for its own purposes outside the direct business relationship except for authorised subcontractors.",
    "ccpa_purpose_limit_gap",
    ["data_protection"],
    "CPRA service-provider contract — Quality Assurance / other duties of the service provider."
  ),
  rule(
    "ccpa.sp.no_combine",
    "No combining personal information except as permitted",
    "The provider must not combine personal information received from or on behalf of the business with personal information from another person or from its own consumer interactions, except to perform a business purpose required by the client and permitted by the CCPA/CPRA.",
    "ccpa_combine_gap",
    ["data_protection"],
    "CPRA service-provider contract — prohibition on combining personal information."
  ),
  rule(
    "ccpa.sp.consumer_rights_assist",
    "Assist with verifiable consumer requests",
    "The provider must assist the business with verifiable consumer requests (delete, know/access, correct) and must forward consumer requests received directly to the business rather than answering them as if it were the business.",
    "ccpa_consumer_rights_gap",
    ["data_subject_request_handling"],
    "CPRA service-provider contract §4 — Consumers' Rights."
  ),
  rule(
    "ccpa.sp.toms",
    "Technical and organisational security measures",
    "The provider must implement technical and organisational measures appropriate to the nature of the personal information, covering confidentiality, integrity, availability, and resilience, and must not lower the documented security level without recording substantial changes.",
    "ccpa_toms_gap",
    ["security_dpia_assistance"],
    "CPRA service-provider contract §3 — Technical and Organizational Measures."
  ),
];

export const ccpaCpraSkill: AnalysisSkillConfig = {
  skillId: "regimes/data-protection/ccpa-cpra",
  axis: "regime",
  family: "data-protection",
  label: "CCPA / CPRA service-provider overlay",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "ccpa",
    "cpra",
    "california consumer privacy",
    "service provider contract",
    "do not sell",
    "cross-context behavioural advertising",
    "cross-context behavioral advertising",
  ],
  promptLibraryIds: ["ccpa", "cpra", "ccpa-cpra"],
  clauseTypes: [
    "data_protection",
    "data_subject_request_handling",
    "security_dpia_assistance",
    "subprocessor_flow_down",
  ],
  clauseTypeDefinitions: {
    data_protection: "Core processing subject-matter, roles, and processor obligations annex.",
    data_subject_request_handling:
      "Intake, identity checks, deadlines, decisions, and communications for rights requests.",
    security_dpia_assistance: "Security / DPIA assistance language as a structural section.",
    subprocessor_flow_down: "Subprocessor list / flow-down of processor obligations.",
  },
  expectedClauses: [
    {
      clauseType: "data_protection",
      severityIfMissing: "high",
      findingCategory: "ccpa_purpose_limit_gap",
      textSynonyms: ["service provider", "business purpose", "personal information"],
    },
  ],
  riskCategories: [
    {
      category: "ccpa_sell_share_gap",
      displayLabel: "Service provider may sell or share PI",
      guidance: "The service provider is not barred from selling or sharing personal information.",
    },
    {
      category: "ccpa_purpose_limit_gap",
      displayLabel: "Service-provider purpose limit missing",
      guidance: "The provider may use personal information beyond the business purpose.",
    },
    {
      category: "ccpa_combine_gap",
      displayLabel: "Unrestricted combining of personal information",
      guidance: "The provider may combine client PI with other datasets without a CPRA-permitted purpose.",
    },
    {
      category: "ccpa_consumer_rights_gap",
      displayLabel: "Weak consumer-request assistance",
      guidance: "The provider does not assist with verifiable consumer requests or may answer them directly.",
    },
    {
      category: "ccpa_toms_gap",
      displayLabel: "Missing CCPA/CPRA security measures",
      guidance: "No appropriate technical and organisational measures for personal information.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  instructionFocusMap: [
    {
      triggerPhrases: ["sell", "share", "cross-context"],
      focus: {
        ruleIds: ["ccpa.sp.no_sell_share"],
        riskCategoryIds: ["ccpa_sell_share_gap"],
      },
    },
    {
      triggerPhrases: ["delete", "right to know", "consumer request", "correct"],
      focus: {
        ruleIds: ["ccpa.sp.consumer_rights_assist"],
        riskCategoryIds: ["ccpa_consumer_rights_gap"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};
