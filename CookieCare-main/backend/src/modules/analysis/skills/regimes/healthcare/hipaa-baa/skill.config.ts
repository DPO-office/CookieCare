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
    "hipaa.baa.permitted_uses",
    "PHI use and disclosure limited to the BAA",
    "The business associate may use or disclose PHI only as permitted or required by the BAA or as required by law, not for unaffiliated purposes. Flag an open-ended licence to use PHI.",
    "hipaa_permitted_uses_gap",
    ["phi_use_disclosure"],
    "45 CFR §164.504(e); UCLA Health HIPAA BAA §3.1 Permitted Uses and Disclosures of PHI. The HHS PDF in the skills folder is a Katrina enforcement bulletin and is not used as a BAA source."
  ),
  rule(
    "hipaa.baa.minimum_necessary",
    "Minimum necessary for PHI use, access, and disclosure",
    "Uses, access, and disclosures of PHI by the business associate must be limited to the minimum necessary to perform the permitted services.",
    "hipaa_minimum_necessary_gap",
    ["phi_use_disclosure"],
    "45 CFR §164.502(b); UCLA Health HIPAA BAA §3.1.1 Minimum Necessary."
  ),
  rule(
    "hipaa.baa.safeguards",
    "Administrative, physical, and technical safeguards for ePHI",
    "The business associate must implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
    "hipaa_safeguards_gap",
    ["hipaa_safeguards"],
    "45 CFR §164.314 / Security Rule; UCLA Health HIPAA BAA security covenants."
  ),
  rule(
    "hipaa.baa.subcontractor_flowdown",
    "Subcontractor BAAs with equivalent restrictions",
    "Agents and subcontractors that create, receive, maintain, or transmit PHI for the business associate must be bound by written restrictions that are at least as protective as the BAA, including Security Rule safeguards for ePHI.",
    "hipaa_subcontractor_gap",
    ["subprocessor_flow_down"],
    "45 CFR §164.504(e)(2)(ii)(D); UCLA Health HIPAA BAA subcontractor covenants."
  ),
  rule(
    "hipaa.baa.breach_notice",
    "Prompt breach and security-incident notice to the covered entity",
    "The business associate must notify the covered entity of a Breach or Security Incident in writing without unreasonable delay. The UCLA source requires notice as soon as possible and no more than two business days of discovery for specified incidents — flag notice windows longer than HIPAA's outer 60-day limit or that omit discovery-based timing.",
    "hipaa_breach_notice_gap",
    ["breach_notification"],
    "45 CFR §164.410; UCLA Health HIPAA BAA written notice 'as soon as possible, but in no event more than two business days'."
  ),
  rule(
    "hipaa.baa.return_or_destroy",
    "Return or destroy PHI at termination",
    "On termination, the business associate must return or destroy PHI in its possession, with a documented infeasibility exception and continuing protections if return/destruction is not feasible.",
    "hipaa_return_destroy_gap",
    ["deletion_on_termination"],
    "45 CFR §164.504(e)(2)(ii)(J); UCLA Health HIPAA BAA §§5.2–5.3."
  ),
];

