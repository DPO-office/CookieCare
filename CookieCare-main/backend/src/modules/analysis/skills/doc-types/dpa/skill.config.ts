import type { AnalysisSkillConfig, SkillRegimeRule } from "../../runtime/catalog/types.js";
import type { IntentRequirement } from "../../../models/intent.js";

/**
 * Doc-shape DPA skill — structural expectations only; no named-law content.
 * GDPR-specific checks live in regimes/data-protection/gdpr.
 */

function rule(
  ruleId: string,
  label: string,
  ruleText: string,
  findingCategory: string,
  appliesToClauseTypes: string[]
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType: "judgment",
    findingCategory,
    ruleScope: "per_document",
    appliesToClauseTypes,
  };
}

const RULES: SkillRegimeRule[] = [
  rule(
    "dpa.subject_matter_defined",
    "The agreement should state the subject matter of processing",
    "A DPA should define or annex the subject matter of the processing (what personal data processing the processor is engaged to perform), rather than leaving the processing activity unnamed.",
    "dpa_subject_matter_gap",
    ["data_protection"]
  ),
  rule(
    "dpa.duration_defined",
    "The agreement should state the duration of processing",
    "A DPA should state how long processing lasts (a term, a link to the principal agreement, or another duration), rather than leaving duration silent.",
    "dpa_duration_gap",
    ["data_protection", "termination"]
  ),
  rule(
    "dpa.nature_and_purpose_defined",
    "The agreement should state the nature and purpose of processing",
    "A DPA should describe the nature and purpose of the processing (why and how personal data is processed), rather than leaving those particulars undefined.",
    "dpa_nature_purpose_gap",
    ["data_protection"]
  ),
  rule(
    "dpa.subprocessor_flowdown_present",
    "The agreement should address subprocessors and flow-down",
    "A DPA should state whether subprocessors may be used and that processor obligations flow down to them, rather than omitting any subprocessor section.",
    "dpa_subprocessor_gap",
    ["subprocessor_flow_down"]
  ),
  rule(
    "dpa.deletion_on_termination_present",
    "The agreement should address return or deletion on termination",
    "A DPA should state whether personal data is returned or deleted when the processing ends, rather than leaving post-termination handling silent.",
    "dpa_deletion_gap",
    ["deletion_on_termination"]
  ),
  rule(
    "dpa.security_and_dpia_assistance_present",
    "The agreement should include a security or DPIA-assistance section",
    "A DPA should contain a security / assistance section (technical and organisational measures, or assistance with security assessments), as a structural heading — not a named-law adequacy judgment.",
    "dpa_security_assistance_gap",
    ["security_dpia_assistance"]
  ),
  rule(
    "dpa.international_transfer_mechanism_present",
    "The agreement should identify a cross-border transfer mechanism as a structural placeholder",
    "A DPA should identify, as a structural matter, whether a transfer / localisation mechanism is present (named module, annex, or restriction). This check does not evaluate GDPR Chapter V adequacy.",
    "dpa_transfer_mechanism_gap",
    ["international_transfer_mechanism"]
  ),
  rule(
    "dpa.confidentiality_of_staff_present",
    "The agreement should address confidentiality of persons authorised to process",
    "A DPA should state that persons authorised to process personal data are under a confidentiality duty, rather than leaving staff confidentiality silent.",
    "dpa_staff_confidentiality_gap",
    ["confidentiality", "data_protection"]
  ),
];

const AUTHORED_REQUIREMENTS: IntentRequirement[] = [
  {
    id: "dpa.subject_matter_defined",
    description: "Whether the DPA states the subject matter of processing.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.duration_defined",
    description: "Whether the DPA states the duration of processing.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.nature_and_purpose_defined",
    description: "Whether the DPA states the nature and purpose of processing.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.subprocessor_flowdown_present",
    description: "Whether the DPA addresses subprocessors and flow-down of obligations.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.deletion_on_termination_present",
    description: "Whether the DPA addresses return or deletion of personal data on termination.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.security_and_dpia_assistance_present",
    description: "Whether the DPA includes a security or DPIA-assistance section.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.international_transfer_mechanism_present",
    description: "Whether the DPA identifies a cross-border transfer mechanism as a structural placeholder.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "dpa.confidentiality_of_staff_present",
    description: "Whether the DPA addresses confidentiality of persons authorised to process.",
    type: "adequacy",
    priority: "required",
  },
];

