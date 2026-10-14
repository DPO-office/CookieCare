import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";
import { finalizeRegimeRuleContracts } from "../../../runtime/catalog/rule-contract-helpers.js";


const RULES: SkillRegimeRule[] = [
  {
    "ruleId": "hipaa.baa.permitted_uses",
    "label": "PHI use and disclosure limited to the BAA",
    "ruleText": "The business associate may use or disclose PHI only as permitted or required by the BAA or as required by law, not for unaffiliated purposes. Flag an open-ended licence to use PHI.",
    "checkType": "judgment",
    "findingCategory": "hipaa_permitted_uses_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "phi_use_disclosure"
    ],
    "legalHook": "45 CFR §164.504(e); UCLA Health HIPAA BAA §3.1 Permitted Uses and Disclosures of PHI. The HHS PDF in the skills folder is a Katrina enforcement bulletin and is not used as a BAA source.",
    "authority": {
      "instrument": "HIPAA Privacy, Security and Breach Notification Rules",
      "citation": "45 CFR §164.504(e); UCLA Health HIPAA BAA §3.1 Permitted Uses and Disclosures of PHI. The HHS PDF in the skills folder is a Katrina enforcement bulletin and is not used as a BAA source.",
      "provisionPath": [
        "hipaa.baa.permitted_uses"
      ],
      "citationAliases": [
        "hipaa.baa.permitted_uses",
        "45 CFR §164.504(e); UCLA Health HIPAA BAA §3.1 Permitted Uses and Disclosures of PHI. The HHS PDF in the skills folder is a Katrina enforcement bulletin and is not used as a BAA source."
      ]
    },
    "selection": {
      "aliases": [
        "phi use and disclosure limited to the baa",
        "permitted uses and disclosures",
        "except as permitted",
        "as required by law",
        "not further use or disclose"
      ],
      "concepts": [
        "disclosure",
        "limited",
        "business",
        "associate",
        "disclose",
        "permitted",
        "required",
        "unaffiliated",
        "purposes",
        "flag",
        "open-ended",
        "licence",
        "uses",
        "disclosures",
        "except",
        "further"
      ],
      "actors": [
        "business_associate"
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
      "hypothesis": "The business associate may use or disclose PHI only as permitted or required by the BAA itself or as required by law, not for any other or unaffiliated purpose.",
      "evidenceHints": [
        "permitted uses and disclosures",
        "except as permitted",
        "as required by law",
        "not further use or disclose"
      ],
      "proofStandard": "Proven only by text expressly limiting the business associate's use and disclosure of PHI to what is permitted or required by the BAA or by law — e.g. 'Business Associate shall not use or further disclose Protected Health Information other than as permitted or required by this Agreement or as Required by Law.' An open-ended license (e.g. 'Business Associate may use PHI to provide the Services and for its own business purposes' with no BAA-bounded limitation) does not satisfy this. Silence on permitted-uses scope entirely is not proof.",
      "proofElements": [
        {
          "id": "baa_purpose_limit",
          "description": "PHI use and disclosure is limited to purposes permitted or required by the BAA",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "required_by_law_exception",
          "description": "Any required-by-law exception is expressly bounded",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_unaffiliated_use",
          "description": "Open-ended use for unaffiliated purposes is prohibited",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination"
      ],
      "extractionTargets": [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "hipaa.baa.permitted_uses"
  },
  {
    "ruleId": "hipaa.baa.minimum_necessary",
    "label": "Minimum necessary for PHI use, access, and disclosure",
    "ruleText": "Uses, access, and disclosures of PHI by the business associate must be limited to the minimum necessary to perform the permitted services.",
    "checkType": "judgment",
    "findingCategory": "hipaa_minimum_necessary_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "phi_use_disclosure"
    ],
    "legalHook": "45 CFR §164.502(b); UCLA Health HIPAA BAA §3.1.1 Minimum Necessary.",
    "authority": {
      "instrument": "HIPAA Privacy, Security and Breach Notification Rules",
      "citation": "45 CFR §164.502(b); UCLA Health HIPAA BAA §3.1.1 Minimum Necessary.",
      "provisionPath": [
        "hipaa.baa.minimum_necessary"
      ],
      "citationAliases": [
        "hipaa.baa.minimum_necessary",
        "45 CFR §164.502(b); UCLA Health HIPAA BAA §3.1.1 Minimum Necessary."
      ]
    },
    "selection": {
      "aliases": [
        "minimum necessary for phi use, access, and disclosure",
        "minimum necessary",
        "limit its request",
        "limited to the minimum amount"
      ],
      "concepts": [
        "minimum",
        "necessary",
        "access",
        "disclosure",
        "uses",
        "disclosures",
        "business",
        "associate",
        "limited",
        "perform",
        "permitted",
        "services",
        "limit",
        "request",
        "amount"
      ],
      "actors": [
        "business_associate"
      ],
      "actions": [
        "access"
      ],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Uses, access, and disclosures of PHI by the business associate are limited to the minimum necessary to perform the permitted services.",
      "evidenceHints": [
        "minimum necessary",
        "limit its request",
        "limited to the minimum amount"
      ],
      "proofStandard": "Proven only by text expressly requiring the business associate to limit PHI use, access, and disclosure to the MINIMUM NECESSARY to accomplish the intended purpose. A general permitted-uses clause with no separate minimum-necessary limitation does not satisfy this — minimum necessary is a distinct 45 CFR §164.502(b) requirement, not implied by a bare permitted-use scope statement.",
      "proofElements": [
        {
          "id": "minimum_necessary_standard",
          "description": "PHI use, access, and disclosure is limited to the minimum necessary",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "permitted_service_scope",
          "description": "The limitation is tied to performance of permitted services",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination"
      ],
      "extractionTargets": [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "hipaa.baa.minimum_necessary"
  },
  {
    "ruleId": "hipaa.baa.safeguards",
    "label": "Administrative, physical, and technical safeguards for ePHI",
    "ruleText": "The business associate must implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
    "checkType": "judgment",
    "findingCategory": "hipaa_safeguards_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "hipaa_safeguards"
    ],
    "legalHook": "45 CFR §164.314 / Security Rule; UCLA Health HIPAA BAA security covenants.",
    "authority": {
      "instrument": "HIPAA Privacy, Security and Breach Notification Rules",
      "citation": "45 CFR §164.314 / Security Rule; UCLA Health HIPAA BAA security covenants.",
      "provisionPath": [
        "hipaa.baa.safeguards"
      ],
      "citationAliases": [
        "hipaa.baa.safeguards",
        "45 CFR §164.314 / Security Rule; UCLA Health HIPAA BAA security covenants."
      ]
    },
    "selection": {
      "aliases": [
        "administrative, physical, and technical safeguards for ephi",
        "administrative, physical, and technical safeguards",
        "security rule",
        "confidentiality, integrity, and availability",
        "appropriate safeguards"
      ],
      "concepts": [
        "administrative",
        "physical",
        "technical",
        "safeguards",
        "ephi",
        "business",
        "associate",
        "implement",
        "reasonably",
        "appropriately",
        "protect",
        "confidentiality",
        "integrity",
        "availability",
        "electronic",
        "security",
        "rule",
        "appropriate"
      ],
      "actors": [
        "business_associate"
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
      "hypothesis": "The business associate implements administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
      "evidenceHints": [
        "administrative, physical, and technical safeguards",
        "security rule",
        "confidentiality, integrity, and availability",
        "appropriate safeguards"
      ],
      "proofStandard": "Proven only by text requiring safeguards across ALL THREE categories — administrative, physical, AND technical — appropriate to protect ePHI's confidentiality, integrity, and availability. A clause addressing only general 'information security measures' or only technical/IT security with no administrative or physical safeguards named is partial, not full proof. A bare 'Business Associate will comply with the Security Rule' cross-reference, with no substantive safeguard content at all, is a thin but not necessarily insufficient reference — treat as partial coverage rather than full proof unless it expressly commits to the three safeguard categories.",
      "proofElements": [
        {
          "id": "administrative_safeguards",
          "description": "Administrative safeguards protect electronic PHI",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "physical_safeguards",
          "description": "Physical safeguards protect electronic PHI",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "technical_safeguards",
          "description": "Technical safeguards protect electronic PHI",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "cia_properties",
          "description": "Safeguards protect confidentiality, integrity, and availability",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination"
      ],
      "extractionTargets": [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding The business associate implements administrative safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI. Proof: Administrative safeguards must be expressly addressed — policies, workforce training, access management, or equivalent Security Rule administrative controls. Non-proof: A general 'information security measures' clause with no administrative safeguards named. Technical/IT security language alone with no administrative limb. Remediation: Add administrative safeguards appropriate to protect ePHI confidentiality, integrity, and availability.",
        "Within the selected rule only, regarding The business associate implements physical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI. Proof: Physical safeguards must be expressly addressed — facility access, workstation security, device/media controls, or equivalent. Non-proof: Technical security controls alone with no physical safeguards named. A bare Security Rule cross-reference with no substantive physical safeguard content. Remediation: Add physical safeguards appropriate to protect ePHI confidentiality, integrity, and availability.",
        "Within the selected rule only, regarding The business associate implements technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI. Proof: Technical safeguards must be expressly addressed — access control, audit controls, integrity, transmission security, or equivalent. Non-proof: Administrative and physical safeguards named but no technical safeguards. A bare 'Business Associate will comply with the Security Rule' cross-reference with no substantive safeguard content — treat as partial, not full proof. Remediation: Add technical safeguards appropriate to protect ePHI confidentiality, integrity, and availability."
      ]
    },
    "legacyRequirementId": "hipaa.baa.safeguards"
  },
  {
    "ruleId": "hipaa.baa.subcontractor_flowdown",
    "label": "Subcontractor BAAs with equivalent restrictions",
    "ruleText": "Agents and subcontractors that create, receive, maintain, or transmit PHI for the business associate must be bound by written restrictions that are at least as protective as the BAA, including Security Rule safeguards for ePHI.",
    "checkType": "judgment",
    "findingCategory": "hipaa_subcontractor_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "subprocessor_flow_down"
    ],
    "legalHook": "45 CFR §164.504(e)(2)(ii)(D); UCLA Health HIPAA BAA subcontractor covenants.",
    "authority": {
      "instrument": "HIPAA Privacy, Security and Breach Notification Rules",
      "citation": "45 CFR §164.504(e)(2)(ii)(D); UCLA Health HIPAA BAA subcontractor covenants.",
      "provisionPath": [
        "hipaa.baa.subcontractor_flowdown"
      ],
      "citationAliases": [
        "hipaa.baa.subcontractor_flowdown",
        "45 CFR §164.504(e)(2)(ii)(D); UCLA Health HIPAA BAA subcontractor covenants."
      ]
    },
    "selection": {
      "aliases": [
        "subcontractor baas with equivalent restrictions",
        "subcontractor",
        "agent",
        "same restrictions",
        "flow down",
        "at least as protective"
      ],
      "concepts": [
        "subcontractor",
        "baas",
        "equivalent",
        "restrictions",
        "agents",
        "subcontractors",
        "create",
        "receive",
        "maintain",
        "transmit",
        "business",
        "associate",
        "bound",
        "written",
        "least",
        "protective",
        "security",
        "rule",
        "safeguards",
        "ephi",
        "agent",
        "same",
        "flow",
        "down"
      ],
      "actors": [
        "business_associate"
      ],
      "actions": [
        "restrict"
      ],
      "objects": [
        "regulated_data",
        "security_measures"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Agents and subcontractors that create, receive, maintain, or transmit PHI for the business associate are bound by written restrictions at least as protective as the BAA itself, including Security Rule safeguards for ePHI.",
      "evidenceHints": [
        "subcontractor",
        "agent",
        "same restrictions",
        "flow down",
        "at least as protective"
      ],
      "proofStandard": "Proven only by text requiring the business associate's subcontractors/agents handling PHI to be bound, IN WRITING, by restrictions that are 'the same' or 'at least as protective' as those in the BAA, including the Security Rule safeguards for ePHI. A general statement that subcontractors must 'comply with applicable law,' with no requirement that they be bound by BAA-equivalent restrictions specifically, does not satisfy this. Silence on subcontractors entirely is not proof — if the business associate uses no subcontractors at all this may be genuinely inapplicable, but a BAA template should still address the contingency.",
      "proofElements": [
        {
          "id": "covered_subcontractors",
          "description": "Agents and subcontractors handling PHI are covered",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "written_equivalent_restrictions",
          "description": "They accept written restrictions at least as protective as the BAA",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "ephi_security_flowdown",
          "description": "Security Rule safeguards flow down for electronic PHI",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination"
      ],
      "extractionTargets": [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding Agents and subcontractors that create, receive, maintain, or transmit PHI for the business associate are bound in writing to restrictions on PHI use and disclosure. Proof: Look for a written binding requirement for subcontractors/agents handling PHI — not merely an expectation of compliance with law. Non-proof: A general statement that subcontractors must 'comply with applicable law' with no written BAA-equivalent binding requirement. Silence on subcontractors entirely when the business associate may use agents or subcontractors. Remediation: Require agents and subcontractors handling PHI to be bound in writing by appropriate restrictions.",
        "Within the selected rule only, regarding Those written restrictions are at least as protective as the BAA itself, including Security Rule safeguards for ePHI. Proof: The flow-down must reach BAA-equivalent or 'same restrictions' / 'at least as protective' language, including Security Rule safeguards for ePHI. Non-proof: A requirement that subcontractors sign 'appropriate agreements' with no 'same' or 'at least as protective' standard. Written subcontractor agreements that omit Security Rule safeguards for ePHI. Remediation: Require subcontractor/agent restrictions that are the same as or at least as protective as the BAA, including Security Rule safeguards."
      ]
    },
    "legacyRequirementId": "hipaa.baa.subcontractor_flowdown"
  },
  {
    "ruleId": "hipaa.baa.breach_notice",
    "label": "Prompt breach and security-incident notice to the covered entity",
    "ruleText": "The business associate must notify the covered entity of a Breach or Security Incident in writing without unreasonable delay. The UCLA source requires notice as soon as possible and no more than two business days of discovery for specified incidents — flag notice windows longer than HIPAA's outer 60-day limit or that omit discovery-based timing.",
    "checkType": "judgment",
    "findingCategory": "hipaa_breach_notice_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "breach_notification"
    ],
    "legalHook": "45 CFR §164.410; UCLA Health HIPAA BAA written notice 'as soon as possible, but in no event more than two business days'.",
    "authority": {
      "instrument": "HIPAA Privacy, Security and Breach Notification Rules",
      "citation": "45 CFR §164.410; UCLA Health HIPAA BAA written notice 'as soon as possible, but in no event more than two business days'.",
      "provisionPath": [
        "hipaa.baa.breach_notice"
      ],
      "citationAliases": [
        "hipaa.baa.breach_notice",
        "45 CFR §164.410; UCLA Health HIPAA BAA written notice 'as soon as possible, but in no event more than two business days'."
      ]
    },
    "selection": {
      "aliases": [
        "prompt breach and security-incident notice to the covered entity",
        "notify the covered entity",
        "without unreasonable delay",
        "60 days",
        "discovery of the breach",
        "security incident"
      ],
      "concepts": [
        "prompt",
        "breach",
        "security-incident",
        "notice",
        "covered",
        "entity",
        "business",
        "associate",
        "notify",
        "security",
        "incident",
        "writing",
        "unreasonable",
        "delay",
        "ucla",
        "source",
        "requires",
        "soon",
        "possible",
        "days",
        "discovery",
        "specified",
        "incidents",
        "flag"
      ],
      "actors": [
        "business_associate",
        "covered_entity"
      ],
      "actions": [
        "notify"
      ],
      "objects": [
        "security_measures"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The business associate must notify the covered entity in writing of a Breach or Security Incident without unreasonable delay, and in any event no later than the HIPAA outer limit of 60 days after discovery, with the notice trigger tied to discovery rather than confirmation or investigation completion.",
      "evidenceHints": [
        "notify the covered entity",
        "without unreasonable delay",
        "60 days",
        "discovery of the breach",
        "security incident"
      ],
      "proofStandard": "Proven only by text stating a NUMERIC notice deadline, measured from DISCOVERY of the breach/security incident, that is at or inside HIPAA's outer 60-day limit (a shorter, more protective window such as 2 or 5 business days also satisfies this — shorter is not a gap). Contradicted by a notice window longer than 60 days, or one measured from a trigger OTHER than discovery (e.g. from 'confirmation of a reportable breach,' which can be materially later than discovery). A purely vague standard ('promptly notify') with no numeric backstop does not satisfy this.",
      "proofElements": [
        {
          "id": "incident_scope",
          "description": "Breach and applicable Security Incident events trigger notice",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "business_associate_to_entity",
          "description": "The business associate gives written notice to the covered entity",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "discovery_timing",
          "description": "Timing runs from discovery and is without unreasonable delay within the applicable outer limit",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination"
      ],
      "extractionTargets": [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding The business associate must notify the covered entity in writing of a Breach or Security Incident within a numeric deadline at or inside HIPAA's outer 60-day limit (a shorter, more protective window also satisfies this). Proof: Look for a numeric notice deadline — e.g. 60 days, 30 days, two business days — not merely 'promptly' or 'without unreasonable delay' with no backstop. Non-proof: A purely vague standard ('promptly notify', 'without unreasonable delay') with no numeric backstop. A notice window longer than 60 days from any trigger. Remediation: State a numeric written notice deadline at or inside the 60-day HIPAA outer limit.",
        "Within the selected rule only, regarding The notice deadline is measured from discovery of the breach or security incident, not from confirmation, investigation completion, or another later trigger. Proof: The trigger must be discovery-based. A deadline measured from 'confirmation of a reportable breach' or similar is a near-miss. Non-proof: A numeric deadline measured from confirmation of a reportable breach rather than discovery. A deadline measured from completion of an investigation or determination that a breach occurred. Remediation: Tie the notice deadline to discovery of the breach or security incident."
      ]
    },
    "legacyRequirementId": "hipaa.baa.breach_notice"
  },
  {
    "ruleId": "hipaa.baa.return_or_destroy",
    "label": "Return or destroy PHI at termination",
    "ruleText": "On termination, the business associate must return or destroy PHI in its possession, with a documented infeasibility exception and continuing protections if return/destruction is not feasible.",
    "checkType": "judgment",
    "findingCategory": "hipaa_return_destroy_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "deletion_on_termination"
    ],
    "legalHook": "45 CFR §164.504(e)(2)(ii)(J); UCLA Health HIPAA BAA §§5.2–5.3.",
    "authority": {
      "instrument": "HIPAA Privacy, Security and Breach Notification Rules",
      "citation": "45 CFR §164.504(e)(2)(ii)(J); UCLA Health HIPAA BAA §§5.2–5.3.",
      "provisionPath": [
        "hipaa.baa.return_or_destroy"
      ],
      "citationAliases": [
        "hipaa.baa.return_or_destroy",
        "45 CFR §164.504(e)(2)(ii)(J); UCLA Health HIPAA BAA §§5.2–5.3."
      ]
    },
    "selection": {
      "aliases": [
        "return or destroy phi at termination",
        "return or destroy",
        "upon termination",
        "not feasible",
        "extend the protections"
      ],
      "concepts": [
        "return",
        "destroy",
        "termination",
        "business",
        "associate",
        "possession",
        "documented",
        "infeasibility",
        "exception",
        "continuing",
        "protections",
        "destruction",
        "feasible",
        "extend"
      ],
      "actors": [
        "business_associate"
      ],
      "actions": [
        "return_or_destroy"
      ],
      "objects": [
        "regulated_data"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "On termination, the business associate returns or destroys PHI in its possession, with a documented infeasibility exception under which continuing protections apply if return or destruction is not feasible.",
      "evidenceHints": [
        "return or destroy",
        "upon termination",
        "not feasible",
        "extend the protections"
      ],
      "proofStandard": "Proven only by text requiring the business associate to return OR destroy PHI at termination AND addressing the infeasibility exception (where return/destruction is not feasible, the same protections continue to apply to the retained PHI for as long as it is retained). A clause requiring destruction/return with no infeasibility carve-out at all is partial — treat as a gap on the infeasibility element specifically, not a full defeat of the core obligation. Silence on return/destroy at termination entirely is not proof.",
      "proofElements": [
        {
          "id": "termination_trigger",
          "description": "Return or destruction is required on termination",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "all_phi",
          "description": "The obligation covers PHI in the business associate's possession",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "infeasibility_controls",
          "description": "Any infeasibility exception is documented and continuing protections apply",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination"
      ],
      "extractionTargets": [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding On termination, the business associate must return or destroy PHI in its possession (including copies not otherwise retained as permitted by law). Proof: Look for a termination-triggered return-or-destroy obligation for PHI — either branch or an election between them satisfies this element. Non-proof: A confidentiality-survival clause with no return or destruction at termination. Destruction-only language with no return branch where return may be required. Remediation: Require return or destruction of PHI upon termination of the arrangement.",
        "Within the selected rule only, regarding Where return or destruction is not feasible, the same protections of the BAA continue to apply to any retained PHI for as long as it is retained. Proof: The infeasibility exception must extend continuing BAA protections to retained PHI — not merely permit retention without safeguards. Non-proof: A return-or-destroy clause with no infeasibility exception at all. An infeasibility carve-out that permits retention but does not extend BAA protections to retained PHI. Remediation: Add an infeasibility exception under which the same BAA protections continue for retained PHI."
      ]
    },
    "legacyRequirementId": "hipaa.baa.return_or_destroy"
  }
];

const hipaaBaaSkillConfig: AnalysisSkillConfig = {
  skillId: "regimes/healthcare/hipaa-baa",
  axis: "regime",
  family: "healthcare",
  label: "HIPAA Business Associate Agreement",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "hipaa",
    "business associate",
    "baa",
    "protected health information",
    "hitech",
  ],
  promptLibraryIds: ["hipaa", "baa", "hipaa-baa"],
  clauseTypes: [
    "phi_use_disclosure",
    "hipaa_safeguards",
    "breach_notification",
    "subprocessor_flow_down",
    "deletion_on_termination",
  ],
  clauseTypeDefinitions: {
    phi_use_disclosure: "Permitted uses and disclosures of protected health information.",
    hipaa_safeguards: "Administrative, physical, and technical safeguards for PHI / ePHI.",
    breach_notification: "Notice to the covered entity of a Breach or Security Incident.",
    subprocessor_flow_down: "Subprocessor list / flow-down of processor obligations.",
    deletion_on_termination: "Return or deletion of personal data on termination.",
  },
  expectedClauses: [
    {
      clauseType: "phi_use_disclosure",
      severityIfMissing: "high",
      findingCategory: "hipaa_permitted_uses_gap",
      textSynonyms: ["protected health information", "permitted use", "business associate"],
    },
    {
      clauseType: "breach_notification",
      severityIfMissing: "high",
      findingCategory: "hipaa_breach_notice_gap",
      textSynonyms: ["breach", "security incident"],
    },
  ],
  riskCategories: [
    {
      category: "hipaa_permitted_uses_gap",
      displayLabel: "Unrestricted PHI use or disclosure",
      guidance: "The business associate may use or disclose PHI beyond the BAA or legal requirement.",
    },
    {
      category: "hipaa_minimum_necessary_gap",
      displayLabel: "No minimum-necessary limit on PHI",
      guidance: "PHI use, access, or disclosure is not limited to the minimum necessary.",
    },
    {
      category: "hipaa_safeguards_gap",
      displayLabel: "Missing HIPAA Security Rule safeguards",
      guidance: "No administrative, physical, and technical safeguards for ePHI.",
    },
    {
      category: "hipaa_subcontractor_gap",
      displayLabel: "HIPAA subcontractor flow-down missing",
      guidance: "Subcontractors that handle PHI are not bound by equivalent BAA restrictions.",
    },
    {
      category: "hipaa_breach_notice_gap",
      displayLabel: "HIPAA breach notice to covered entity missing",
      guidance: "No prompt written Breach / Security Incident notice to the covered entity.",
    },
    {
      category: "hipaa_return_destroy_gap",
      displayLabel: "PHI not returned or destroyed at termination",
      guidance: "No return-or-destroy duty for PHI at termination, with an infeasibility exception.",
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
      id: "hipaa.baa.structural_review",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: [
        "phi_use_disclosure",
        "hipaa_safeguards",
        "breach_notification",
        "subprocessor_flow_down",
        "deletion_on_termination",
      ],
      extractionTargets: [
        "permitted_uses",
        "minimum_necessary",
        "security_safeguards",
        "subcontractor_flow_down",
        "breach_notice_timing",
        "return_or_destroy",
      ],
      requirementEvidence: {},
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "HIPAA BAA structural review",
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
      triggerPhrases: ["breach", "security incident"],
      focus: {
        ruleIds: ["hipaa.baa.breach_notice"],
        riskCategoryIds: ["hipaa_breach_notice_gap"],
      },
    },
    {
      triggerPhrases: ["subcontractor", "agent"],
      focus: {
        ruleIds: ["hipaa.baa.subcontractor_flowdown"],
        riskCategoryIds: ["hipaa_subcontractor_gap"],
      },
    },
    {
      triggerPhrases: ["minimum necessary", "permitted use"],
      focus: {
        ruleIds: ["hipaa.baa.permitted_uses", "hipaa.baa.minimum_necessary"],
        riskCategoryIds: ["hipaa_permitted_uses_gap", "hipaa_minimum_necessary_gap"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};

export const hipaaBaaSkill = finalizeRegimeRuleContracts(hipaaBaaSkillConfig, {
  instrument: "HIPAA Privacy, Security and Breach Notification Rules",
});
