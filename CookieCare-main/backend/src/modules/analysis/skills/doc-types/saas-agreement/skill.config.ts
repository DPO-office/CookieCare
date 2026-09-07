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
  docTypeClassifiers: [
    {
      docTypeId: "saas-agreement",
      priority: 75,
      patterns: [
        "\\bsaas\\b",
        "\\bsoftware as a service\\b",
        "\\bsubscription agreement\\b",
        "\\bservice level agreement\\b",
        "\\bsla\\b",
        "\\buat\\b.*\\bservice credit",
      ],
    },
    {
      docTypeId: "service-agreement",
      priority: 60,
      patterns: ["\\bservice agreement\\b"],
    },
  ],
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
  evidencePackages: [
    {
      id: "saas.structural_review",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: [
        "service_levels",
        "service_credits",
        "uptime_commitment",
        "customer_data",
        "data_archive",
        "limitation_of_liability",
      ],
      extractionTargets: [
        "availability_sla",
        "service_credit_table",
        "sole_remedy_language",
        "customer_data_ownership",
        "exit_archive",
      ],
      requirementEvidence: {
        "saas.availability_sla": {
          hypothesis:
            "The SaaS terms state a numeric availability commitment (benchmark: at least 99% measured quarterly) with stated maintenance windows and exclusions, rather than a best-efforts uptime statement only.",
          evidenceHints: ["99%", "availability service level", "uptime", "measured", "maintenance window", "excluded downtime"],
          proofStandard:
            "Proven only by text stating a specific NUMERIC availability percentage " +
            "(e.g. '99.9% availability') together with a stated measurement window " +
            "(e.g. monthly or quarterly). A best-efforts or 'commercially reasonable " +
            "uptime' statement with no numeric percentage does not satisfy this. A " +
            "numeric percentage below approximately 99% measured quarterly, or with " +
            "no stated measurement window at all, is a partial gap, not full proof.",
        },
        "saas.service_credits": {
          hypothesis:
            "Missed availability produces stated service credits, following a defined credit scale (benchmark: roughly 1% credit per whole 1% of unavailability below the availability SLA in the measurement period).",
          evidenceHints: ["service credit", "credit table", "% credit", "unavailability", "measurement period"],
          proofStandard:
            "Proven only by text stating a specific credit remedy tied to missed " +
            "availability, with a defined scale or table relating the shortfall " +
            "(percentage points below the SLA) to a stated credit amount or " +
            "percentage. A clause stating only that 'customer may be entitled to " +
            "credits' with no scale, percentage, or table does not satisfy this. " +
            "Silence on any credit remedy for missed SLA is not proof.",
        },
        "saas.credits_sole_remedy": {
          hypothesis:
            "The SLA credit clause characterizes service credits as the customer's sole and exclusive remedy for an availability failure.",
          polarity: "risk_present",
          evidenceHints: ["sole remedy", "exclusive remedy", "sole and exclusive"],
          proofStandard:
            "Proven (i.e., the risk is present) only by text expressly stating that " +
            "service credits are the customer's SOLE or EXCLUSIVE remedy for failure " +
            "to meet the availability SLA. A credit clause that is silent on whether " +
            "other remedies remain available does not prove this risk — silence is " +
            "not the same as an express sole-remedy statement. General limitation-of-" +
            "liability language capping damages is a related but distinct risk and " +
            "does not by itself prove this specific 'sole remedy' characterization " +
            "unless it expressly ties back to the SLA credit as the only remedy.",
        },
        "saas.customer_data_ownership": {
          hypothesis:
            "The customer owns all rights in Customer Data, and personal data processing is addressed through a separate DPA rather than left as an implied license to the supplier.",
          evidenceHints: ["customer data", "customer owns", "all right, title and interest", "dpa", "data processing agreement"],
          proofStandard:
            "Proven only by text expressly stating that the CUSTOMER owns (or retains " +
            "all right, title, and interest in) Customer Data, AND that personal-data " +
            "processing is governed by a referenced DPA. Text that grants the supplier " +
            "a broad, perpetual, or ownership-like license to Customer Data (rather " +
            "than a narrow license limited to providing the service) is a gap, not " +
            "proof. Silence on data ownership, or a generic 'all IP in the platform " +
            "belongs to Supplier' clause that does not distinguish Customer Data from " +
            "platform IP, does not satisfy this.",
        },
        "saas.exit_archive": {
          hypothesis:
            "There is a post-termination online and/or offline archive/retrieval path for Customer Data (benchmark: online archive for approximately 12 months after termination, then offline retrieval for a further 12 months).",
          evidenceHints: ["post-termination", "archive", "retrieval", "12 months", "offline retention", "exit assistance"],
          proofStandard:
            "Proven only by text stating a specific post-termination window during " +
            "which the customer can retrieve or access Customer Data (online archive, " +
            "offline archive, or export assistance), naming at least an approximate " +
            "duration. A clause stating only that data is 'deleted upon termination' " +
            "with no retrieval window contradicts this. Silence on any post-" +
            "termination data access is a gap, not proof.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      label: "SaaS structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "key_findings", "material_gaps", "recommendations", "conclusion"],
      },
    },
  ],
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
