import type {
  AnalysisSkillConfig,
  PropositionPattern,
  SkillRegimeRule,
} from "../../runtime/catalog/types.js";

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

const EBA_RULES: SkillRegimeRule[] = [
  rule(
    "eba.outsourcing.pre_assessment",
    "Pre-outsourcing analysis for critical or important functions",
    "Before outsourcing a critical or important function, the institution should complete a pre-outsourcing analysis covering supervisory conditions, operational and concentration risk, and whether the arrangement is outsourcing at all. Flag vendor contracts that skip this assessment for in-scope financial institutions.",
    "eba_pre_outsourcing_gap",
    ["outsourcing_governance"],
    "EBA/GL/2019/02 Title III / §12 Pre-outsourcing analysis. Supervisory guideline for in-scope institutions — not a MiFID/PSD2/FCA regime pack."
  ),
  rule(
    "eba.outsourcing.audit_access",
    "Access, information, and audit rights",
    "Outsourcing arrangements for critical or important functions should preserve the institution's and competent authority's access, information, and audit rights, including to sub-outsourced service locations.",
    "eba_audit_access_gap",
    ["audit_rights"],
    "EBA/GL/2019/02 §13.3 Access, information and audit rights."
  ),
  rule(
    "eba.outsourcing.exit",
    "Documented exit strategy",
    "For critical or important outsourcing, the institution should have a documented exit strategy and contractual termination assistance so the function can be reintegrated or transferred without undue disruption.",
    "eba_exit_strategy_gap",
    ["exit_strategy"],
    "EBA/GL/2019/02 exit-strategy expectations for critical or important functions."
  ),
  rule(
    "eba.outsourcing.suboutsourcing",
    "Control of sub-outsourcing of critical functions",
    "Sub-outsourcing of critical or important functions should require prior notice or consent mechanics and equivalent flow-down of audit, access, and security duties.",
    "eba_suboutsourcing_gap",
    ["subprocessor_flow_down"],
    "EBA/GL/2019/02 §13.1 Sub-outsourcing of critical or important functions."
  ),
];

const NIST_RULES: SkillRegimeRule[] = [
  rule(
    "nist.800161.cscm",
    "C-SCRM supply-chain risk practices",
    "Where NIST SP 800-161 is the chosen diligence standard, look for cyber supply-chain risk management practices: supplier assessment, flow-down of security requirements, and ongoing monitoring. These are NIST recommendations unless the contract incorporates them.",
    "nist_cscm_gap",
    ["outsourcing_governance"],
    "NIST SP 800-161r1 Cybersecurity Supply Chain Risk Management. Recommendation unless incorporated by contract; distinct from EBA legal/supervisory outsourcing duties."
  ),
];

const RULES = [...EBA_RULES, ...NIST_RULES];

/**
 * S2 negotiation-risk patterns (Plan-Phase 5). Distinct from the EBA/NIST
 * regimeRules above — those are regulatory compliance checks; these are
 * general commercial-risk patterns PLAN's generate-propositions.ts matches
 * against whatever the inventory pass actually found in the document.
 * Authoring bar: would a first-year associate know exactly what to check and
 * reject from this sentence alone (ACT_AND_PLAN_REDESIGN_RESEARCH.md Phase 3).
 */
