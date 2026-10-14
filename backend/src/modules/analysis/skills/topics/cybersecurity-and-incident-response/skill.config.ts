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

const NIS2_RULES: SkillRegimeRule[] = [
  rule(
    "nis2.art21.risk_management",
    "NIS2 cybersecurity risk-management measures",
    "An essential or important entity in scope of NIS2 should be able to demonstrate appropriate and proportionate technical, operational, and organisational measures to manage risks to network and information systems, including incident handling, supply-chain security, vulnerability handling, and continuity. Flag contracts that omit these operational duties for an in-scope private entity.",
    "nis2_risk_management_gap",
    ["security_measures"],
    "Directive (EU) 2022/2555 Art. 21 — cybersecurity risk-management measures (legal duty for in-scope essential/important entities)."
  ),
  rule(
    "nis2.art23.incident_reporting",
    "NIS2 incident reporting timelines",
    "In-scope entities must report significant incidents: early warning without undue delay and in any event within 24 hours of becoming aware; incident notification within 72 hours; and a final report. Contracts should not impose a longer exclusive notice path that would prevent the entity meeting these timelines.",
    "nis2_incident_reporting_gap",
    ["incident_response"],
    "Directive (EU) 2022/2555 Art. 23 — reporting obligations (legal duty)."
  ),
];

const CSF_RULES: SkillRegimeRule[] = [
  rule(
    "nist.csf.govern",
    "CSF 2.0 Govern outcomes",
    "Where the parties adopt NIST CSF 2.0 as a contractual standard, look for Govern outcomes: cybersecurity risk-management strategy, roles, oversight, and supply-chain risk governance. CSF outcomes are recommendations unless the contract makes them binding.",
    "nist_csf_govern_gap",
    ["security_measures"],
    "NIST CSWP 29 CSF 2.0 — Govern (GV) function. Recommendation unless incorporated by contract; not a NIS2 legal duty."
  ),
  rule(
    "nist.csf.detect_respond_recover",
    "CSF 2.0 Detect, Respond, Recover",
    "Where CSF 2.0 is the chosen framework, Detect, Respond, and Recover outcomes should be reflected in incident-response and restoration language. Keep these distinct from NIS2 Article 23 legal reporting clocks.",
    "nist_csf_drr_gap",
    ["incident_response"],
    "NIST CSF 2.0 Detect (DE), Respond (RS), Recover (RC) functions. Recommendation unless incorporated by contract."
  ),
];

const RULES = [...NIS2_RULES, ...CSF_RULES];

