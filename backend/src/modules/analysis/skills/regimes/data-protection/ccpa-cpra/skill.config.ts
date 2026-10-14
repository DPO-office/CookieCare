import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";
import { finalizeRegimeRuleContracts } from "../../../runtime/catalog/rule-contract-helpers.js";


const RULES: SkillRegimeRule[] = [
  {
    "ruleId": "ccpa.sp.no_sell_share",
    "label": "Service provider must not sell or share personal information",
    "ruleText": "A CCPA/CPRA service-provider contract must prohibit the provider from selling or sharing personal information processed for the business, including for cross-context behavioural advertising.",
    "checkType": "judgment",
    "findingCategory": "ccpa_sell_share_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "CCPA/CPRA service-provider contract duties; CPRA Cal. Civ. Code §1798.140 / §1798.100 et seq. as reflected in the 20 March 2025 service-provider contract source.",
    "authority": {
      "instrument": "California Consumer Privacy Act / California Privacy Rights Act",
      "citation": "CCPA/CPRA service-provider contract duties; CPRA Cal. Civ. Code §1798.140 / §1798.100 et seq. as reflected in the 20 March 2025 service-provider contract source.",
      "provisionPath": [
        "ccpa.sp.no_sell_share"
      ],
      "citationAliases": [
        "ccpa.sp.no_sell_share",
        "CCPA/CPRA service-provider contract duties; CPRA Cal. Civ. Code §1798.140 / §1798.100 et seq. as reflected in the 20 March 2025 service-provider contract source."
      ]
    },
    "selection": {
      "aliases": [
        "service provider must not sell or share personal information",
        "shall not sell",
        "shall not share",
        "cross-context behavioral advertising",
        "cross-context behavioural advertising"
      ],
      "concepts": [
        "service",
        "provider",
        "sell",
        "share",
        "personal",
        "information",
        "ccpa",
        "cpra",
        "service-provider",
        "contract",
        "prohibit",
        "selling",
        "sharing",
        "processed",
        "business",
        "cross-context",
        "behavioural",
        "advertising",
        "behavioral"
      ],
      "actors": [
        "provider"
      ],
      "actions": [],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The service provider is contractually prohibited from selling or sharing the personal information it processes for the business, including for cross-context behavioural advertising.",
      "evidenceHints": [
        "shall not sell",
        "shall not share",
        "cross-context behavioral advertising",
        "cross-context behavioural advertising"
      ],
      "proofStandard": "Proven only by text expressly prohibiting the service provider from SELLING or SHARING personal information received from or on behalf of the business — 'share' under CPRA specifically includes disclosure for cross-context behavioural advertising, so the prohibition must reach that use, not merely a sale in the traditional monetary sense. A clause prohibiting only 'sale' of personal information, with no mention of 'sharing' or cross-context advertising, is a partial gap under CPRA's expanded definition, not full proof. Silence on sell/share entirely is not proof.",
      "proofElements": [
        {
          "id": "no_sale",
          "description": "The service provider is prohibited from selling personal information",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_sharing",
          "description": "The service provider is prohibited from sharing personal information, including for cross-context behavioural advertising",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_protection"
      ],
      "extractionTargets": [
        "sell_share_prohibition",
        "business_purpose_limitation",
        "combining_prohibition"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding The service provider is contractually prohibited from selling personal information received from or on behalf of the business. Proof: Look for an express prohibition on selling personal information processed for the business — not merely a confidentiality or non-disclosure clause. Non-proof: A general confidentiality or non-disclosure clause with no express sell prohibition. A prohibition on 'transfer for monetary consideration' that does not address selling personal information under CPRA. Remediation: Expressly prohibit the service provider from selling personal information received from or on behalf of the business.",
        "Within the selected rule only, regarding The service provider is contractually prohibited from sharing personal information, including disclosure for cross-context behavioural advertising. Proof: CPRA 'share' includes cross-context behavioural advertising. A sell-only prohibition without share/CCBA language is partial, not full proof. Non-proof: A clause prohibiting only 'sale' of personal information with no mention of 'sharing' or cross-context advertising. A marketing restriction that does not reach cross-context behavioural advertising disclosures. Remediation: Add an express prohibition on sharing personal information, including for cross-context behavioural advertising."
      ]
    },
    "legacyRequirementId": "no_sell_share"
  },
  {
    "ruleId": "ccpa.sp.business_purpose_limit",
    "label": "Retain, use, and disclose only for the business purpose",
    "ruleText": "The service provider may retain, use, or disclose personal information only for the specified business purpose (or as otherwise permitted by the contract and the CPRA), not for its own purposes outside the direct business relationship except for authorised subcontractors.",
    "checkType": "judgment",
    "findingCategory": "ccpa_purpose_limit_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "CPRA service-provider contract — Quality Assurance / other duties of the service provider.",
    "authority": {
      "instrument": "California Consumer Privacy Act / California Privacy Rights Act",
      "citation": "CPRA service-provider contract — Quality Assurance / other duties of the service provider.",
      "provisionPath": [
        "ccpa.sp.business_purpose_limit"
      ],
      "citationAliases": [
        "ccpa.sp.business_purpose_limit",
        "CPRA service-provider contract — Quality Assurance / other duties of the service provider."
      ]
    },
    "selection": {
      "aliases": [
        "retain, use, and disclose only for the business purpose",
        "business purpose",
        "specified in this agreement",
        "not retain, use, or disclose",
        "for its own commercial purposes"
      ],
      "concepts": [
        "retain",
        "disclose",
        "business",
        "purpose",
        "service",
        "provider",
        "personal",
        "information",
        "specified",
        "otherwise",
        "permitted",
        "contract",
        "cpra",
        "purposes",
        "outside",
        "direct",
        "relationship",
        "except",
        "authorised",
        "subcontractors",
        "agreement",
        "commercial"
      ],
      "actors": [
        "provider"
      ],
      "actions": [],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The service provider may retain, use, or disclose personal information only for the specified business purpose stated in the contract (or as otherwise permitted by the contract and the CPRA), not for its own independent purposes outside the direct business relationship.",
      "evidenceHints": [
        "business purpose",
        "specified in this agreement",
        "not retain, use, or disclose",
        "for its own commercial purposes"
      ],
      "proofStandard": "Proven only by text that ties the service provider's retention, use, and disclosure of personal information to the SPECIFIC business purpose(s) stated in the contract, and expressly excludes use for the provider's own independent/unrelated business purposes. A clause permitting use 'as necessary to provide the Services' with no express exclusion of independent provider purposes is partial — the CPRA-specific carve-out against independent use is the operative element, not merely a services-scoped license. Silence on purpose limitation entirely is not proof.",
      "proofElements": [
        {
          "id": "specified_business_purpose",
          "description": "Permitted retention, use, and disclosure are tied to a specified business purpose",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_outside_use",
          "description": "Use outside the direct business relationship or for the provider's own purposes is prohibited",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "limited_exceptions",
          "description": "Any legal or subcontractor exceptions remain expressly limited",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_protection"
      ],
      "extractionTargets": [
        "sell_share_prohibition",
        "business_purpose_limitation",
        "combining_prohibition"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding The service provider may retain, use, or disclose personal information only for the specific business purpose(s) stated in the contract (or as otherwise permitted by the contract and the CPRA). Proof: Look for purpose-tied retention/use/disclosure language tied to specified business purpose(s) in the agreement — not an open-ended services licence alone. Non-proof: A bare 'as necessary to provide the Services' clause with no tie to a specified business purpose. A permitted-use list with no retention/use/disclosure scope limitation. Remediation: Limit retention, use, and disclosure to the specific business purpose(s) stated in the contract.",
        "Within the selected rule only, regarding The contract expressly excludes use of the business's personal information for the provider's own independent or unrelated commercial purposes outside the direct business relationship. Proof: The CPRA-specific carve-out against independent provider use is operative — a services-scoped licence without this exclusion is partial. Non-proof: A clause permitting use 'as necessary to provide the Services' with no express exclusion of independent provider purposes. A general 'internal business purposes' carve-out without tying it to the contracted business relationship. Remediation: Expressly exclude retention, use, or disclosure for the provider's own independent or unrelated business purposes."
      ]
    },
    "legacyRequirementId": "business_purpose_limit"
  },
  {
    "ruleId": "ccpa.sp.no_combine",
    "label": "No combining personal information except as permitted",
    "ruleText": "The provider must not combine personal information received from or on behalf of the business with personal information from another person or from its own consumer interactions, except to perform a business purpose required by the client and permitted by the CCPA/CPRA.",
    "checkType": "judgment",
    "findingCategory": "ccpa_combine_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "CPRA service-provider contract — prohibition on combining personal information.",
    "authority": {
      "instrument": "California Consumer Privacy Act / California Privacy Rights Act",
      "citation": "CPRA service-provider contract — prohibition on combining personal information.",
      "provisionPath": [
        "ccpa.sp.no_combine"
      ],
      "citationAliases": [
        "ccpa.sp.no_combine",
        "CPRA service-provider contract — prohibition on combining personal information."
      ]
    },
    "selection": {
      "aliases": [
        "no combining personal information except as permitted",
        "shall not combine",
        "combine personal information",
        "except as permitted",
        "another source"
      ],
      "concepts": [
        "combining",
        "personal",
        "information",
        "except",
        "permitted",
        "provider",
        "combine",
        "received",
        "behalf",
        "business",
        "another",
        "person",
        "consumer",
        "interactions",
        "perform",
        "purpose",
        "required",
        "client",
        "ccpa",
        "cpra",
        "source"
      ],
      "actors": [
        "data_subject",
        "provider"
      ],
      "actions": [],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The service provider does not combine personal information received from or on behalf of the business with personal information from another source or from its own consumer interactions, except to perform a business purpose required by the business and permitted by the CCPA/CPRA.",
      "evidenceHints": [
        "shall not combine",
        "combine personal information",
        "except as permitted",
        "another source"
      ],
      "proofStandard": "Proven only by text expressly prohibiting the service provider from COMBINING the business's personal information with data from other sources or its own consumer interactions, subject only to the narrow CPRA-permitted-purpose exception. A general confidentiality or data-segregation clause with no express combining prohibition does not satisfy this — 'combine' is a distinct CPRA-defined restriction, not implied by confidentiality alone. Silence on combining entirely is not proof.",
      "proofElements": [
        {
          "id": "source_combination_prohibition",
          "description": "Personal information may not be combined with data from other persons or the provider's own interactions",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "business_purpose_exception",
          "description": "Any combination exception is limited to a client-required, legally permitted business purpose",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_protection"
      ],
      "extractionTargets": [
        "sell_share_prohibition",
        "business_purpose_limitation",
        "combining_prohibition"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "no_combine"
  },
  {
    "ruleId": "ccpa.sp.consumer_rights_assist",
    "label": "Assist with verifiable consumer requests",
    "ruleText": "The provider must assist the business with verifiable consumer requests (delete, know/access, correct) and must forward consumer requests received directly to the business rather than answering them as if it were the business.",
    "checkType": "judgment",
    "findingCategory": "ccpa_consumer_rights_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_subject_request_handling"
    ],
    "legalHook": "CPRA service-provider contract §4 — Consumers' Rights.",
    "authority": {
      "instrument": "California Consumer Privacy Act / California Privacy Rights Act",
      "citation": "CPRA service-provider contract §4 — Consumers' Rights.",
      "provisionPath": [
        "ccpa.sp.consumer_rights_assist"
      ],
      "citationAliases": [
        "ccpa.sp.consumer_rights_assist",
        "CPRA service-provider contract §4 — Consumers' Rights."
      ]
    },
    "selection": {
      "aliases": [
        "assist with verifiable consumer requests",
        "assist the business",
        "verifiable consumer request",
        "forward",
        "right to know",
        "right to delete",
        "right to correct"
      ],
      "concepts": [
        "assist",
        "verifiable",
        "consumer",
        "requests",
        "provider",
        "business",
        "delete",
        "know",
        "access",
        "correct",
        "forward",
        "received",
        "directly",
        "rather",
        "answering",
        "them",
        "request",
        "right"
      ],
      "actors": [
        "data_subject",
        "provider"
      ],
      "actions": [
        "assist",
        "erase",
        "access"
      ],
      "objects": [
        "rights_request"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The service provider assists the business with verifiable consumer requests (delete, know/access, correct) and forwards any consumer request it receives directly to the business rather than responding to it as if it were the business.",
      "evidenceHints": [
        "assist the business",
        "verifiable consumer request",
        "forward",
        "right to know",
        "right to delete",
        "right to correct"
      ],
      "proofStandard": "Proven only by text that (a) obligates the provider to assist the business in responding to verifiable consumer requests covering at least delete and know/access, AND (b) requires the provider to FORWARD any consumer request it receives directly to the business rather than acting on it directly. A clause obligating assistance but silent on the forward-rather-than-respond duty is partial — the forwarding duty specifically prevents the provider from purporting to act as the business, and its absence is a real gap. Silence on consumer-rights assistance entirely is not proof.",
      "proofElements": [
        {
          "id": "request_assistance",
          "description": "The provider must assist the business with verifiable consumer requests",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "covered_rights",
          "description": "Assistance covers deletion, access/knowledge, and correction",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "direct_request_forwarding",
          "description": "Requests received directly are forwarded to the business",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_subject_request_handling",
        "security_dpia_assistance"
      ],
      "extractionTargets": [
        "verifiable_request_assistance",
        "request_forwarding",
        "technical_organisational_measures"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding The service provider assists the business in responding to verifiable consumer requests covering at least delete and know/access (and correct where addressed). Proof: Operative assistance obligation for verifiable consumer requests — not a bare acknowledgement that consumers have rights under CPRA. Non-proof: A generic 'comply with applicable privacy law' statement with no assistance duty. A consumer-rights list naming delete/know/access with no obligation on the provider to assist the business. Remediation: Obligate the provider to assist the business with verifiable consumer requests, including delete and know/access.",
        "Within the selected rule only, regarding The service provider forwards any consumer request it receives directly to the business rather than responding to it as if it were the business. Proof: The forwarding duty specifically prevents the provider from purporting to act as the business. Assistance without forwarding is partial. Non-proof: An assistance clause that is silent on forwarding direct consumer requests to the business. A clause allowing the provider to respond directly to consumer requests without forwarding. Remediation: Require the provider to forward consumer requests received directly to the business rather than answering as the business."
      ]
    },
    "legacyRequirementId": "consumer_rights_assistance"
  },
  {
    "ruleId": "ccpa.sp.toms",
    "label": "Technical and organisational security measures",
    "ruleText": "The provider must implement technical and organisational measures appropriate to the nature of the personal information, covering confidentiality, integrity, availability, and resilience, and must not lower the documented security level without recording substantial changes.",
    "checkType": "judgment",
    "findingCategory": "ccpa_toms_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "security_dpia_assistance"
    ],
    "legalHook": "CPRA service-provider contract §3 — Technical and Organizational Measures.",
    "authority": {
      "instrument": "California Consumer Privacy Act / California Privacy Rights Act",
      "citation": "CPRA service-provider contract §3 — Technical and Organizational Measures.",
      "provisionPath": [
        "ccpa.sp.toms"
      ],
      "citationAliases": [
        "ccpa.sp.toms",
        "CPRA service-provider contract §3 — Technical and Organizational Measures."
      ]
    },
    "selection": {
      "aliases": [
        "technical and organisational security measures",
        "technical and organizational measures",
        "confidentiality, integrity",
        "availability and resilience",
        "security level"
      ],
      "concepts": [
        "technical",
        "organisational",
        "security",
        "measures",
        "provider",
        "implement",
        "appropriate",
        "nature",
        "personal",
        "information",
        "covering",
        "confidentiality",
        "integrity",
        "availability",
        "resilience",
        "lower",
        "documented",
        "level",
        "recording",
        "substantial",
        "changes",
        "organizational"
      ],
      "actors": [
        "provider"
      ],
      "actions": [],
      "objects": [
        "regulated_data",
        "security_measures"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The service provider implements technical and organisational measures appropriate to the nature of the personal information, covering confidentiality, integrity, availability, and resilience, and does not lower the documented security level without recording the change.",
      "evidenceHints": [
        "technical and organizational measures",
        "confidentiality, integrity",
        "availability and resilience",
        "security level"
      ],
      "proofStandard": "Proven only by text requiring technical AND organisational measures that address confidentiality, integrity, and availability/resilience of the personal information — a bare 'commercially reasonable security' statement with none of these dimensions named is insufficient. A clause silent on whether the security level can be lowered (no anti-degradation or change-documentation language) is a partial gap on that specific element, not a full defeat of the core measures requirement.",
      "proofElements": [
        {
          "id": "appropriate_measures",
          "description": "Technical and organisational measures are appropriate to the personal information",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "security_properties",
          "description": "Measures address confidentiality, integrity, availability, and resilience",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "change_control",
          "description": "The documented security level is not lowered without recording substantial changes",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_subject_request_handling",
        "security_dpia_assistance"
      ],
      "extractionTargets": [
        "verifiable_request_assistance",
        "request_forwarding",
        "technical_organisational_measures"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "security_measures"
  }
];

const ccpaCpraSkillConfig: AnalysisSkillConfig = {
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
      requirementEvidence: {},
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
      requirementEvidence: {},
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

export const ccpaCpraSkill = finalizeRegimeRuleContracts(ccpaCpraSkillConfig, {
  instrument: "California Consumer Privacy Act / California Privacy Rights Act",
  requirementToRuleId: {
    no_sell_share: "ccpa.sp.no_sell_share",
    business_purpose_limit: "ccpa.sp.business_purpose_limit",
    no_combine: "ccpa.sp.no_combine",
    consumer_rights_assistance: "ccpa.sp.consumer_rights_assist",
    security_measures: "ccpa.sp.toms",
  },
});
