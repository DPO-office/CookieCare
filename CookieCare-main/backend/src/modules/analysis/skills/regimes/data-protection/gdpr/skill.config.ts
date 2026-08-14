import type { AnalysisSkillConfig } from "../../../types.js";
import { buildDataProtectionRightsMatrix } from "../_family-template.js";

const GDPR_RIGHTS_MATRIX = buildDataProtectionRightsMatrix("gdpr", [
  { rowId: "gdpr.right.access", localArticleOrSection: "15", label: "Access" },
  { rowId: "gdpr.right.rectification", localArticleOrSection: "16", label: "Rectification" },
  { rowId: "gdpr.right.erasure", localArticleOrSection: "17", label: "Erasure" },
  { rowId: "gdpr.right.restriction", localArticleOrSection: "18", label: "Restriction" },
  { rowId: "gdpr.right.notification", localArticleOrSection: "19", label: "Notification to recipients" },
  { rowId: "gdpr.right.portability", localArticleOrSection: "20", label: "Portability" },
  { rowId: "gdpr.right.object", localArticleOrSection: "21", label: "Object" },
  { rowId: "gdpr.right.automated_decisions", localArticleOrSection: "22", label: "Automated decisions" },
]);

const DSR_RISK_IDS = [
  "dsr_generic_no_named_rights",
  "dsr_no_response_timeframe",
  "erasure_termination_only_gap",
  "portability_format_unaddressed",
  "automated_decision_gap",
  "recipient_notification_gap",
  "assistance_cost_or_consent_gate_risk",
];

/**
 * GDPR regime skill — independently reusable against DPA and non-DPA docs
 * that touch personal data. Doc-shape checks live in doc-types/dpa.
 */
