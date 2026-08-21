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