const VENDOR_RISK_PATTERNS: PropositionPattern[] = [
  {
    id: "termination_asymmetry",
    clauseTypes: ["termination"],
    hypothesis: "The termination rights in this agreement are not balanced between the parties.",
    proofStandard:
      "Compare each party's termination grounds and notice/cure periods as stated. Flag as " +
      "asymmetric only if one party may terminate for convenience, or on materially shorter " +
      "notice or more lenient breach/cure thresholds, than the other — cite the specific " +
      "sub-clause granting the narrower right. Do not flag a difference that reflects the " +
      "parties' different roles (e.g. a data controller's statutory right to object to a " +
      "subprocessor change) as asymmetry, and do not flag it if both parties' rights match on " +
      "their face.",
    priority: 80,
  },
  {
    id: "liability_cap_adequacy",
    clauseTypes: ["limitation_of_liability"],
    hypothesis: "The liability cap may not adequately protect {{party}}.",
    proofStandard:
      "Identify the stated cap (a fee multiple, fixed sum, or carve-out structure) and whether " +
      "{{party}}'s realistic exposure — data breach costs, third-party claims, regulatory fines " +
      "— could exceed it. Flag as inadequate for {{party}} only if the cap is below 12 months' " +
      "fees AND has no carve-out excluding data-breach or confidentiality liability from the " +
      "cap. A cap that excludes those categories from the cap (i.e. leaves them uncapped) is " +
      "adequate. Do not flag a cap as inadequate merely because a cap exists — a cap is a normal " +
      "commercial term.",
    priority: 90,
  },
  {
    id: "indemnification_scope",
    clauseTypes: ["indemnity"],
    hypothesis: "The indemnification obligations may be one-sided or too narrow to cover {{party}}'s realistic risk.",
    proofStandard:
      "Check whether indemnification runs in both directions or only from one party, and " +
      "whether the indemnified categories include the risks relevant to this agreement (data " +
      "breach, IP infringement, third-party claims, confidentiality breach). Flag as inadequate " +
      "for {{party}} only if indemnification does not run in {{party}}'s favor for the " +
      "counterparty's own breaches, or if data-protection/confidentiality breaches are excluded " +
      "from the indemnified categories entirely. Do not flag standard carve-outs (e.g. excluding " +
      "indirect/consequential damages) as inadequate — that is ordinary drafting.",
    priority: 85,
  },
  {
    id: "audit_rights_adequacy",
    clauseTypes: ["audit_rights"],
    hypothesis: "The audit rights may be insufficient for {{party}} to verify compliance.",
    proofStandard:
      "Identify whether {{party}} has the right to audit the counterparty's data-processing " +
      "controls, including: frequency (at least annually), scope (access to relevant records, " +
      "facilities, and personnel), who may conduct the audit ({{party}} directly or an " +
      "independent third-party auditor), and whether prior notice is required. Flag as inadequate " +
      "only if audit rights are absent entirely, limited to reviewing SOC reports with no " +
      "on-site option, or subject to unreasonable conditions (e.g. counterparty can refuse an " +
      "audit without cause). Do not flag reasonable administrative requirements (advance notice, " +
      "confidentiality of audit findings) as inadequate.",
    priority: 70,
  },
];