export const cybersecurityIncidentSkill: AnalysisSkillConfig = {
  skillId: "topics/cybersecurity-and-incident-response",
  axis: "topic",
  label: "Cybersecurity and incident response",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "nis2",
    "nist csf",
    "cybersecurity framework",
    "incident response",
    "incident reporting",
    "cybersecurity risk-management",
  ],
  promptLibraryIds: ["cybersecurity", "nis2", "nist-csf"],
  clauseTypes: ["security_measures", "incident_response"],
  clauseTypeDefinitions: {
    security_measures: "Technical, operational, and organisational cybersecurity measures.",
    incident_response: "Incident handling, notification, and restoration mechanics.",
  },
  expectedClauses: [
    {
      clauseType: "incident_response",
      severityIfMissing: "high",
      findingCategory: "nis2_incident_reporting_gap",
      textSynonyms: ["incident", "notify", "24 hours", "72 hours"],
    },
  ],
  riskCategories: [
    {
      category: "nis2_risk_management_gap",
      displayLabel: "NIS2 risk-management measures missing",
      guidance: "In-scope NIS2 cybersecurity risk-management measures are not addressed.",
    },
    {
      category: "nis2_incident_reporting_gap",
      displayLabel: "NIS2 incident-reporting clocks missing",
      guidance: "NIS2 24-hour / 72-hour incident-reporting duties are not operationalised.",
    },
    {
      category: "nist_csf_govern_gap",
      displayLabel: "NIST CSF Govern outcomes missing",
      guidance: "CSF 2.0 Govern outcomes are not reflected where CSF is the chosen standard.",
    },
    {
      category: "nist_csf_drr_gap",
      displayLabel: "NIST CSF Detect/Respond/Recover missing",
      guidance: "CSF 2.0 Detect, Respond, or Recover outcomes are not reflected where CSF is the chosen standard.",
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
      id: "cybersecurity.structural_review",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: ["security_measures", "incident_response"],
      extractionTargets: ["risk_management_measures", "incident_reporting_timelines", "governance_outcomes", "detect_respond_recover"],
      requirementEvidence: {
        "nis2.art21.risk_management": {
          hypothesis:
            "Where an in-scope essential or important entity is a party, the contract reflects appropriate and proportionate technical, operational, and organisational measures to manage network and information system risks, including incident handling, supply-chain security, and vulnerability handling.",
          evidenceHints: ["risk management measures", "technical and organisational measures", "supply chain security", "vulnerability handling", "business continuity"],
          proofStandard:
            "Proven only by text naming at least several of the specific NIS2 Article " +
            "21 measure categories — incident handling, supply-chain security, " +
            "vulnerability handling/disclosure, or business continuity — not a bare " +
            "'appropriate security measures' boilerplate with none of these named. A " +
            "generic information-security clause with no supply-chain or " +
            "vulnerability-handling content is a partial gap. If neither party is " +
            "identifiable as an in-scope NIS2 essential/important entity, this " +
            "proposition is not raised — treat as not applicable rather than " +
            "contradicted.",
        },
        "nis2.art23.incident_reporting": {
          hypothesis:
            "Where an in-scope entity is a party, the contract's incident-notification path does not impose a longer or exclusive timeline that would prevent that entity meeting NIS2's statutory clocks — an early warning without undue delay and within 24 hours of becoming aware, incident notification within 72 hours, and a final report.",
          evidenceHints: ["24 hours", "72 hours", "early warning", "without undue delay", "significant incident", "notify the authority"],
          proofStandard:
            "Proven only where the contract's incident-notification timeline is " +
            "silent on, or expressly compatible with (equal to or faster than), the " +
            "24-hour early-warning and 72-hour notification clocks — e.g. it does " +
            "not require internal/contractual notice review or sign-off that would " +
            "structurally prevent meeting a 24-hour external deadline. Contradicted " +
            "by a contractual notice clock LONGER than 72 hours that is framed as " +
            "the exclusive or gating notification path (e.g. 'the sole notice " +
            "mechanism is the vendor's incident portal, updated within 5 business " +
            "days'), which would obstruct the statutory timeline. If neither party " +
            "is an in-scope NIS2 entity, this proposition is not raised.",
        },
        "nist.csf.govern": {
          hypothesis:
            "Where the parties adopt NIST CSF 2.0 as a binding contractual standard, the contract reflects Govern-function outcomes — a cybersecurity risk-management strategy, defined roles, oversight, and supply-chain risk governance.",
          evidenceHints: ["nist csf", "govern function", "risk management strategy", "roles and responsibilities", "supply chain risk"],
          proofStandard:
            "Proven only where the contract (a) makes CSF 2.0 binding (an express " +
            "incorporation clause, not merely a passing mention), AND (b) names at " +
            "least a risk-management strategy/policy and defined security roles or " +
            "oversight. A bare reference to 'NIST CSF' with no binding-incorporation " +
            "language and no Govern-outcome content does not satisfy this. If CSF is " +
            "not adopted as a contractual standard at all, this proposition is not " +
            "raised — treat as not applicable.",
        },
        "nist.csf.detect_respond_recover": {
          hypothesis:
            "Where the parties adopt NIST CSF 2.0 as the chosen framework, the contract's incident-response and restoration language reflects Detect, Respond, and Recover outcomes, distinct from any separate NIS2 Article 23 legal reporting clock.",
          evidenceHints: ["detect", "respond", "recover", "restoration", "incident response plan", "business continuity"],
          proofStandard:
            "Proven only where the contract (a) makes CSF 2.0 binding, AND (b) its " +
            "incident-response provisions address detection capability, a response " +
            "process, AND a recovery/restoration commitment — not merely a " +
            "notification-timing clause alone (notification timing satisfies NIS2 " +
            "Article 23, not the broader CSF Detect/Respond/Recover outcomes). If CSF " +
            "is not adopted as a contractual standard at all, this proposition is not " +
            "raised — treat as not applicable.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "Cybersecurity and incident response structural review",
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
      triggerPhrases: ["nis2", "essential entit", "important entit", "24 hours", "72 hours"],
      focus: {
        ruleIds: NIS2_RULES.map((r) => r.ruleId),
        riskCategoryIds: ["nis2_risk_management_gap", "nis2_incident_reporting_gap"],
      },
    },
    {
      triggerPhrases: ["nist csf", "cybersecurity framework", "csf 2.0"],
      focus: {
        ruleIds: CSF_RULES.map((r) => r.ruleId),
        riskCategoryIds: ["nist_csf_govern_gap", "nist_csf_drr_gap"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};
