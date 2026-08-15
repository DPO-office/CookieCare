import type { AnalysisSkillConfig } from "../../types.js";

/**
 * Doc-shape DPA skill — structural expectations only; no named-law content.
 * GDPR-specific checks live in regimes/data-protection/gdpr.
 */
export const dpaDocTypeSkill: AnalysisSkillConfig = {
  skillId: "doc-types/dpa",
  axis: "doc-type",
  label: "Data Processing Agreement (structure)",
  version: "1.0.0",
  appliesToDocTypes: ["dpa"],
  triggerPhrases: [
    "data processing agreement",
    "dpa",
    "subprocessor",
    "processor obligations",
    "processing agreement",
  ],
  promptLibraryIds: ["dpa", "privacy"],
  clauseTypes: [
    "data_protection",
    "subprocessor_flow_down",
    "deletion_on_termination",
    "international_transfer_mechanism",
    "security_dpia_assistance",
    "definitions",
    "termination",
    "confidentiality",
    "limitation_of_liability",
    "indemnity",
    "governing_law",
  ],
  clauseTypeDefinitions: {
    data_protection: "Core processing subject-matter, roles, and processor obligations annex.",
    subprocessor_flow_down: "Subprocessor list / flow-down of processor obligations.",
    deletion_on_termination: "Return or deletion of personal data on termination.",
    international_transfer_mechanism: "Mechanism for cross-border transfers (structural).",
    security_dpia_assistance: "Security / DPIA assistance language as a structural section.",
    limitation_of_liability: "Cap or exclusion of liability between the parties.",
  },
  expectedClauses: [
    {
      clauseType: "data_protection",
      severityIfMissing: "high",
      findingCategory: "other_known_risk",
      textSynonyms: ["processing", "personal data", "processor", "controller", "subject matter"],
    },
    {
      clauseType: "subprocessor_flow_down",
      severityIfMissing: "medium",
      findingCategory: "other_known_risk",
      textSynonyms: ["subprocessor", "sub-processor", "subcontractor"],
    },
    {
      clauseType: "limitation_of_liability",
      severityIfMissing: "medium",
      findingCategory: "missing_limitation_of_liability",
      textSynonyms: ["limitation of liability"],
    },
  ],
  riskCategories: [
    { category: "missing_limitation_of_liability", displayLabel: "Missing limitation of liability", guidance: "No limitation of liability clause identified." },
    { category: "other_known_risk", displayLabel: "Other material contractual risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [],
  regimeRuleIds: [],
  defaultOperation: "compliance_check",
};
