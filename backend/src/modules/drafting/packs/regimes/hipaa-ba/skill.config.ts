import type { DraftingSkillConfig } from "../../skill-contract.js";

/** HIPAA Business Associate regime — activates when PHI is involved. */
export const hipaaBaSkillConfig: DraftingSkillConfig = {
  skillId: "regimes/hipaa-ba",
  axis: "regime",
  label: "HIPAA Business Associate",
  version: "1.0.0",
  appliesToDocTypes: ["dpa", "baa", "msa"],
  sectionBriefs: [
    {
      workUnitId: "sec-hipaa-ba",
      title: "HIPAA Business Associate Obligations",
      purpose:
        "Statutory BA floor under 45 CFR §164.504(e) when PHI is created, received, maintained, or transmitted.",
      requiredContent: [
        "Permitted and required uses/disclosures of PHI; prohibit all others",
        "Appropriate safeguards including Security Rule for ePHI",
        "Report breaches and security incidents involving PHI",
        "Flow-down to subcontractors with PHI access",
        "Support individual access, amendment, and accounting-of-disclosures",
        "Make practices available to HHS for compliance review",
        "Return or destroy PHI at termination where feasible",
        "Termination-for-cause for material breach",
      ],
      requiredLegalElements: [
        "permitted uses/disclosures",
        "safeguards",
        "breach reporting",
        "subcontractor flow-down",
        "individual rights support",
        "HHS access",
        "return/destruction",
        "termination for cause",
      ],
      requiredFacts: ["phiInvolved", "dataCategories"],
      prohibitedContent: [
        "Omitting HHS access clause",
        "Treating HIPAA numeric deadlines as statutory when they are playbook/SHOULD defaults only",
      ],
    },
  ],
  validationRules: [
    {
      id: "hipaa-ba-section-present",
      requirement: "HIPAA BA section must be present when PHI is involved",
      severity: "critical",
      checkKind: "section_present",
      sectionTarget: "sec-hipaa-ba",
      when: (facts) => facts.phiInvolved === true,
    },
    {
      id: "hipaa-safeguards-phrase",
      requirement: "Safeguards obligation should appear in HIPAA BA section",
      severity: "warning",
      checkKind: "required_phrase",
      sectionTarget: "sec-hipaa-ba",
      requiredPhrase: "safeguard",
      when: (facts) => facts.phiInvolved === true,
    },
  ],
};