export const hipaaBaaSkill: AnalysisSkillConfig = {
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
      requirementEvidence: {
        "hipaa.baa.permitted_uses": {
          hypothesis:
            "The business associate may use or disclose PHI only as permitted or required by the BAA itself or as required by law, not for any other or unaffiliated purpose.",
          evidenceHints: ["permitted uses and disclosures", "except as permitted", "as required by law", "not further use or disclose"],
          proofStandard:
            "Proven only by text expressly limiting the business associate's use and " +
            "disclosure of PHI to what is permitted or required by the BAA or by " +
            "law — e.g. 'Business Associate shall not use or further disclose " +
            "Protected Health Information other than as permitted or required by " +
            "this Agreement or as Required by Law.' An open-ended license (e.g. " +
            "'Business Associate may use PHI to provide the Services and for its own " +
            "business purposes' with no BAA-bounded limitation) does not satisfy " +
            "this. Silence on permitted-uses scope entirely is not proof.",
        },
        "hipaa.baa.minimum_necessary": {
          hypothesis:
            "Uses, access, and disclosures of PHI by the business associate are limited to the minimum necessary to perform the permitted services.",
          evidenceHints: ["minimum necessary", "limit its request", "limited to the minimum amount"],
          proofStandard:
            "Proven only by text expressly requiring the business associate to limit " +
            "PHI use, access, and disclosure to the MINIMUM NECESSARY to accomplish " +
            "the intended purpose. A general permitted-uses clause with no separate " +
            "minimum-necessary limitation does not satisfy this — minimum necessary " +
            "is a distinct 45 CFR §164.502(b) requirement, not implied by a bare " +
            "permitted-use scope statement.",
        },
        "hipaa.baa.safeguards": {
          hypothesis:
            "The business associate implements administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
          evidenceHints: ["administrative, physical, and technical safeguards", "security rule", "confidentiality, integrity, and availability", "appropriate safeguards"],
          proofStandard:
            "Proven only by text requiring safeguards across ALL THREE categories — " +
            "administrative, physical, AND technical — appropriate to protect ePHI's " +
            "confidentiality, integrity, and availability. A clause addressing only " +
            "general 'information security measures' or only technical/IT security " +
            "with no administrative or physical safeguards named is partial, not " +
            "full proof. A bare 'Business Associate will comply with the Security " +
            "Rule' cross-reference, with no substantive safeguard content at all, is " +
            "a thin but not necessarily insufficient reference — treat as partial " +
            "coverage rather than full proof unless it expressly commits to the " +
            "three safeguard categories.",
        },
        "hipaa.baa.subcontractor_flowdown": {
          hypothesis:
            "Agents and subcontractors that create, receive, maintain, or transmit PHI for the business associate are bound by written restrictions at least as protective as the BAA itself, including Security Rule safeguards for ePHI.",
          evidenceHints: ["subcontractor", "agent", "same restrictions", "flow down", "at least as protective"],
          proofStandard:
            "Proven only by text requiring the business associate's subcontractors/" +
            "agents handling PHI to be bound, IN WRITING, by restrictions that are " +
            "'the same' or 'at least as protective' as those in the BAA, including " +
            "the Security Rule safeguards for ePHI. A general statement that " +
            "subcontractors must 'comply with applicable law,' with no requirement " +
            "that they be bound by BAA-equivalent restrictions specifically, does not " +
            "satisfy this. Silence on subcontractors entirely is not proof — if the " +
            "business associate uses no subcontractors at all this may be genuinely " +
            "inapplicable, but a BAA template should still address the contingency.",
        },
        "hipaa.baa.breach_notice": {
          hypothesis:
            "The business associate must notify the covered entity in writing of a Breach or Security Incident without unreasonable delay, and in any event no later than the HIPAA outer limit of 60 days after discovery, with the notice trigger tied to discovery rather than confirmation or investigation completion.",
          evidenceHints: ["notify the covered entity", "without unreasonable delay", "60 days", "discovery of the breach", "security incident"],
          proofStandard:
            "Proven only by text stating a NUMERIC notice deadline, measured from " +
            "DISCOVERY of the breach/security incident, that is at or inside HIPAA's " +
            "outer 60-day limit (a shorter, more protective window such as 2 or 5 " +
            "business days also satisfies this — shorter is not a gap). Contradicted " +
            "by a notice window longer than 60 days, or one measured from a trigger " +
            "OTHER than discovery (e.g. from 'confirmation of a reportable breach,' " +
            "which can be materially later than discovery). A purely vague standard " +
            "('promptly notify') with no numeric backstop does not satisfy this.",
        },
        "hipaa.baa.return_or_destroy": {
          hypothesis:
            "On termination, the business associate returns or destroys PHI in its possession, with a documented infeasibility exception under which continuing protections apply if return or destruction is not feasible.",
          evidenceHints: ["return or destroy", "upon termination", "not feasible", "extend the protections"],
          proofStandard:
            "Proven only by text requiring the business associate to return OR " +
            "destroy PHI at termination AND addressing the infeasibility exception " +
            "(where return/destruction is not feasible, the same protections " +
            "continue to apply to the retained PHI for as long as it is retained). A " +
            "clause requiring destruction/return with no infeasibility carve-out at " +
            "all is partial — treat as a gap on the infeasibility element " +
            "specifically, not a full defeat of the core obligation. Silence on " +
            "return/destroy at termination entirely is not proof.",
        },
      },
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
