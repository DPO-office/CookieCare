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
        "security_assistance",
        "staff_confidentiality",
      ],
      // Structural presence only — not Art 28 / Chapter V adequacy (those live in
      // regimes/data-protection/gdpr and international-transfers).
      requirementEvidence: {
        "dpa.subject_matter_defined": {
          hypothesis:
            "The DPA defines or annexes the subject matter of the processing — what personal-data processing activity the processor is engaged to perform.",
          evidenceHints: [
            "subject matter",
            "applies to the processing",
            "processing of personal data",
            "services",
            "offerings",
            "statement of work",
            "annex",
          ],
          proofStandard:
            "Proven only by text stating what personal-data processing activity or " +
            "service this DPA covers (e.g. processing in connection with named " +
            "Offerings or Services). A bare definition of 'Personal Data' or " +
            "'Processing', or a recital about the parties' commercial relationship " +
            "with no processing activity named, does not establish subject matter. " +
            "A cross-reference to an Offer/SOW/Order Form counts only if that " +
            "referenced document itself states the subject matter — a bare pointer " +
            "with no confirmation the target contains it is a dependency, not proof.",
        },
        "dpa.duration_defined": {
          hypothesis:
            "The DPA states how long processing lasts — a term, a link to the principal agreement's term, or another duration.",
          evidenceHints: [
            "duration",
            "term",
            "period",
            "for the duration",
            "in force",
            "termination",
            "end of services",
          ],
          proofStandard:
            "Proven only by text stating how long the processing continues — an " +
            "explicit term (e.g. 'for the duration of the Agreement'), a fixed " +
            "period, or an end condition tied to a specific event. Termination " +
            "rights, notice periods, or post-termination deletion timelines alone " +
            "do NOT establish duration unless they also state or clearly reference " +
            "the active processing term. Silence on duration is a gap, not proof.",
        },
        "dpa.nature_and_purpose_defined": {
          hypothesis:
            "The DPA describes both the nature (what is done with the data) and the purpose (why) of the processing.",
          evidenceHints: [
            "nature",
            "purpose",
            "processing activities",
            "business purpose",
            "provision of",
            "schedule",
            "annex",
          ],
          proofStandard:
            "Proven only when the text describes BOTH what activities are performed " +
            "on the data (nature — e.g. storage, hosting, transmission, analysis) " +
            "AND why (purpose — e.g. to provide the contracted services). Nature " +
            "without purpose, or purpose without nature, is partial, not present. " +
            "A generic 'Processor will process data in accordance with the " +
            "Agreement' statement describes neither and does not count.",
        },
        "dpa.subprocessor_flowdown_present": {
          hypothesis:
            "The DPA addresses whether subprocessors may be used and that processor obligations flow down to them.",
          evidenceHints: [
            "subprocessor",
            "sub-processor",
            "subcontractor",
            "prior written authorisation",
            "flow-down",
            "same obligations",
            "subprocessor list",
          ],
          proofStandard:
            "Proven only by text that (a) addresses whether the processor may engage " +
            "subprocessors and (b) states that data-protection obligations flow down " +
            "to them (or an equivalent contractual imposition). A bare definition of " +
            "'Subprocessor' with no engagement/flow-down mechanics is insufficient. " +
            "Silence on subprocessors entirely is a gap. This is a structural " +
            "presence check — it does not judge Art 28(2)/(4) authorisation adequacy.",
        },
        "dpa.deletion_on_termination_present": {
          hypothesis:
            "The DPA states whether personal data is returned or deleted when the processing ends.",
          evidenceHints: [
            "delete",
            "deletion",
            "return",
            "upon termination",
            "end of processing",
            "destroy",
            "at the choice of the controller",
          ],
          proofStandard:
            "Proven only by text stating a post-termination (or end-of-processing) " +
            "handling outcome for personal data — return, deletion/destruction, or " +
            "controller choice between those. A mid-term data-subject erasure right " +
            "alone does not satisfy this structural termination-handling check. " +
            "Silence on return/deletion at end of processing is a gap, not proof.",
        },
        "dpa.security_and_dpia_assistance_present": {
          hypothesis:
            "The DPA contains a security or DPIA-assistance section — technical and organisational measures, or assistance with security assessments — as a structural heading.",
          evidenceHints: [
            "technical and organisational measures",
            "security measures",
            "TOM",
            "DPIA",
            "data protection impact assessment",
            "security assistance",
            "Annex",
          ],
          proofStandard:
            "Proven only by text that includes a dedicated security / TOM section or " +
            "an express assistance duty for security assessments or DPIAs (including " +
            "by annex/schedule of measures). A bare 'comply with applicable law' " +
            "recital with no security or assistance section does not count. This " +
            "check is structural presence only — it does not judge Art 32 adequacy.",
        },
        "dpa.international_transfer_mechanism_present": {
          hypothesis:
            "The DPA identifies, as a structural matter, whether a cross-border transfer or localisation mechanism is present (named module, annex, SCCs/IDTA reference, or transfer restriction).",
          evidenceHints: [
            "international transfer",
            "cross-border",
            "standard contractual clauses",
            "SCC",
            "IDTA",
            "transfer mechanism",
            "localisation",
            "adequacy",
          ],
          proofStandard:
            "Proven only by text that structurally identifies a transfer/localisation " +
            "mechanism — e.g. named SCCs/IDTA module or annex, an express transfer " +
            "restriction, or a stated localisation commitment. Silence on transfers " +
            "entirely is a gap for this structural placeholder check. This does NOT " +
            "evaluate Chapter V / Schrems adequacy — that lives in the international-" +
            "transfers regime skill.",
        },
        "dpa.confidentiality_of_staff_present": {
          hypothesis:
            "The DPA states that persons authorised to process personal data are under a confidentiality duty.",
          evidenceHints: [
            "confidentiality",
            "confidentiality obligation",
            "authorised persons",
            "personnel",
            "employees",
            "bound to confidentiality",
            "statutory obligation of confidentiality",
          ],
          proofStandard:
            "Proven only by text obligating persons authorised to process personal " +
            "data to confidentiality (contractual or statutory). A general NDA " +
            "between the corporate parties about commercial confidential information, " +
            "with no duty on authorised processing personnel, does NOT satisfy this. " +
            "Silence on staff/authorised-person confidentiality is a gap, not proof.",
        },
      },
      sourceMode: "authored",
      requirementKinds: ["adequacy"],
      packageVersion: "1.0.0",
      label: "DPA structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
        suppressWhenPeerEvaluation: true,
      },
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
