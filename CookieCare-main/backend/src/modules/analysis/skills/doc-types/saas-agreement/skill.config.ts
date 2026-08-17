import type { AnalysisSkillConfig, SkillRegimeRule } from "../../types.js";

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
    "saas.availability_sla",
    "Numeric availability SLA with measurement window",
    "The SaaS terms should state a numeric availability commitment (source benchmark: at least 99% measured quarterly), with stated maintenance windows and exclusions, rather than a best-efforts uptime statement only.",
    "missing_sla_uptime",
    ["service_levels", "uptime_commitment"],
    "MSite SaaS Terms & Conditions cl. 2.7 — Availability Service Level of at least 99% measured quarterly."
  ),
  rule(
    "saas.service_credits",
    "Service credits for missed availability",
    "Missed availability should produce stated service credits (source benchmark: 1% credit per whole 1% below the availability SLA in the measurement period). Flag a missing credit table.",
    "missing_service_credits",
    ["service_credits"],
    "MSite SaaS Terms cl. 2.8 — 1% credit per whole 1% of unavailability below the Availability Service Level."
  ),
  rule(
    "saas.credits_sole_remedy",
    "Credits characterised as sole remedy for SLA failure",
    "Flag language making SLA credits the customer's sole and exclusive remedy for availability failure, especially where it also sits under a general liability cap.",
    "sla_credits_sole_remedy",
    ["service_credits", "limitation_of_liability"],
    "MSite SaaS Terms cl. 2.7 — credits are the customer's sole and exclusive remedy for failure to meet the Availability Service Level."
  ),
  rule(
    "saas.customer_data_ownership",
    "Customer owns customer data",
    "The customer should own all rights in Customer Data. Personal data processing should be pointed to a DPA rather than left as an implied licence to the supplier.",
    "missing_customer_data_ownership",
    ["customer_data"],
    "MSite SaaS Terms cl. 3.1–3.2 — Customer owns Customer Data; personal data requires a DPA."
  ),
  rule(
    "saas.exit_archive",
    "Post-termination archive and retrieval",
    "There should be a post-termination online and/or offline archive/retrieval path for Customer Data (source benchmark: online archive for 12 months, then offline retrieval for a further 12 months).",
    "missing_exit_archive",
    ["data_archive"],
    "MSite SaaS Terms cl. 2.5–2.6 — online archive up to 12 months after term; offline archive 12–24 months."
  ),
];

export const saasAgreementSkill: AnalysisSkillConfig = {
  skillId: "doc-types/saas-agreement",
  axis: "doc-type",
  label: "SaaS / Subscription Agreement",
  version: "1.1.0",
  extendsDocType: "doc-types/commercial-agreement",
  appliesToDocTypes: ["saas-agreement", "sla", "service-agreement"],
  triggerPhrases: [
    "saas",
    "subscription",
    "uptime",
    "service credit",
    "sla credit",
    "availability",
    "software as a service",
  ],
  promptLibraryIds: ["saas"],
  clauseTypes: [
    "service_levels",
    "service_credits",
    "uptime_commitment",
    "customer_data",
    "data_archive",
  ],
  clauseTypeDefinitions: {
    service_levels: "Measurable availability / performance commitments.",
    service_credits: "Remedies / credits when SLA is missed.",
    uptime_commitment: "Numeric uptime percentage commitment.",
    customer_data: "Customer-owned data hosted or processed in the service.",
    data_archive: "Post-termination archive / retrieval of customer data.",
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
    {
      clauseType: "customer_data",
      severityIfMissing: "high",
      findingCategory: "missing_customer_data_ownership",
      textSynonyms: ["customer data", "customer owns"],
    },
    {
      clauseType: "data_archive",
      severityIfMissing: "medium",
      findingCategory: "missing_exit_archive",
      textSynonyms: ["archive", "retrieval", "exit"],
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
    {
      category: "sla_credits_sole_remedy",
      displayLabel: "SLA credits are the sole remedy",
      guidance: "Service credits are the customer's sole and exclusive remedy for availability failure.",
    },
    {
      category: "missing_customer_data_ownership",
      displayLabel: "Customer data ownership not stated",
      guidance: "The contract does not state that the customer owns Customer Data.",
    },
    {
      category: "missing_exit_archive",
      displayLabel: "Missing post-termination data archive",
      guidance: "No post-termination archive or retrieval path for Customer Data.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  instructionFocusMap: [
    {
      triggerPhrases: ["uptime", "availability", "sla", "service credit"],
      focus: {
        ruleIds: ["saas.availability_sla", "saas.service_credits", "saas.credits_sole_remedy"],
        riskCategoryIds: [
          "missing_sla_uptime",
          "missing_service_credits",
          "sla_credits_sole_remedy",
        ],
      },
    },
    {
      triggerPhrases: ["archive", "exit", "retrieval", "customer data"],
      focus: {
        ruleIds: ["saas.customer_data_ownership", "saas.exit_archive"],
        riskCategoryIds: ["missing_customer_data_ownership", "missing_exit_archive"],
      },
    },
  ],
  relatedChecks: [
    {
      primary: "service_credits",
      related: ["limitation_of_liability"],
      note: "Sole-remedy credit language should be read against the liability cap.",
    },
  ],
  defaultOperation: "risk_flag",
};
