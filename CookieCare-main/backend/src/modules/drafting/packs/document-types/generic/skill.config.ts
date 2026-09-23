import type { DraftingSkillConfig } from "../../skill-contract.js";

export const genericSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/generic",
  axis: "documentType",
  label: "General Legal Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["generic"],
  requiredFacts: [
    {
      id: "parties",
      priority: "critical",
      blocking: true,
      question: "Who are the contracting parties to this agreement?",
      reasonRequired: "Party names are required throughout the agreement preamble and signature blocks.",
      aliases: ["partyA", "partyB"],
    },
    {
      id: "governingLaw",
      priority: "critical",
      blocking: true,
      question: "Which law and jurisdiction govern this agreement?",
      reasonRequired: "Governing law determines the legal framework and enforcement venue.",
      options: [
        "Republic of Ireland (EU)",
        "Germany (EU)",
        "Delaware (US)",
        "England & Wales",
        "India",
        "Other (specify)",
      ],
      aliases: ["jurisdiction"],
    },
    {
      id: "effectiveDate",
      priority: "critical",
      blocking: true,
      question: "What is the effective date of this agreement?",
      reasonRequired: "An effective date establishes when contractual obligations begin.",
    },
  ],
  sectionBriefs: [
    {
      workUnitId: "sec-parties",
      title: "Parties and Background",
      purpose: "Identify all contracting entities, their addresses, and the context of the agreement.",
      requiredContent: ["Full legal names of all parties", "Effective date", "Recitals / background statement"],
    },
    {
      workUnitId: "sec-definitions",
      title: "Definitions",
      purpose: "Define key defined terms used in the agreement.",
      requiredContent: ["Defined terms in bold", "Alphabetical organization"],
    },
    {
      workUnitId: "sec-obligations",
      title: "Scope and Obligations",
      purpose: "Specify the core duties, promises, and obligations of each party.",
      requiredContent: ["Core contractual covenants", "Performance standards and scope"],
    },
    {
      workUnitId: "sec-term",
      title: "Term and Termination",
      purpose: "Set agreement duration, renewal conditions, and termination rights.",
      requiredContent: ["Initial term length", "Termination for cause and convenience", "Effects of termination"],
    },
    {
      workUnitId: "sec-liability",
      title: "Liability and Indemnification",
      purpose: "Allocate risks, set liability caps, and define indemnification obligations.",
      requiredContent: ["Limitation of liability cap", "Indemnification procedures", "Disclaimer of indirect damages"],
    },
    {
      workUnitId: "sec-misc",
      title: "Miscellaneous and Governing Law",
      purpose: "Boilerplate clauses including notice, severability, entire agreement, and governing law.",
      requiredContent: ["Governing law & jurisdiction", "Notice addresses", "Entire agreement clause"],
    },
  ],
};
