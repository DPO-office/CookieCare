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