export const gdprRegimeSkill: AnalysisSkillConfig = {
  skillId: "regimes/data-protection/gdpr",
  axis: "regime",
  family: "data-protection",
  label: "GDPR Article 28 / Chapter III",
  version: "1.1.0",
  appliesToDocTypes: ["dpa"],
  triggerPhrases: [
    "gdpr",
    "article 28",
    "data subject",
    "personal data",
    "international transfer",
    "breach notification",
    "data subject rights",
    "articles 15",
    "erasure",
    "portability",
  ],
  promptLibraryIds: ["privacy", "privacy-gdpr-dpa", "gdpr"],
  clauseTypes: [
    "data_protection",
    "data_subject_request_handling",
    "processor_assistance_obligation",
    "security_dpia_assistance",
    "deletion_on_termination",
    "subprocessor_flow_down",
    "international_transfer_mechanism",
    "automated_decision_disclosure",
  ],
  clauseTypeDefinitions: {
    data_subject_request_handling: "How the processor handles data-subject requests.",
    processor_assistance_obligation: "Processor duty to assist the controller with Chapter III rights.",
    automated_decision_disclosure: "Disclosure / human review for automated decision-making.",
  },
  expectedClauses: [
    {
      clauseType: "data_subject_request_handling",
      severityIfMissing: "high",
      findingCategory: "dsr_generic_no_named_rights",
      textSynonyms: [
        "data subject request",
        "data subject rights",
        "access request",
        "erasure request",
      ],
    },
    {
      clauseType: "processor_assistance_obligation",
      severityIfMissing: "high",
      findingCategory: "dsr_generic_no_named_rights",
      textSynonyms: ["assist the controller", "assistance", "fulfilment of the controller"],
    },
  ],
  riskCategories: [
    {
      category: "dsr_generic_no_named_rights",
      guidance:
        "DSR / assistance clause exists but does not name specific Chapter III rights (Arts 15–22).",
    },
    {
      category: "dsr_no_response_timeframe",
      guidance:
        "No numeric response timeframe tied to Art 12(3); 'promptly' or 'reasonably' alone is a gap.",
    },
    {
      category: "erasure_termination_only_gap",
      guidance: "Deletion is only on termination; no mid-term Art 17 erasure path.",
    },
    {
      category: "portability_format_unaddressed",
      guidance: "No structured / machine-readable export commitment for Art 20.",
    },
    {
      category: "automated_decision_gap",
      guidance: "Art 22 automated decision-making is unaddressed.",
    },
    {
      category: "recipient_notification_gap",
      guidance: "Art 19 notification to recipients / subprocessor flow-down is unaddressed.",
    },
    {
      category: "assistance_cost_or_consent_gate_risk",
      guidance:
        "Assistance is gated on cost, consent, or controller instruction in a way that may blow Art 12(3).",
    },
    {
      category: "missing_carve_out",
      guidance: "Required GDPR carve-outs from liability caps may be absent.",
    },
    { category: "other_known_risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: [
    {
      ruleId: "gdpr.art28.3.a",
      label: "Documented instructions-only processing",
      ruleText:
        "The processor processes personal data only on documented instructions from the controller, including regarding transfers.",
      checkType: "judgment",
      appliesToClauseTypes: ["data_protection"],
    },
    {
      ruleId: "gdpr.art28.3.b",
      label: "Confidentiality of authorised persons",
      ruleText:
        "Persons authorised to process personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.",
      checkType: "judgment",
      appliesToClauseTypes: ["data_protection", "confidentiality"],
    },
    {
      ruleId: "gdpr.art28.3.e",
      label: "Processor assistance with Chapter III data subject rights",
      ruleText:
        "The processor assists the controller, by appropriate technical and organisational measures, insofar as this is possible, for the fulfilment of the controller's obligation to respond to requests for exercising the data subject's rights laid down in Chapter III.",
      checkType: "judgment",
      appliesToClauseTypes: [
        "data_subject_request_handling",
        "processor_assistance_obligation",
        "data_protection",
      ],
      legalHook:
        "EDPB Guidelines 07/2020, para 121 — generic DSR language may meet the spirit but not the letter of Art 28(3)(e).",
    },
    {
      ruleId: "gdpr.art28.3.h",
      label: "Information and audit assistance",
      ruleText:
        "The processor makes available to the controller all information necessary to demonstrate compliance and allows for audits.",
      checkType: "judgment",
      appliesToClauseTypes: ["data_protection"],
    },
    {
      ruleId: "gdpr.art12.3",
      label: "One-month response timeframe (extendable +2 months)",
      ruleText:
        "Information shall be provided without undue delay and in any event within one month of receipt of the request; that period may be extended by two further months where necessary, taking into account the complexity and number of the requests.",
      checkType: "pattern_then_llm_judgment",
      appliesToClauseTypes: [
        "data_subject_request_handling",
        "processor_assistance_obligation",
        "data_protection",
      ],
      legalHook:
        "Controller remains liable under Art 12(3) / Art 83(5)(b) even where the processor's own language is vague.",
    },
  ],
  regimeRuleIds: [
    "gdpr.art28.3.a",
    "gdpr.art28.3.b",
    "gdpr.art28.3.e",
    "gdpr.art28.3.h",
    "gdpr.art12.3",
  ],
  rightsMatrixRows: GDPR_RIGHTS_MATRIX,
  instructionFocusMap: [
    {
      triggerPhrases: [
        "15-22",
        "15–22",
        "15 to 22",
        "articles 15",
        "article 15",
        "arts 15",
        "art 15",
        "chapter iii",
        "data subject rights",
        "data subject request",
        "dsr",
        "access",
        "erasure",
        "rectification",
        "portability",
        "right to object",
        "automated decision",
        "assistance",
        "timeframe",
        "timeframes",
        "response time",
      ],
      focus: {
        ruleIds: ["gdpr.art28.3.e", "gdpr.art12.3"],
        matrixRowIds: GDPR_RIGHTS_MATRIX.map((r) => r.rowId),
        riskCategoryIds: DSR_RISK_IDS,
      },
    },
  ],
  relatedChecks: [
    {
      primary: "data_subject_request_handling",
      related: [
        "dsr_no_response_timeframe",
        "erasure_termination_only_gap",
        "portability_format_unaddressed",
        "assistance_cost_or_consent_gate_risk",
      ],
      note: "DSR assistance is typically reviewed with response timeframes, mid-term erasure, and portability format.",
    },
    {
      primary: "limitation_of_liability",
      related: ["missing_carve_out"],
      note: "DPA liability caps are often reviewed for GDPR carve-outs.",
    },
  ],
  defaultOperation: "compliance_check",
};
