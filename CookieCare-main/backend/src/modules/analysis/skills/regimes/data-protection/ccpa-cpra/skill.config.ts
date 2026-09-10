import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";

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
  clauseRetrieval: {
    data_protection: {
      headings: [
        "Service Provider",
        "Business Purpose",
        "Personal Information",
        "Processing of Personal Information",
      ],
      aliases: [
        "service provider",
        "business purpose",
        "personal information",
        "do not sell",
        "do not share",
      ],
      anchorTerms: [
        "sell",
        "share",
        "combine",
        "cross-context",
        "business purpose",
      ],
    },
    data_subject_request_handling: {
      headings: [
        "Consumer Rights",
        "Consumers' Rights",
        "Verifiable Consumer Requests",
        "Consumer Requests",
      ],
      aliases: [
        "verifiable consumer request",
        "consumer rights",
        "delete",
        "know",
        "correct",
        "right to know",
      ],
      anchorTerms: [
        "forward",
        "assist the business",
        "verifiable",
        "access",
        "correction",
      ],
    },
    security_dpia_assistance: {
      headings: [
        "Technical and Organizational Measures",
        "Technical and Organisational Measures",
        "Security",
        "Security Measures",
      ],
      aliases: [
        "technical and organisational measures",
        "technical and organizational measures",
        "security measures",
        "confidentiality",
        "integrity",
        "availability",
      ],
      anchorTerms: ["resilience", "encryption", "security level"],
    },
    subprocessor_flow_down: {
      headings: ["Subprocessors", "Subcontractors", "Service Providers"],
      aliases: ["subprocessor", "sub-processor", "subcontractor"],
      anchorTerms: ["flow-down", "same obligations", "subcontract"],
    },
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
  evidencePackages: [
    {
      id: "ccpa.sp.core_restrictions",
      requirementIds: [
        "no_sell_share",
        "business_purpose_limit",
        "no_combine",
      ],
      capabilityIds: [
        "ccpa.sp.no_sell_share",
        "ccpa.sp.business_purpose_limit",
        "ccpa.sp.no_combine",
      ],
      clauseTypes: ["data_protection"],
      extractionTargets: [
        "sell_share_prohibition",
        "business_purpose_limitation",
        "combining_prohibition",
      ],
      requirementEvidence: {
        no_sell_share: {
          hypothesis:
            "The service provider is contractually prohibited from selling or sharing the personal information it processes for the business, including for cross-context behavioural advertising.",
          evidenceHints: ["shall not sell", "shall not share", "cross-context behavioral advertising", "cross-context behavioural advertising"],
          proofStandard:
            "Proven only by text expressly prohibiting the service provider from " +
            "SELLING or SHARING personal information received from or on behalf of " +
            "the business — 'share' under CPRA specifically includes disclosure for " +
            "cross-context behavioural advertising, so the prohibition must reach " +
            "that use, not merely a sale in the traditional monetary sense. A clause " +
            "prohibiting only 'sale' of personal information, with no mention of " +
            "'sharing' or cross-context advertising, is a partial gap under CPRA's " +
            "expanded definition, not full proof. Silence on sell/share entirely is " +
            "not proof.",
        },
        business_purpose_limit: {
          hypothesis:
            "The service provider may retain, use, or disclose personal information only for the specified business purpose stated in the contract (or as otherwise permitted by the contract and the CPRA), not for its own independent purposes outside the direct business relationship.",
          evidenceHints: ["business purpose", "specified in this agreement", "not retain, use, or disclose", "for its own commercial purposes"],
          proofStandard:
            "Proven only by text that ties the service provider's retention, use, and " +
            "disclosure of personal information to the SPECIFIC business purpose(s) " +
            "stated in the contract, and expressly excludes use for the provider's " +
            "own independent/unrelated business purposes. A clause permitting use " +
            "'as necessary to provide the Services' with no express exclusion of " +
            "independent provider purposes is partial — the CPRA-specific carve-out " +
            "against independent use is the operative element, not merely a services-" +
            "scoped license. Silence on purpose limitation entirely is not proof.",
        },
        no_combine: {
          hypothesis:
            "The service provider does not combine personal information received from or on behalf of the business with personal information from another source or from its own consumer interactions, except to perform a business purpose required by the business and permitted by the CCPA/CPRA.",
          evidenceHints: ["shall not combine", "combine personal information", "except as permitted", "another source"],
          proofStandard:
            "Proven only by text expressly prohibiting the service provider from " +
            "COMBINING the business's personal information with data from other " +
            "sources or its own consumer interactions, subject only to the narrow " +
            "CPRA-permitted-purpose exception. A general confidentiality or data-" +
            "segregation clause with no express combining prohibition does not " +
            "satisfy this — 'combine' is a distinct CPRA-defined restriction, not " +
            "implied by confidentiality alone. Silence on combining entirely is not " +
            "proof.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      report: {
        sections: ["scope", "requirements_detail", "recommendations", "conclusion"],
        outlineExtras: [
          {
            heading: "CCPA service-provider restrictions",
            requirementTags: [
              "no_sell_share",
              "business_purpose_limit",
              "no_combine",
            ],
          },
        ],
      },
    },
    {
      id: "ccpa.sp.consumer_and_security",
      requirementIds: ["consumer_rights_assistance", "security_measures"],
      capabilityIds: ["ccpa.sp.consumer_rights_assist", "ccpa.sp.toms"],
      clauseTypes: ["data_subject_request_handling", "security_dpia_assistance"],
      extractionTargets: [
        "verifiable_request_assistance",
        "request_forwarding",
        "technical_organisational_measures",
      ],
      requirementEvidence: {
        consumer_rights_assistance: {
          hypothesis:
            "The service provider assists the business with verifiable consumer requests (delete, know/access, correct) and forwards any consumer request it receives directly to the business rather than responding to it as if it were the business.",
          evidenceHints: ["assist the business", "verifiable consumer request", "forward", "right to know", "right to delete", "right to correct"],
          proofStandard:
            "Proven only by text that (a) obligates the provider to assist the " +
            "business in responding to verifiable consumer requests covering at " +
            "least delete and know/access, AND (b) requires the provider to FORWARD " +
            "any consumer request it receives directly to the business rather than " +
            "acting on it directly. A clause obligating assistance but silent on the " +
            "forward-rather-than-respond duty is partial — the forwarding duty " +
            "specifically prevents the provider from purporting to act as the " +
            "business, and its absence is a real gap. Silence on consumer-rights " +
            "assistance entirely is not proof.",
        },
        security_measures: {
          hypothesis:
            "The service provider implements technical and organisational measures appropriate to the nature of the personal information, covering confidentiality, integrity, availability, and resilience, and does not lower the documented security level without recording the change.",
          evidenceHints: ["technical and organizational measures", "confidentiality, integrity", "availability and resilience", "security level"],
          proofStandard:
            "Proven only by text requiring technical AND organisational measures " +
            "that address confidentiality, integrity, and availability/resilience of " +
            "the personal information — a bare 'commercially reasonable security' " +
            "statement with none of these dimensions named is insufficient. A clause " +
            "silent on whether the security level can be lowered (no anti-" +
            "degradation or change-documentation language) is a partial gap on that " +
            "specific element, not a full defeat of the core measures requirement.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      report: {
        sections: ["scope", "requirements_detail", "recommendations", "conclusion"],
        outlineExtras: [
          {
            heading: "Consumer rights and security",
            requirementTags: ["consumer_rights_assistance", "security_measures"],
          },
        ],
      },
    },
  ],
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
