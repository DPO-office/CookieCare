import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";
import { finalizeRegimeRuleContracts } from "../../../runtime/catalog/rule-contract-helpers.js";


const RULES: SkillRegimeRule[] = [
  {
    "ruleId": "dpdpa.df.valid_processor_contract",
    "label": "Data Processor engaged only under a valid contract",
    "ruleText": "A Data Fiduciary may engage, appoint, use or otherwise involve a Data Processor to process personal data on its behalf for any activity related to offering goods or services to Data Principals only under a valid contract.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_processor_contract_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(2).",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(2).",
      "provisionPath": [
        "dpdpa.s8.2"
      ],
      "citationAliases": [
        "dpdpa.df.valid_processor_contract",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(2)."
      ]
    },
    "selection": {
      "aliases": [
        "data processor engaged only under a valid contract",
        "valid contract",
        "engage, appoint, use or otherwise involve",
        "data processor",
        "on its behalf"
      ],
      "concepts": [
        "data",
        "fiduciary",
        "engage",
        "appoint",
        "use",
        "involve",
        "processor",
        "process",
        "personal",
        "behalf",
        "activity",
        "offering",
        "goods",
        "services",
        "principals",
        "valid",
        "contract"
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
      "hypothesis": "The Data Fiduciary engages, appoints, uses or otherwise involves the Data Processor to process personal data on its behalf only under a valid, executed written contract.",
      "evidenceHints": [
        "valid contract",
        "engage, appoint, use or otherwise involve",
        "data processor",
        "on its behalf"
      ],
      "proofStandard": "Proven only by text showing the processing relationship is itself governed by a valid, executed contract between the Data Fiduciary and the Data Processor — not merely a reference to 'applicable law' or an informal engagement. A document that is itself the contract and defines the processor's role and obligations satisfies this by its own execution; a mere recital that 'a contract exists' with no substantive terms is a partial gap. Silence on the basis for engaging the processor entirely is not proof.",
      "proofElements": [
        {
          "id": "written_contract",
          "description": "The Data Processor is engaged under a valid written contract",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "processing_scope_defined",
          "description": "The contract defines the personal data and processing activity carried out on the Data Fiduciary's behalf",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_protection",
        "subprocessor_flow_down"
      ],
      "extractionTargets": [
        "processor_engagement_basis",
        "fiduciary_accountability",
        "data_quality_obligation"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.valid_processor_contract"
  },
  {
    "ruleId": "dpdpa.df.fiduciary_accountability",
    "label": "Data Fiduciary remains accountable regardless of contrary agreement",
    "ruleText": "The Data Fiduciary is responsible for complying with the Act and rules in respect of any processing undertaken by it or on its behalf by a Data Processor, irrespective of any agreement to the contrary or failure of the Data Principal to carry out her duties.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_fiduciary_accountability_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(1).",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(1).",
      "provisionPath": [
        "dpdpa.s8.1"
      ],
      "citationAliases": [
        "dpdpa.df.fiduciary_accountability",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(1)."
      ]
    },
    "selection": {
      "aliases": [
        "data fiduciary remains accountable regardless of contrary agreement",
        "irrespective of any agreement to the contrary",
        "responsible for complying",
        "undertaken by it or on its behalf"
      ],
      "concepts": [
        "data",
        "fiduciary",
        "responsible",
        "complying",
        "provisions",
        "rules",
        "processing",
        "undertaken",
        "behalf",
        "processor",
        "irrespective",
        "agreement",
        "contrary",
        "failure",
        "principal",
        "duties"
      ],
      "actors": [
        "provider",
        "data_subject"
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
      "hypothesis": "The contract does not purport to shift or extinguish the Data Fiduciary's own accountability for compliance with the Act and rules for processing carried out on its behalf by the Data Processor, and does not condition that accountability on the Data Principal performing her duties.",
      "evidenceHints": [
        "irrespective of any agreement to the contrary",
        "responsible for complying",
        "undertaken by it or on its behalf"
      ],
      "proofStandard": "Proven by the ABSENCE of language that purports to make the Data Processor (or the Data Principal) solely liable for Act compliance in a way that would relieve the Data Fiduciary of its own statutory accountability. A clause that allocates operational responsibility to the processor while preserving the fiduciary's own compliance obligation satisfies this; a clause purporting to fully indemnify or substitute the fiduciary's statutory duty is a gap. Silence on accountability allocation, with a properly scoped processor-obligations clause elsewhere, is not itself a defeat of this proposition.",
      "proofElements": [
        {
          "id": "fiduciary_retains_duty",
          "description": "The Data Fiduciary's own statutory compliance duty is not disclaimed by contract",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_conditional_carveout",
          "description": "Compliance is not made conditional on the Data Principal's own performance",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "data_protection",
        "subprocessor_flow_down"
      ],
      "extractionTargets": [
        "processor_engagement_basis",
        "fiduciary_accountability",
        "data_quality_obligation"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.fiduciary_accountability"
  },
  {
    "ruleId": "dpdpa.df.security_safeguards",
    "label": "Reasonable security safeguards to prevent personal data breach",
    "ruleText": "The Data Fiduciary must protect personal data in its possession or under its control, including processing by its Data Processor, by taking reasonable security safeguards to prevent a personal data breach, including data security measures, access controls, logging/monitoring, and continued-processing/backup measures.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_security_safeguards_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(5); Digital Personal Data Protection Rules, 2025, rule 6.",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(5); Digital Personal Data Protection Rules, 2025, rule 6.",
      "provisionPath": [
        "dpdpa.s8.5",
        "dpdp_rules.r6"
      ],
      "citationAliases": [
        "dpdpa.df.security_safeguards",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(5); Digital Personal Data Protection Rules, 2025, rule 6."
      ]
    },
    "selection": {
      "aliases": [
        "reasonable security safeguards to prevent personal data breach",
        "reasonable security safeguards",
        "encryption, obfuscation, masking",
        "access to computer resources",
        "logs, monitoring and review"
      ],
      "concepts": [
        "protect",
        "personal",
        "data",
        "possession",
        "control",
        "processing",
        "processor",
        "reasonable",
        "security",
        "safeguards",
        "prevent",
        "breach",
        "encryption",
        "obfuscation",
        "masking",
        "virtual",
        "tokens",
        "access",
        "computer",
        "resources",
        "logs",
        "monitoring",
        "review",
        "backup"
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
      "hypothesis": "The Data Fiduciary (and, wherever applicable, its Data Processor) implements reasonable security safeguards for personal data — appropriate data security measures such as encryption/obfuscation/masking, access controls over computer resources, logging/monitoring to detect unauthorised access, and measures for continued processing (e.g. backups) in the event of compromise — and the contract carries an appropriate security provision binding the processor to these safeguards.",
      "evidenceHints": [
        "reasonable security safeguards",
        "encryption, obfuscation, masking",
        "access to computer resources",
        "logs, monitoring and review"
      ],
      "proofStandard": "Proven only by text requiring concrete security safeguards — at minimum, data security measures (e.g. encryption or equivalent), access controls, and detection/monitoring capability — imposed on whichever party processes the personal data, including a Data Processor under contract. A bare 'commercially reasonable security' recital with none of these dimensions named is insufficient. Silence on security safeguards entirely is not proof.",
      "proofElements": [
        {
          "id": "data_security_measures",
          "description": "Appropriate data security measures (e.g. encryption, obfuscation, masking, or tokenisation) are required",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "access_controls",
          "description": "Access to the computer resources used for processing is controlled",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "detection_and_continuity",
          "description": "Logging/monitoring for unauthorised access and continued-processing measures (e.g. backups) are in place",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "processor_security_flowdown",
          "description": "Where a Data Processor is used, the contract itself contains an appropriate security-safeguards provision",
          "required": true,
          "kind": "conditional",
          "applicabilityGuidance": "Applies only where the contract engages a Data Processor to process personal data on the Data Fiduciary's behalf; not applicable where the Data Fiduciary processes solely in-house."
        }
      ],
      "clauseTypeHints": [
        "data_protection",
        "subprocessor_flow_down",
        "personal_data_breach_notification"
      ],
      "extractionTargets": [
        "security_safeguards",
        "breach_notification_timing",
        "data_quality_obligation"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding appropriate data security measures for personal data. Proof: encryption, obfuscation, masking, or virtual-token mapping (or equivalent) is expressly required. Non-proof: a bare 'commercially reasonable security' statement with no named measure. Remediation: name a concrete data security measure such as encryption.",
        "Within the selected rule only, regarding access controls and detection capability. Proof: the contract requires controlling access to computer resources used for processing and maintaining logs/monitoring to detect unauthorised access. Non-proof: a general confidentiality clause with no access-control or logging/monitoring language. Remediation: add access-control and logging/monitoring obligations."
      ]
    },
    "legacyRequirementId": "dpdpa.df.security_safeguards"
  },
  {
    "ruleId": "dpdpa.df.breach_intimation",
    "label": "Personal data breach intimation to the Board and Data Principals",
    "ruleText": "On becoming aware of a personal data breach, the Data Fiduciary must intimate the Data Protection Board of India — without delay, and with updated details within seventy-two hours (or such longer period as the Board allows) — and must intimate each affected Data Principal in a concise, clear and plain manner without delay.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_breach_notification_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "personal_data_breach_notification"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(6); Digital Personal Data Protection Rules, 2025, rule 7.",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(6); Digital Personal Data Protection Rules, 2025, rule 7.",
      "provisionPath": [
        "dpdpa.s8.6",
        "dpdp_rules.r7"
      ],
      "citationAliases": [
        "dpdpa.df.breach_intimation",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(6); Digital Personal Data Protection Rules, 2025, rule 7."
      ]
    },
    "selection": {
      "aliases": [
        "personal data breach intimation to the board and data principals",
        "intimate the board",
        "seventy-two hours",
        "72 hours",
        "affected data principal",
        "without delay"
      ],
      "concepts": [
        "personal",
        "data",
        "breach",
        "intimation",
        "board",
        "affected",
        "principal",
        "seventy-two",
        "hours",
        "without",
        "delay",
        "concise",
        "clear",
        "plain",
        "nature",
        "extent",
        "timing",
        "occurrence"
      ],
      "actors": [
        "provider",
        "data_subject"
      ],
      "actions": [
        "notify"
      ],
      "objects": [
        "regulated_data",
        "timeframe"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "On becoming aware of a personal data breach, the party responsible for the Data Fiduciary's compliance intimates the Data Protection Board of India without delay (with updated details within 72 hours, or such longer period as the Board allows) and intimates each affected Data Principal without delay, in a concise, clear and plain manner covering the nature/extent/timing of the breach, its likely consequences, mitigation measures, and a contact point.",
      "evidenceHints": [
        "intimate the board",
        "seventy-two hours",
        "72 hours",
        "affected data principal",
        "without delay"
      ],
      "proofStandard": "Proven only by text stating BOTH a Board-notification duty (with a numeric deadline at or inside the 72-hour statutory backstop for detailed information, or an unqualified 'without delay' floor) AND a Data-Principal-notification duty with no materially longer timeline. A clause notifying only the counterparty/business, with no Board or Data-Principal notification path, is a gap. A vague 'the parties shall cooperate on any breach' clause with no notification trigger, timing, or recipient does not satisfy this.",
      "proofElements": [
        {
          "id": "board_notification",
          "description": "The Data Protection Board of India is notified without delay, with detailed information within 72 hours or a Board-approved extension",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "data_principal_notification",
          "description": "Each affected Data Principal is notified without delay in a concise, clear and plain manner",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "breach_content_particulars",
          "description": "The notification covers the breach's nature/extent/timing, consequences, mitigation measures, and a contact point",
          "required": true,
          "kind": "conditional",
          "applicabilityGuidance": "Applies once a breach-notification duty is established; assesses the completeness of its content particulars rather than whether notification exists at all."
        }
      ],
      "clauseTypeHints": [
        "personal_data_breach_notification",
        "data_protection",
        "subprocessor_flow_down"
      ],
      "extractionTargets": [
        "breach_notification_timing",
        "security_safeguards",
        "grievance_redressal_mechanism"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding Board notification timing. Proof: a numeric deadline at or inside the 72-hour statutory backstop (or an unqualified 'without delay' floor plus a 72-hour detailed-information follow-up). Non-proof: a notification duty running only to the counterparty/business with no Board-facing path. Remediation: add a Board-notification duty with a 72-hour (or shorter) detailed-information deadline.",
        "Within the selected rule only, regarding Data Principal notification. Proof: an express duty to notify each affected Data Principal without delay, in plain language. Non-proof: silence on Data Principal notification, or a duty that runs only through the counterparty with no onward Data Principal path when the counterparty is itself the Data Fiduciary. Remediation: add a direct or flow-down Data Principal notification duty."
      ]
    },
    "legacyRequirementId": "dpdpa.df.breach_intimation"
  },
  {
    "ruleId": "dpdpa.df.erasure_flowdown",
    "label": "Erasure and cessation of processing flows down to the Data Processor",
    "ruleText": "Where a Data Principal withdraws consent or the specified purpose is no longer served, the Data Fiduciary must, within a reasonable time, itself cease and cause its Data Processor to cease processing, and must cause the Data Processor to erase any personal data made available to it for processing, unless retention is necessary for compliance with law.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_erasure_flowdown_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "subprocessor_flow_down"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), sections 6(6) and 8(7)(b).",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), sections 6(6) and 8(7)(b).",
      "provisionPath": [
        "dpdpa.s6.6",
        "dpdpa.s8.7.b"
      ],
      "citationAliases": [
        "dpdpa.df.erasure_flowdown",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), sections 6(6) and 8(7)(b)."
      ]
    },
    "selection": {
      "aliases": [
        "erasure and cessation of processing flows down to the data processor",
        "cease and cause its data processor to cease",
        "cause its data processor to erase",
        "withdraws her consent",
        "specified purpose is no longer served"
      ],
      "concepts": [
        "cease",
        "cause",
        "processor",
        "erase",
        "personal",
        "data",
        "withdraws",
        "consent",
        "specified",
        "purpose",
        "served",
        "reasonable",
        "time",
        "retention",
        "compliance",
        "law",
        "made",
        "available"
      ],
      "actors": [
        "data_subject",
        "provider",
        "subprocessor"
      ],
      "actions": [
        "erase"
      ],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "On withdrawal of consent or where the specified purpose is no longer served, the Data Fiduciary (within a reasonable time) itself ceases processing and causes its Data Processor to cease processing and to erase the personal data made available to it, unless retention is necessary for compliance with law.",
      "evidenceHints": [
        "cease and cause its data processor to cease",
        "cause its data processor to erase",
        "withdraws her consent",
        "specified purpose is no longer served"
      ],
      "proofStandard": "Proven only by text that flows the fiduciary's own cessation/erasure duty DOWN to the Data Processor — i.e. the contract obligates the processor to cease processing and erase personal data on the fiduciary's instruction (on consent withdrawal or purpose completion), subject only to a legal-retention exception. A clause addressing the fiduciary's own retention/deletion practice with no instruction-based flow-down to the processor is a gap — the processor-facing duty is the operative element, since the processor holds the data on the fiduciary's behalf. Silence on processor-side erasure entirely is not proof.",
      "proofElements": [
        {
          "id": "processor_cessation_duty",
          "description": "The Data Processor must cease processing on the Data Fiduciary's instruction",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "processor_erasure_duty",
          "description": "The Data Processor must erase personal data made available to it for processing",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "legal_retention_exception",
          "description": "Any retention exception is limited to compliance with applicable law",
          "required": true,
          "kind": "conditional",
          "applicabilityGuidance": "Applies only where the contract carves out a retention exception to the erasure/cessation duty; if no exception is stated, the core erasure duty is unqualified and this element is not raised."
        }
      ],
      "clauseTypeHints": [
        "subprocessor_flow_down",
        "data_protection",
        "data_subject_request_handling"
      ],
      "extractionTargets": [
        "processor_erasure_flowdown",
        "retention_exception",
        "consent_withdrawal_handling"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.erasure_flowdown"
  },
  {
    "ruleId": "dpdpa.df.data_quality",
    "label": "Completeness, accuracy and consistency for decisional or disclosed data",
    "ruleText": "Where personal data processed by a Data Fiduciary is likely to be used to make a decision affecting the Data Principal, or is likely to be disclosed to another Data Fiduciary, the processing Data Fiduciary must ensure its completeness, accuracy and consistency.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_data_quality_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_protection"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(3).",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(3).",
      "provisionPath": [
        "dpdpa.s8.3"
      ],
      "citationAliases": [
        "dpdpa.df.data_quality",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 8(3)."
      ]
    },
    "selection": {
      "aliases": [
        "completeness, accuracy and consistency for decisional or disclosed data",
        "completeness, accuracy and consistency",
        "used to make a decision",
        "disclosed to another data fiduciary"
      ],
      "concepts": [
        "personal",
        "data",
        "likely",
        "used",
        "decision",
        "affects",
        "disclosed",
        "another",
        "fiduciary",
        "ensure",
        "completeness",
        "accuracy",
        "consistency"
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
      "hypothesis": "Where personal data processed under the contract is likely to be used to make a decision affecting the Data Principal, or disclosed to another Data Fiduciary, the party processing it is obligated to ensure the data's completeness, accuracy and consistency.",
      "evidenceHints": [
        "completeness, accuracy and consistency",
        "used to make a decision",
        "disclosed to another data fiduciary"
      ],
      "proofStandard": "Proven only by text expressly requiring completeness, accuracy AND consistency of personal data where that data will drive a decision affecting the Data Principal or will be disclosed onward to another Data Fiduciary. A general 'data will be handled with due care' statement with no data-quality standard named does not satisfy this. If the contract's processing is not decisional and involves no onward disclosure to another Data Fiduciary, this proposition is not raised.",
      "proofElements": [
        {
          "id": "quality_standard_named",
          "description": "Completeness, accuracy and consistency are the named standard",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "decisional_or_disclosure_trigger",
          "description": "The standard is tied to decisional use or onward disclosure to another Data Fiduciary",
          "required": true,
          "kind": "conditional",
          "applicabilityGuidance": "Applies only where the contract's processing is likely to be used to make a decision affecting the Data Principal or is disclosed to another Data Fiduciary; not applicable to purely internal, non-decisional processing."
        }
      ],
      "clauseTypeHints": [
        "data_protection"
      ],
      "extractionTargets": [
        "data_quality_obligation"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.data_quality"
  },
  {
    "ruleId": "dpdpa.df.grievance_redressal",
    "label": "Effective grievance redressal mechanism and published contact",
    "ruleText": "The Data Fiduciary must establish an effective mechanism to redress Data Principal grievances, publish the business contact information of a Data Protection Officer or other responsible person, and respond to grievances within the prescribed period (not exceeding ninety days under the Rules).",
    "checkType": "judgment",
    "findingCategory": "dpdpa_grievance_redressal_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "data_subject_request_handling"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), sections 8(9), 8(10) and 13; Digital Personal Data Protection Rules, 2025, rules 9 and 14.",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), sections 8(9), 8(10) and 13; Digital Personal Data Protection Rules, 2025, rules 9 and 14.",
      "provisionPath": [
        "dpdpa.s8.9",
        "dpdpa.s8.10",
        "dpdpa.s13",
        "dpdp_rules.r9",
        "dpdp_rules.r14"
      ],
      "citationAliases": [
        "dpdpa.df.grievance_redressal",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), sections 8(9), 8(10) and 13; Digital Personal Data Protection Rules, 2025, rules 9 and 14."
      ]
    },
    "selection": {
      "aliases": [
        "effective grievance redressal mechanism and published contact",
        "effective mechanism to redress",
        "business contact information",
        "grievance redressal",
        "ninety days"
      ],
      "concepts": [
        "effective",
        "mechanism",
        "redress",
        "grievances",
        "principals",
        "publish",
        "business",
        "contact",
        "information",
        "data",
        "protection",
        "officer",
        "respond",
        "grievance",
        "prescribed",
        "period",
        "ninety",
        "days"
      ],
      "actors": [
        "data_subject",
        "provider"
      ],
      "actions": [
        "assist"
      ],
      "objects": [
        "rights_request",
        "timeframe"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The Data Fiduciary establishes an effective grievance-redressal mechanism, publishes the business contact information of a Data Protection Officer or other responsible person able to answer questions about processing, and commits to responding to grievances within a prescribed period not exceeding ninety days.",
      "evidenceHints": [
        "effective mechanism to redress",
        "business contact information",
        "grievance redressal",
        "ninety days"
      ],
      "proofStandard": "Proven only by text that (a) commits to a grievance-redressal mechanism for Data Principal complaints, AND (b) either names a contact/DPO or ties response to a numeric period at or inside the 90-day outer limit. A clause that only cross-references 'applicable data protection law' with no mechanism, contact, or timeline is a gap. Silence on grievance redressal entirely is not proof.",
      "proofElements": [
        {
          "id": "redressal_mechanism",
          "description": "An effective grievance-redressal mechanism for Data Principals is established",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "published_contact",
          "description": "Business contact information for a DPO or responsible person is published",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "response_timeline",
          "description": "Grievances are responded to within a numeric period at or inside the 90-day outer limit",
          "required": true,
          "kind": "conditional",
          "applicabilityGuidance": "Assesses the specific response deadline once a grievance mechanism exists; a mechanism with no stated deadline is a partial gap on this element, not proof that no mechanism exists at all."
        }
      ],
      "clauseTypeHints": [
        "data_subject_request_handling",
        "data_protection"
      ],
      "extractionTargets": [
        "grievance_redressal_mechanism",
        "dpo_contact_publication"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.grievance_redressal"
  },
  {
    "ruleId": "dpdpa.df.children_consent",
    "label": "Verifiable parental consent and no tracking/targeted advertising to children",
    "ruleText": "Before processing personal data of a child (or a person with disability who has a lawful guardian), the Data Fiduciary must obtain verifiable consent of the parent or lawful guardian, and must not undertake tracking or behavioural monitoring of children or targeted advertising directed at children, subject to the notified exemptions.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_children_consent_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "children_data_processing"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 9(1)-(3); Digital Personal Data Protection Rules, 2025, rules 10-12.",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 9(1)-(3); Digital Personal Data Protection Rules, 2025, rules 10-12.",
      "provisionPath": [
        "dpdpa.s9.1",
        "dpdpa.s9.3",
        "dpdp_rules.r10"
      ],
      "citationAliases": [
        "dpdpa.df.children_consent",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 9(1)-(3); Digital Personal Data Protection Rules, 2025, rules 10-12."
      ]
    },
    "selection": {
      "aliases": [
        "verifiable parental consent and no tracking/targeted advertising to children",
        "verifiable consent of the parent",
        "lawful guardian",
        "tracking or behavioural monitoring of children",
        "targeted advertising directed at children"
      ],
      "concepts": [
        "child",
        "children",
        "person",
        "disability",
        "lawful",
        "guardian",
        "verifiable",
        "consent",
        "parent",
        "processing",
        "personal",
        "data",
        "tracking",
        "behavioural",
        "monitoring",
        "targeted",
        "advertising",
        "directed",
        "detrimental",
        "well-being",
        "exemptions"
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
      "hypothesis": "Where the processing under the contract may involve a child's personal data, the Data Fiduciary obtains verifiable parental or lawful-guardian consent before processing, does not process personal data likely to cause detriment to a child's well-being, and does not undertake tracking, behavioural monitoring, or targeted advertising directed at children, except within a notified exemption.",
      "evidenceHints": [
        "verifiable consent of the parent",
        "lawful guardian",
        "tracking or behavioural monitoring of children",
        "targeted advertising directed at children"
      ],
      "proofStandard": "Proven only by text that (a) requires verifiable parental/guardian consent before processing a child's personal data, AND (b) expressly prohibits tracking/behavioural monitoring and targeted advertising directed at children (unless a notified exemption is invoked and identified). A clause obtaining consent generically with no verifiable-parental-consent mechanism for children, or one silent on the tracking/targeted-advertising prohibition, is a gap. If the contract's processing plainly excludes children's data, this proposition is not raised.",
      "proofElements": [
        {
          "id": "verifiable_parental_consent",
          "description": "Verifiable consent of the parent or lawful guardian is obtained before processing a child's data",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_detriment",
          "description": "Processing likely to cause detriment to a child's well-being is prohibited",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_tracking_or_targeted_ads",
          "description": "Tracking, behavioural monitoring, and targeted advertising directed at children are prohibited, absent a notified exemption",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "children_data_processing",
        "data_protection"
      ],
      "extractionTargets": [
        "children_consent_mechanism",
        "children_advertising_restriction"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.children_consent"
  },
  {
    "ruleId": "dpdpa.df.cross_border_transfer",
    "label": "Cross-border transfer subject to Central Government restrictions",
    "ruleText": "Personal data may be transferred outside India, but the Data Fiduciary must comply with any Central Government notification restricting transfer to a specified country or territory, and with any requirements the Central Government specifies for making personal data available to a foreign State or an entity/agency under its control.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_cross_border_transfer_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "international_transfer_mechanism"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 16; Digital Personal Data Protection Rules, 2025, rule 15.",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 16; Digital Personal Data Protection Rules, 2025, rule 15.",
      "provisionPath": [
        "dpdpa.s16",
        "dpdp_rules.r15"
      ],
      "citationAliases": [
        "dpdpa.df.cross_border_transfer",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 16; Digital Personal Data Protection Rules, 2025, rule 15."
      ]
    },
    "selection": {
      "aliases": [
        "cross-border transfer subject to central government restrictions",
        "transfer outside india",
        "restrict the transfer",
        "notified country or territory",
        "foreign state"
      ],
      "concepts": [
        "transfer",
        "personal",
        "data",
        "outside",
        "india",
        "central",
        "government",
        "notification",
        "restrict",
        "country",
        "territory",
        "notified",
        "requirements",
        "foreign",
        "state",
        "entity",
        "agency",
        "control"
      ],
      "actors": [
        "provider"
      ],
      "actions": [
        "transfer"
      ],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where the contract involves transfer of personal data outside India, it does not authorise transfer to a country or territory the Central Government has restricted by notification, and it accommodates compliance with any Central-Government-specified requirements for making personal data available to a foreign State or an entity/agency under its control.",
      "evidenceHints": [
        "transfer outside india",
        "restrict the transfer",
        "notified country or territory",
        "foreign state"
      ],
      "proofStandard": "Proven only by text that conditions any cross-border transfer of personal data on compliance with Central Government restrictions/notifications under the Act and Rules — an unconditional, unrestricted transfer clause naming no such compliance obligation is a gap for a contract that permits offshore processing. If the contract confines all processing to India with no cross-border transfer contemplated, this proposition is not raised.",
      "proofElements": [
        {
          "id": "transfer_scope_identified",
          "description": "Cross-border transfer of personal data under the contract is identified",
          "required": true,
          "kind": "conditional",
          "applicabilityGuidance": "Applies only where the contract contemplates processing or storage of personal data outside India; not applicable to a contract that confines all processing to India."
        },
        {
          "id": "government_restriction_compliance",
          "description": "The transfer is conditioned on compliance with Central Government restrictions/requirements under section 16 and rule 15",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "international_transfer_mechanism",
        "data_protection"
      ],
      "extractionTargets": [
        "cross_border_transfer_condition"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.df.cross_border_transfer"
  },
  {
    "ruleId": "dpdpa.sdf.significant_fiduciary_duties",
    "label": "Significant Data Fiduciary: DPO, data auditor and DPIA",
    "ruleText": "A Significant Data Fiduciary must appoint a Data Protection Officer based in India who is responsible to its board or governing body and is the grievance-redressal point of contact, appoint an independent data auditor, and undertake periodic Data Protection Impact Assessment and audit.",
    "checkType": "judgment",
    "findingCategory": "dpdpa_significant_fiduciary_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "significant_data_fiduciary_obligations"
    ],
    "legalHook": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 10; Digital Personal Data Protection Rules, 2025, rule 13.",
    "authority": {
      "instrument": "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
      "citation": "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 10; Digital Personal Data Protection Rules, 2025, rule 13.",
      "provisionPath": [
        "dpdpa.s10",
        "dpdp_rules.r13"
      ],
      "citationAliases": [
        "dpdpa.sdf.significant_fiduciary_duties",
        "Digital Personal Data Protection Act, 2023 (No. 22 of 2023), section 10; Digital Personal Data Protection Rules, 2025, rule 13."
      ]
    },
    "selection": {
      "aliases": [
        "significant data fiduciary: dpo, data auditor and dpia",
        "significant data fiduciary",
        "data protection officer",
        "independent data auditor",
        "data protection impact assessment"
      ],
      "concepts": [
        "significant",
        "data",
        "fiduciary",
        "appoint",
        "protection",
        "officer",
        "based",
        "india",
        "responsible",
        "board",
        "directors",
        "governing",
        "body",
        "grievance",
        "redressal",
        "point",
        "contact",
        "independent",
        "auditor",
        "periodic",
        "impact",
        "assessment",
        "audit"
      ],
      "actors": [
        "provider"
      ],
      "actions": [
        "audit"
      ],
      "objects": [
        "security_measures"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where a party to the contract is (or may be notified as) a Significant Data Fiduciary, it appoints an India-based Data Protection Officer responsible to its board or governing body and serving as the grievance-redressal contact, appoints an independent data auditor, and undertakes periodic Data Protection Impact Assessment and audit.",
      "evidenceHints": [
        "significant data fiduciary",
        "data protection officer",
        "independent data auditor",
        "data protection impact assessment"
      ],
      "proofStandard": "Proven only by text naming all three elements for a Significant Data Fiduciary — an India-based DPO reporting to the board/governing body, an independent data auditor, and periodic DPIA/audit. A clause naming only a generic 'privacy contact' with no board-reporting line, or omitting the independent-auditor or DPIA obligation, is partial. If neither party is, or is likely to be notified as, a Significant Data Fiduciary, this proposition is not raised.",
      "proofElements": [
        {
          "id": "india_based_dpo",
          "description": "An India-based Data Protection Officer responsible to the board/governing body is appointed",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "independent_data_auditor",
          "description": "An independent data auditor is appointed",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "periodic_dpia_and_audit",
          "description": "Periodic Data Protection Impact Assessment and audit are undertaken",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "significant_data_fiduciary_obligations",
        "data_protection"
      ],
      "extractionTargets": [
        "significant_fiduciary_dpo",
        "dpia_audit_cadence"
      ]
    },
    "verification": {
      "version": "1.0.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "dpdpa.sdf.significant_fiduciary_duties"
  }
];

const dpdpIndiaSkillConfig: AnalysisSkillConfig = {
  skillId: "regimes/data-protection/dpdp-india",
  axis: "regime",
  family: "data-protection",
  label: "Digital Personal Data Protection Act (India)",
  version: "0.1.0",
  appliesToDocTypes: [],
  appliesToJurisdictions: [],
  triggerPhrases: [
    "dpdpa",
    "dpdp act",
    "digital personal data protection act",
    "digital personal data protection rules",
    "data principal",
    "data fiduciary",
    "significant data fiduciary",
    "consent manager",
    "data protection board of india",
  ],
  promptLibraryIds: ["dpdpa", "dpdp", "dpdp-india", "india-dpdpa"],
  clauseTypes: [
    "data_protection",
    "data_subject_request_handling",
    "subprocessor_flow_down",
    "international_transfer_mechanism",
    "personal_data_breach_notification",
    "children_data_processing",
    "significant_data_fiduciary_obligations",
  ],
  clauseTypeDefinitions: {
    data_protection: "Core processing subject-matter, roles, and processor obligations annex.",
    data_subject_request_handling:
      "Intake, identity checks, deadlines, decisions, and communications for rights requests.",
    subprocessor_flow_down: "Subprocessor list / flow-down of processor obligations.",
    international_transfer_mechanism: "Mechanism for cross-border transfers (structural).",
    personal_data_breach_notification:
      "Intimation of personal data breach to the Data Protection Board of India and affected Data Principals.",
    children_data_processing:
      "Verifiable parental or guardian consent and restrictions on processing a child's personal data.",
    significant_data_fiduciary_obligations:
      "Additional Significant Data Fiduciary duties — Data Protection Officer, independent data auditor, and Data Protection Impact Assessment.",
  },
  clauseRetrieval: {
    data_protection: {
      headings: [
        "Data Fiduciary",
        "Data Processor",
        "Processing of Personal Data",
        "Data Protection",
      ],
      aliases: [
        "data fiduciary",
        "data processor",
        "data principal",
        "personal data",
        "valid contract",
      ],
      anchorTerms: [
        "dpdpa",
        "digital personal data protection act",
        "completeness, accuracy and consistency",
        "reasonable security safeguards",
      ],
    },
    data_subject_request_handling: {
      headings: [
        "Rights of Data Principal",
        "Grievance Redressal",
        "Data Principal Requests",
      ],
      aliases: [
        "data principal",
        "grievance redressal",
        "right to access",
        "right to correction",
        "right to erasure",
      ],
      anchorTerms: ["ninety days", "data protection officer", "nomination"],
    },
    subprocessor_flow_down: {
      headings: ["Data Processor", "Subprocessors", "Sub-processing"],
      aliases: ["data processor", "sub-processor", "flow down", "erase"],
      anchorTerms: ["cause its data processor to cease", "cause its data processor to erase"],
    },
    international_transfer_mechanism: {
      headings: ["Cross-Border Transfer", "Transfer of Personal Data Outside India"],
      aliases: ["outside india", "cross-border", "foreign state", "notified country or territory"],
      anchorTerms: ["section 16", "central government"],
    },
    personal_data_breach_notification: {
      headings: ["Personal Data Breach", "Breach Notification", "Data Protection Board"],
      aliases: [
        "personal data breach",
        "data protection board of india",
        "seventy-two hours",
        "72 hours",
        "affected data principal",
      ],
      anchorTerms: ["without delay", "intimation"],
    },
    children_data_processing: {
      headings: ["Children's Data", "Processing of Personal Data of Children"],
      aliases: [
        "child",
        "children",
        "verifiable consent",
        "lawful guardian",
        "parent",
      ],
      anchorTerms: ["tracking or behavioural monitoring", "targeted advertising"],
    },
    significant_data_fiduciary_obligations: {
      headings: ["Significant Data Fiduciary", "Data Protection Officer", "Data Protection Impact Assessment"],
      aliases: [
        "significant data fiduciary",
        "data protection officer",
        "independent data auditor",
        "data protection impact assessment",
      ],
      anchorTerms: ["dpia", "periodic audit"],
    },
  },
  expectedClauses: [
    {
      clauseType: "data_protection",
      severityIfMissing: "high",
      findingCategory: "dpdpa_fiduciary_accountability_gap",
      textSynonyms: ["data fiduciary", "data processor", "personal data"],
    },
    {
      clauseType: "personal_data_breach_notification",
      severityIfMissing: "high",
      findingCategory: "dpdpa_breach_notification_gap",
      textSynonyms: ["personal data breach", "data protection board", "72 hours"],
    },
  ],
  riskCategories: [
    {
      category: "dpdpa_processor_contract_gap",
      displayLabel: "Data Processor not engaged under a valid contract",
      guidance: "The Data Processor's engagement is not grounded in a valid, executed contract.",
    },
    {
      category: "dpdpa_fiduciary_accountability_gap",
      displayLabel: "Data Fiduciary accountability disclaimed",
      guidance: "The contract purports to shift the Data Fiduciary's own statutory accountability.",
    },
    {
      category: "dpdpa_security_safeguards_gap",
      displayLabel: "Missing DPDPA security safeguards",
      guidance: "No concrete data security, access-control, or detection/continuity measures are required.",
    },
    {
      category: "dpdpa_breach_notification_gap",
      displayLabel: "Board / Data Principal breach notification missing",
      guidance: "No 72-hour Board intimation or Data Principal breach notification path.",
    },
    {
      category: "dpdpa_erasure_flowdown_gap",
      displayLabel: "Erasure duty does not flow down to the Data Processor",
      guidance: "The Data Processor is not obligated to cease processing and erase personal data on instruction.",
    },
    {
      category: "dpdpa_data_quality_gap",
      displayLabel: "No completeness/accuracy/consistency standard",
      guidance: "Decisional or disclosed personal data carries no data-quality standard.",
    },
    {
      category: "dpdpa_grievance_redressal_gap",
      displayLabel: "Weak grievance redressal mechanism",
      guidance: "No effective grievance mechanism, published contact, or response timeline.",
    },
    {
      category: "dpdpa_children_consent_gap",
      displayLabel: "Children's data protections missing",
      guidance: "No verifiable parental consent, or no prohibition on tracking/targeted advertising to children.",
    },
    {
      category: "dpdpa_cross_border_transfer_gap",
      displayLabel: "Cross-border transfer not conditioned on government restrictions",
      guidance: "Cross-border transfer is unconditional and ignores Central Government notifications.",
    },
    {
      category: "dpdpa_significant_fiduciary_gap",
      displayLabel: "Significant Data Fiduciary duties missing",
      guidance: "No India-based DPO, independent data auditor, or periodic DPIA/audit for a Significant Data Fiduciary.",
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
      id: "dpdpa.structural_review",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: [
        "data_protection",
        "data_subject_request_handling",
        "subprocessor_flow_down",
        "international_transfer_mechanism",
        "personal_data_breach_notification",
        "children_data_processing",
        "significant_data_fiduciary_obligations",
      ],
      extractionTargets: [
        "processor_engagement_basis",
        "fiduciary_accountability",
        "security_safeguards",
        "breach_notification_timing",
        "processor_erasure_flowdown",
        "data_quality_obligation",
        "grievance_redressal_mechanism",
        "children_consent_mechanism",
        "cross_border_transfer_condition",
        "significant_fiduciary_dpo",
      ],
      requirementEvidence: {},
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "DPDPA structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "requirements_matrix", "material_gaps", "recommendations", "conclusion"],
      },
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["breach", "data protection board", "72 hours", "seventy-two hours"],
      focus: {
        ruleIds: ["dpdpa.df.breach_intimation"],
        riskCategoryIds: ["dpdpa_breach_notification_gap"],
      },
    },
    {
      triggerPhrases: ["child", "children", "parental consent", "targeted advertising"],
      focus: {
        ruleIds: ["dpdpa.df.children_consent"],
        riskCategoryIds: ["dpdpa_children_consent_gap"],
      },
    },
    {
      triggerPhrases: ["significant data fiduciary", "data protection officer", "data auditor"],
      focus: {
        ruleIds: ["dpdpa.sdf.significant_fiduciary_duties"],
        riskCategoryIds: ["dpdpa_significant_fiduciary_gap"],
      },
    },
    {
      triggerPhrases: ["cross-border", "outside india", "transfer"],
      focus: {
        ruleIds: ["dpdpa.df.cross_border_transfer"],
        riskCategoryIds: ["dpdpa_cross_border_transfer_gap"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};

export const dpdpIndiaSkill = finalizeRegimeRuleContracts(dpdpIndiaSkillConfig, {
  instrument: "Digital Personal Data Protection Act, 2023 / Digital Personal Data Protection Rules, 2025",
});
