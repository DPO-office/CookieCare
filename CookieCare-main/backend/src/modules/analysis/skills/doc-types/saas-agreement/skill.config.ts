import type { AnalysisSkillConfig } from "../../types.js";

/**
 * SaaS delta on commercial-agreement — proves doc-type inheritance.
 */
export const saasAgreementSkill: AnalysisSkillConfig = {
  skillId: "doc-types/saas-agreement",
  axis: "doc-type",
  label: "SaaS / Subscription Agreement",
  version: "1.0.0",
  extendsDocType: "doc-types/commercial-agreement",
  appliesToDocTypes: ["saas-agreement", "sla", "service-agreement"],
  triggerPhrases: [
    "saas",
    "subscription",
    "uptime",
    "service credit",
    "sla credit",
    "availability",
  ],
  promptLibraryIds: ["saas"],
  clauseTypes: ["service_levels", "service_credits", "uptime_commitment"],
  clauseTypeDefinitions: {
    service_levels: "Measurable availability / performance commitments.",
    service_credits: "Remedies / credits when SLA is missed.",
    uptime_commitment: "Numeric uptime percentage commitment.",
  },
  expectedClauses: [
    {
      clauseType: "service_levels",
      severityIfMissing: "high",
      findingCategory: "missing_sla_uptime",
      textSynonyms: ["service level", "uptime", "availability", "99."],
    },
    {
      clauseType: "service_credits",
      severityIfMissing: "medium",
      findingCategory: "missing_service_credits",
      textSynonyms: ["service credit", "sla credit", "service level credit"],
    },
  ],
  riskCategories: [
    {
      category: "missing_sla_uptime",
      displayLabel: "Missing measurable uptime commitment",
      guidance: "No measurable uptime / availability commitment identified.",
    },
    {
      category: "missing_service_credits",
      displayLabel: "Missing service-credit remedy",
      guidance: "No service-credit remedy when SLA is missed.",
    },
  ],
  regimeRules: [],
  regimeRuleIds: [],
  defaultOperation: "risk_flag",
};
