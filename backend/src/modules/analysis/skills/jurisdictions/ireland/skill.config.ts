import type { AnalysisSkillConfig, SkillRegimeRule } from "../../runtime/catalog/types.js";

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
  evidencePackages: [
    {
      id: "ie.structural_review",
      requirementIds: ["ie.eca_eidas_esign", "ie.companies_act_s43_seal"],
      capabilityIds: ["ie.eca_eidas_esign", "ie.companies_act_s43_seal"],
      clauseTypes: ["electronic_signature", "execution_formalities"],
      extractionTargets: ["esign_clause", "seal_execution_clause"],
      requirementEvidence: {
        "ie.eca_eidas_esign": {
          hypothesis:
            "Where the document is executed electronically, the document is not one of the categories excluded from standard electronic signature (a document requiring a seal, statutory witnessing, or one concerning an interest in real property) or, if it is, the execution uses an advanced electronic signature or wet-ink rather than a standard e-signature.",
          evidenceHints: ["electronic signature", "eIDAS", "advanced electronic signature", "seal", "witness", "real property"],
          proofStandard:
            "Proven only where either (a) the document is executed electronically AND " +
            "is not a seal document, a statutorily-witnessed document, or a real-" +
            "property instrument, or (b) it IS one of those excluded categories AND " +
            "the execution language specifies an advanced electronic signature (or " +
            "wet-ink) rather than a standard e-signature platform with no such " +
            "qualification. Contradicted by a standard e-signature execution block " +
            "applied to a document that is itself described as requiring a seal, a " +
            "statutory witness, or as conveying/assigning an interest in real " +
            "property, with no advanced-signature or wet-ink qualification.",
        },
        "ie.companies_act_s43_seal": {
          hypothesis:
            "Where the company seal is used to execute this instrument, the execution block reflects that the seal's use was authorised by a prior board resolution.",
          evidenceHints: ["common seal", "affixed", "board resolution", "duly authorised"],
          proofStandard:
            "Proven only where the execution block uses the company seal AND " +
            "recites or otherwise confirms board authorisation for that use (e.g. " +
            "'the common seal of the Company was affixed in the presence of, and " +
            "pursuant to a resolution of, the board of directors'). A seal-execution " +
            "block with no reference to board authorisation at all is a gap, not " +
            "proof. If the document is not sealed (ordinary signature execution " +
            "only), this proposition is not raised — treat as not applicable.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      label: "Ireland jurisdiction overlay review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "key_findings", "material_gaps", "conclusion"],
      },
    },
  ],
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