const CLAUSE_TYPES = [
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
];

export const dpaDocTypeSkill: AnalysisSkillConfig = {
  skillId: "doc-types/dpa",
  axis: "doc-type",
  label: "Data Processing Agreement (structure)",
  version: "1.0.0",
  docTypeClassifiers: [
    {
      docTypeId: "dpa",
      priority: 90,
      patterns: [
        "\\bdata processing agreement\\b",
        "\\barticle 28\\b",
        "\\bprocessor\\b.*\\bcontroller\\b",
        "\\bdpa\\b",
      ],
    },
  ],
  appliesToDocTypes: ["dpa"],
  triggerPhrases: [
    "data processing agreement",
    "dpa",
    "subprocessor",
    "processor obligations",
    "processing agreement",
  ],
  promptLibraryIds: ["dpa", "privacy"],
  clauseTypes: CLAUSE_TYPES,
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
    {
      category: "dpa_subject_matter_gap",
      displayLabel: "Subject matter of processing not stated",
      guidance: "The DPA does not define or annex the subject matter of processing.",
    },
    {
      category: "dpa_duration_gap",
      displayLabel: "Duration of processing not stated",
      guidance: "The DPA does not state how long processing lasts.",
    },
    {
      category: "dpa_nature_purpose_gap",
      displayLabel: "Nature and purpose of processing not stated",
      guidance: "The DPA does not describe the nature and purpose of processing.",
    },
    {
      category: "dpa_subprocessor_gap",
      displayLabel: "Subprocessor / flow-down section missing",
      guidance: "The DPA does not address subprocessors or flow-down of obligations.",
    },
    {
      category: "dpa_deletion_gap",
      displayLabel: "Return or deletion on termination not stated",
      guidance: "The DPA does not address return or deletion of personal data on termination.",
    },
    {
      category: "dpa_security_assistance_gap",
      displayLabel: "Security / DPIA-assistance section missing",
      guidance: "The DPA has no structural security or DPIA-assistance section.",
    },
    {
      category: "dpa_transfer_mechanism_gap",
      displayLabel: "Transfer mechanism placeholder missing",
      guidance: "The DPA does not identify a cross-border transfer / localisation mechanism.",
    },
    {
      category: "dpa_staff_confidentiality_gap",
      displayLabel: "Staff confidentiality not stated",
      guidance: "The DPA does not address confidentiality of persons authorised to process.",
    },
    { category: "missing_limitation_of_liability", displayLabel: "Missing limitation of liability", guidance: "No limitation of liability clause identified." },
    { category: "other_known_risk", displayLabel: "Other material contractual risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  authoredRequirements: AUTHORED_REQUIREMENTS,
  evidencePackages: [
    {
      id: "dpa.structural_review",
      kind: "evaluation",
      requirementIds: AUTHORED_REQUIREMENTS.map((r) => r.id),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: CLAUSE_TYPES,
      extractionTargets: [
        "subject_matter",
        "duration",
        "nature_and_purpose",
        "subprocessor_list",
        "deletion_terms",
        "transfer_mechanism",
      ],
      sourceMode: "authored",
      requirementKinds: ["adequacy"],
      packageVersion: "0.1.0",
      label: "DPA structural review",
      report: {
        sections: [
          "scope",
          "chapeau_particulars",
          "requirements_detail",
          "qualifications",
          "recommendations",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Processing particulars",
            requirementTags: [
              "dpa.subject_matter_defined",
              "dpa.duration_defined",
              "dpa.nature_and_purpose_defined",
            ],
          },
          {
            heading: "Mandatory processor obligations",
            requirementTags: [
              "dpa.subprocessor_flowdown_present",
              "dpa.deletion_on_termination_present",
              "dpa.security_and_dpia_assistance_present",
              "dpa.confidentiality_of_staff_present",
              "dpa.international_transfer_mechanism_present",
            ],
          },
        ],
      },
    },
  ],
  defaultOperation: "compliance_check",
};
