import type { DraftingSkillConfig } from "../../skill-contract.js";

/** DPA document-type skill — required facts, section briefs, exhibits, validation. */
export const dpaSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/dpa",
  axis: "documentType",
  label: "Data Processing Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["dpa"],
  requiredFacts: [
    {
      id: "principalAgreementDate",
      priority: "critical",
      blocking: true,
      question:
        "What is the date of the principal / master services agreement this DPA supplements? (or say 'date of last signature')",
      reasonRequired:
        "DPA recitals cite the MSA date; without it the draft emits [● DATE OF MSA].",
      coveredByEffectiveDate: true,
      aliases: ["msaDate", "dateOfMsa"],
    },
    {
      id: "processingPurpose",
      priority: "critical",
      blocking: true,
      question:
        "What is the purpose of processing personal data under this DPA (e.g. cloud hosting, analytics, support)?",
      reasonRequired:
        "Art. 28 schedules require a stated processing purpose; otherwise Schedule 1 is filled with brackets.",
      aliases: ["purposeOfProcessing"],
    },
    {
      id: "dataCategories",
      priority: "critical",
      blocking: true,
      question:
        "Which categories of personal data will be processed (e.g. contact data, account IDs, health data)?",
      reasonRequired:
        "Details of Processing must list data categories; inventing them is unsafe and creates placeholders.",
      aliases: ["phiCategories", "personalDataCategories"],
    },
    {
      id: "dataSubjects",
      priority: "critical",
      blocking: true,
      question:
        "Whose personal data is processed (e.g. customers, employees, patients, end users)?",
      reasonRequired:
        "Schedule 1 must identify data subject categories; missing this yields bracketed stubs.",
      aliases: ["dataSubjectCategories"],
    },
    {
      id: "transferMechanism",
      priority: "critical",
      blocking: true,
      question:
        "Will personal data be transferred outside the UK/EEA? If yes, which mechanism applies (EU SCCs Module 2/3, UK IDTA, adequacy decision, none)?",
      reasonRequired:
        "International transfer clauses and SCC modules change materially based on this answer.",
      options: [
        "No international transfers",
        "EU SCCs Module 2 (C2P)",
        "EU SCCs Module 3 (P2P)",
        "UK IDTA",
        "Adequacy decision only",
        "Other (specify)",
      ],
      aliases: ["sccModule", "ukIdta", "transferBasis"],
    },
  ],
  safeDefaults: {
    breachNotification: "48 hours of becoming aware",
    subprocessorNotice: "30 days prior written notice",
    auditNotice: "annual audit or SOC 2 / ISO 27001 report",
    deletionReturn: "within 30 days of termination",
  },
  sectionBriefs: [
    {
      workUnitId: "sec-parties",
      title: "Parties and Background",
      purpose: "Identify controller and processor and the principal agreement this DPA supplements.",
      requiredContent: [
        "Full legal names of both parties with Controller / Processor roles",
        "Reference to principal / MSA effective date",
        "Scope: processing on behalf of the Controller",
      ],
      requiredFacts: ["parties", "principalAgreementDate", "effectiveDate", "governingLaw"],
      requiredLegalElements: ["controller-processor identification", "principal agreement reference"],
      prohibitedContent: ["Invented third contracting parties", "Square-bracket placeholders"],
    },
    {
      workUnitId: "sec-definitions",
      title: "Definitions",
      purpose: "Define Personal Data, Processing, Sub-processor, and other DPA terms consistently.",
      requiredContent: [
        "Personal Data / Processing definitions aligned to applicable law",
        "Sub-processor definition",
        "Cross-reference to Details of Processing exhibit",
      ],
      requiredLegalElements: ["personal data definition", "processing definition"],
    },
    {
      workUnitId: "sec-processing",
      title: "Processing of Personal Data",
      purpose: "Limit processing to documented instructions and stated purpose.",
      requiredContent: [
        "Process only on documented Controller instructions",
        "Stated processing purpose from deal facts",
        "Confidentiality obligation for authorised persons",
      ],
      requiredFacts: ["processingPurpose", "dataCategories", "dataSubjects"],
      requiredLegalElements: ["documented instructions", "purpose limitation"],
      relatedExhibits: ["exhibit-processing"],
    },
    {
      workUnitId: "sec-security",
      title: "Security Measures",
      purpose: "Require appropriate technical and organisational measures (Art. 32 / equivalent).",
      requiredContent: [
        "Obligation to implement appropriate TOMs",
        "Cross-reference to Security Measures exhibit",
      ],
      requiredLegalElements: ["security measures obligation"],
      relatedExhibits: ["exhibit-security"],
    },
    {
      workUnitId: "sec-subprocessors",
      title: "Sub-processors",
      purpose: "Control engagement of sub-processors with notice and objection rights.",
      requiredContent: [
        "Prior written authorisation (specific or general) before engaging sub-processors",
        "Advance notice of intended changes with Controller objection right",
        "Flow-down of equivalent data protection obligations",
        "Processor remains liable for sub-processor performance",
      ],
      requiredLegalElements: [
        "sub-processor authorisation",
        "notice and objection",
        "flow-down obligations",
      ],
    },
    {
      workUnitId: "sec-transfers",
      title: "International Transfers",
      purpose: "Ensure a valid transfer mechanism for cross-border transfers.",
      requiredContent: [
        "Identify applicable transfer mechanism from deal facts",
        "No transfers without a lawful basis / mechanism",
      ],
      requiredFacts: ["transferMechanism"],
      requiredLegalElements: ["transfer mechanism"],
      relatedExhibits: ["exhibit-scc", "exhibit-idta"],
    },
    {
      workUnitId: "sec-assistance",
      title: "Data Subject Rights and Assistance",
      purpose: "Require Processor assistance with DSRs and Arts. 32–36 compliance.",
      requiredContent: [
        "Assist Controller with data subject requests",
        "Do not respond directly to data subjects without Controller instructions",
        "Assist with security, breach, DPIA, and prior consultation as applicable",
      ],
      requiredLegalElements: ["DSR assistance", "compliance assistance"],
    },
    {
      workUnitId: "sec-breach",
      title: "Personal Data Breach",
      purpose: "Require timely breach notification with required content.",
      requiredContent: [
        "Notify Controller without undue delay (use deal breachNotification if set)",
        "Include incident scope, affected categories, and mitigation measures",
      ],
      requiredFacts: ["breachNotification"],
      requiredLegalElements: ["breach notification"],
    },
    {
      workUnitId: "sec-return",
      title: "Return or Deletion of Data",
      purpose: "Delete or return personal data at end of services.",
      requiredContent: [
        "At Controller's choice, delete or return all personal data after services end",
        "Delete existing copies unless law requires retention",
      ],
      requiredFacts: ["deletionReturn"],
      requiredLegalElements: ["deletion or return"],
    },
    {
      workUnitId: "sec-misc",
      title: "Miscellaneous",
      purpose: "Governing law, liability interaction, and general boilerplate.",
      requiredContent: [
        "Governing law from deal facts",
        "Audit / information rights or certification alternative where applicable",
      ],
      requiredFacts: ["governingLaw"],
      requiredLegalElements: ["governing law", "audit rights"],
    },
  ],
  exhibitBriefs: [
    {
      workUnitId: "exhibit-processing",
      title: "Details of Processing",
      purpose: "Schedule of subject-matter, duration, nature, purpose, data types, and subjects.",
      requiredContent: [
        "Nature and purpose of processing",
        "Categories of personal data",
        "Categories of data subjects",
        "Duration of processing",
      ],
      requiredFacts: [
        "processingPurpose",
        "dataCategories",
        "dataSubjects",
        "effectiveDate",
      ],
      relatedSections: ["sec-processing"],
    },
    {
      workUnitId: "exhibit-security",
      title: "Technical and Organisational Measures",
      purpose: "Summarise TOMs including encryption and access controls.",
      requiredContent: [
        "Access controls",
        "Encryption in transit and/or at rest where applicable",
        "Incident response / monitoring measures",
      ],
      relatedSections: ["sec-security"],
    },
  ],
  requiredExhibits: ["exhibit-processing", "exhibit-security"],
  exhibitSpecs: [
    {
      id: "exhibit-processing",
      title: "Details of Processing",
      kind: "schedule",
      requiresFullText: false,
      parentSectionId: "sec-processing",
    },
    {
      id: "exhibit-security",
      title: "Technical and Organisational Measures",
      kind: "toms",
      requiresFullText: false,
      parentSectionId: "sec-security",
    },
  ],
  draftingRules: [
    "Skill mandatory legal elements cannot be omitted without CONFLICT status.",
    "Prefer playbook preferred/fallback wording when it does not conflict with skill elements.",
    "Use template structure/boilerplate when present; never invent parties or dates.",
  ],
  validationRules: [
    {
      id: "dpa-sec-processing-present",
      requirement: "Processing section must be present",
      severity: "critical",
      checkKind: "section_present",
      sectionTarget: "sec-processing",
    },
    {
      id: "dpa-sec-subprocessors-present",
      requirement: "Sub-processors section must be present",
      severity: "critical",
      checkKind: "section_present",
      sectionTarget: "sec-subprocessors",
    },
    {
      id: "dpa-sec-breach-present",
      requirement: "Personal data breach section must be present",
      severity: "critical",
      checkKind: "section_present",
      sectionTarget: "sec-breach",
    },
    {
      id: "dpa-sec-return-present",
      requirement: "Return or deletion section must be present",
      severity: "critical",
      checkKind: "section_present",
      sectionTarget: "sec-return",
    },
    {
      id: "dpa-exhibit-processing",
      requirement: "Details of Processing exhibit must be present",
      severity: "critical",
      checkKind: "exhibit_present",
      sectionTarget: "exhibit-processing",
    },
    {
      id: "dpa-exhibit-security",
      requirement: "TOMs / Security Measures exhibit must be present",
      severity: "critical",
      checkKind: "exhibit_present",
      sectionTarget: "exhibit-security",
    },
    {
      id: "dpa-documented-instructions",
      requirement: "Draft must require processing only on documented instructions",
      severity: "critical",
      checkKind: "required_phrase",
      sectionTarget: "sec-processing",
      requiredPhrase: "documented instructions",
    },
  ],
};