export const vendorRiskDiligenceSkill: AnalysisSkillConfig = {
  skillId: "topics/vendor-risk-and-diligence",
  axis: "topic",
  label: "Vendor risk and diligence",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "eba outsourcing",
    "outsourcing guidelines",
    "nist 800-161",
    "supply chain risk",
    "vendor diligence",
    "third-party risk",
    "critical or important function",
    "biggest weaknesses",
    "what should i negotiate",
    "negotiation risk",
    "unfavorable terms",
    "contract weaknesses",
    "top risks",
    "key risks",
    "main risks",
  ],
  promptLibraryIds: ["vendor-risk", "eba-outsourcing", "nist-800-161"],
  clauseTypes: [
    "outsourcing_governance",
    "audit_rights",
    "exit_strategy",
    "subprocessor_flow_down",
  ],
  clauseTypeDefinitions: {
    outsourcing_governance: "Pre-outsourcing assessment, register, and ongoing outsourcing governance.",
    audit_rights: "Access, information, and audit rights over the service provider.",
    exit_strategy: "Termination assistance and reintegration or transfer of an outsourced function.",
    subprocessor_flow_down: "Subprocessor list / flow-down of processor obligations.",
  },
  expectedClauses: [
    {
      clauseType: "audit_rights",
      severityIfMissing: "high",
      findingCategory: "eba_audit_access_gap",
      textSynonyms: ["audit", "access rights", "competent authority"],
    },
    {
      clauseType: "exit_strategy",
      severityIfMissing: "medium",
      findingCategory: "eba_exit_strategy_gap",
      textSynonyms: ["exit", "termination assistance", "transition"],
    },
  ],
  riskCategories: [
    {
      category: "eba_pre_outsourcing_gap",
      displayLabel: "Missing pre-outsourcing analysis",
      guidance: "No pre-outsourcing analysis for a critical or important function.",
    },
    {
      category: "eba_audit_access_gap",
      displayLabel: "Missing outsourcing audit and access rights",
      guidance: "The institution or competent authority lacks access, information, or audit rights.",
    },
    {
      category: "eba_exit_strategy_gap",
      displayLabel: "Missing outsourcing exit strategy",
      guidance: "No documented exit strategy or termination assistance for critical outsourcing.",
    },
    {
      category: "eba_suboutsourcing_gap",
      displayLabel: "Uncontrolled sub-outsourcing of critical functions",
      guidance: "Sub-outsourcing of critical or important functions lacks notice, consent, or flow-down.",
    },
    {
      category: "nist_cscm_gap",
      displayLabel: "NIST C-SCRM practices not addressed",
      guidance: "NIST SP 800-161 supply-chain risk practices are not reflected where that standard is chosen.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  propositionPatterns: VENDOR_RISK_PATTERNS,
  evidencePackages: [
    {
      id: "vendor_risk.structural_review",
      kind: "evaluation",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: [
        "outsourcing_governance",
        "audit_rights",
        "exit_strategy",
        "subprocessor_flow_down",
      ],
      extractionTargets: [
        "pre_outsourcing_analysis",
        "audit_access_rights",
        "exit_strategy",
        "suboutsourcing_controls",
        "cscm_practices",
      ],
      requirementEvidence: {
        "eba.outsourcing.pre_assessment": {
          hypothesis:
            "Before outsourcing a critical or important function, the arrangement reflects a pre-outsourcing analysis covering supervisory conditions, operational and concentration risk, and whether the arrangement is outsourcing at all.",
          evidenceHints: [
            "pre-outsourcing",
            "critical or important function",
            "outsourcing assessment",
            "concentration risk",
            "due diligence",
            "outsourcing register",
          ],
          proofStandard:
            "Proven only by text documenting or contractually requiring a pre-" +
            "outsourcing analysis for a critical or important function — covering " +
            "at least supervisory/conditions review, operational risk, and " +
            "concentration risk (or an equivalent diligence pack). A generic " +
            "'vendor due diligence was performed' recital with no critical/" +
            "important-function assessment content does not satisfy this. This " +
            "applies to in-scope financial institutions under EBA/GL/2019/02; if " +
            "the document/parties are clearly outside that supervisory scope, " +
            "treat as not applicable rather than a gap. Silence on any pre-" +
            "outsourcing analysis for an in-scope critical outsourcing is a gap.",
        },
        "eba.outsourcing.audit_access": {
          hypothesis:
            "Outsourcing arrangements for critical or important functions preserve the institution's and competent authority's access, information, and audit rights, including over sub-outsourced service locations where relevant.",
          evidenceHints: [
            "audit rights",
            "access rights",
            "information rights",
            "competent authority",
            "regulator audit",
            "subcontractor locations",
          ],
          proofStandard:
            "Proven only by text granting the institution (and, where stated, the " +
            "competent authority) access, information, and audit rights over the " +
            "outsourced service — including, where sub-outsourcing is contemplated, " +
            "rights that reach sub-outsourced locations or an equivalent flow-down. " +
            "A right limited solely to receiving a SOC/ISO report with no on-site " +
            "or records-access option, or silence on audit/access entirely, is a " +
            "gap for critical/important outsourcing. Reasonable notice and " +
            "confidentiality conditions on audits do not defeat this.",
        },
        "eba.outsourcing.exit": {
          hypothesis:
            "For critical or important outsourcing, the arrangement includes a documented exit strategy and contractual termination assistance so the function can be reintegrated or transferred without undue disruption.",
          evidenceHints: [
            "exit strategy",
            "termination assistance",
            "transition services",
            "reintegration",
            "transfer of services",
            "wind-down",
          ],
          proofStandard:
            "Proven only by text that provides BOTH (a) an exit/transition plan or " +
            "express exit-strategy commitment for the outsourced function and (b) " +
            "contractual termination assistance (or equivalent transition services) " +
            "enabling reintegration or transfer. A bare termination-for-convenience " +
            "right with no assistance/transition mechanics is partial at best, not " +
            "full proof. Silence on exit/termination assistance for critical " +
            "outsourcing is a gap.",
        },
        "eba.outsourcing.suboutsourcing": {
          hypothesis:
            "Sub-outsourcing of critical or important functions requires prior notice or consent mechanics and equivalent flow-down of audit, access, and security duties.",
          evidenceHints: [
            "sub-outsourcing",
            "subcontractor",
            "prior written consent",
            "prior notice",
            "flow-down",
            "equivalent obligations",
          ],
          proofStandard:
            "Proven only by text that (a) requires prior notice and/or consent " +
            "before sub-outsourcing critical or important functions and (b) flows " +
            "down audit, access, and security (or equivalent) duties to sub-" +
            "outsourcers. A bare right for the provider to use subcontractors " +
            "freely, with no notice/consent and no flow-down, does not satisfy " +
            "this. Silence on sub-outsourcing controls is a gap where critical/" +
            "important outsourcing is in scope.",
        },
        "nist.800161.cscm": {
          hypothesis:
            "Where NIST SP 800-161 is the chosen diligence standard, the arrangement reflects cyber supply-chain risk management practices: supplier assessment, flow-down of security requirements, and ongoing monitoring.",
          evidenceHints: [
            "NIST 800-161",
            "C-SCRM",
            "supply chain risk",
            "supplier assessment",
            "security requirements flow-down",
            "ongoing monitoring",
          ],
          proofStandard:
            "Proven only when NIST SP 800-161 / C-SCRM is clearly the chosen " +
            "diligence standard (by incorporation or instruction focus) AND the " +
            "text addresses supplier assessment, security-requirement flow-down, " +
            "and ongoing monitoring (or equivalent C-SCRM practices). If NIST " +
            "800-161 is not invoked as the standard for this review, treat as " +
            "not applicable — do not invent a gap from silence. Where the " +
            "standard is chosen, a generic 'comply with industry security " +
            "practices' statement with no supplier-assessment or flow-down/" +
            "monitoring content is a gap, not proof.",
        },
      },
      sourceMode: "authored",
      requirementKinds: ["adequacy"],
      packageVersion: "1.0.0",
      label: "Vendor risk and outsourcing structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: [
          "executive_summary",
          "key_findings",
          "material_gaps",
          "recommendations",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "EBA outsourcing controls",
            requirementTags: [
              "eba.outsourcing.pre_assessment",
              "eba.outsourcing.audit_access",
              "eba.outsourcing.exit",
              "eba.outsourcing.suboutsourcing",
            ],
          },
          {
            heading: "NIST C-SCRM",
            requirementTags: ["nist.800161.cscm"],
          },
        ],
      },
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["eba", "outsourcing", "critical or important"],
      focus: {
        ruleIds: EBA_RULES.map((r) => r.ruleId),
        riskCategoryIds: [
          "eba_pre_outsourcing_gap",
          "eba_audit_access_gap",
          "eba_exit_strategy_gap",
          "eba_suboutsourcing_gap",
        ],
      },
    },
    {
      triggerPhrases: ["nist 800-161", "c-scrm", "supply chain risk"],
      focus: {
        ruleIds: NIST_RULES.map((r) => r.ruleId),
        riskCategoryIds: ["nist_cscm_gap"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};
