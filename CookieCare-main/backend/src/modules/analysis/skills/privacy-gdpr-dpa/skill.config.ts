import type { AnalysisSkillConfig } from "../types.js";

export const privacyGdprDpaSkill: AnalysisSkillConfig = {
  skillId: "privacy-gdpr-dpa",
  label: "GDPR Article 28 DPA Compliance",
  version: "1.0.0",
  appliesToDocTypes: ["dpa"],
  triggerPhrases: [
    "gdpr",
    "article 28",
    "data processing agreement",
    "dpa",
    "subprocessor",
    "data subject",
    "personal data",
    "processor obligations",
    "international transfer",
    "breach notification",
  ],
  promptLibraryIds: ["privacy"],
  clauseTypes: [
    "data_protection",
    "definitions",
    "termination",
    "confidentiality",
    "limitation_of_liability",
    "indemnity",
    "governing_law",
  ],
  expectedClauses: [
    {
      clauseType: "data_protection",
      severityIfMissing: "high",
      findingCategory: "other_known_risk",
      textSynonyms: ["processing", "personal data", "processor", "controller", "subject matter"],
    },
    {
      clauseType: "limitation_of_liability",
      severityIfMissing: "medium",
      findingCategory: "missing_limitation_of_liability",
      textSynonyms: ["limitation of liability"],
    },
  ],
  riskCategories: [
    { category: "missing_carve_out", guidance: "Required GDPR carve-outs from liability caps may be absent." },
    { category: "other_known_risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [
    {
      ruleId: "gdpr.art28.3.a",
      ruleText:
        "The processor processes personal data only on documented instructions from the controller, including regarding transfers.",
      checkType: "judgment",
      appliesToClauseTypes: ["data_protection"],
    },
    {
      ruleId: "gdpr.art28.3.b",
      ruleText:
        "Persons authorised to process personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.",
      checkType: "judgment",
      appliesToClauseTypes: ["data_protection", "confidentiality"],
    },
    {
      ruleId: "gdpr.art28.3.h",
      ruleText:
        "The processor makes available to the controller all information necessary to demonstrate compliance and allows for audits.",
      checkType: "judgment",
      appliesToClauseTypes: ["data_protection"],
    },
  ],
  defaultOperation: "compliance_check",
};
