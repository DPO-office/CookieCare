import type { DraftingSkillConfig } from "../../skill-contract.js";

export const licenseSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/license",
  axis: "documentType",
  label: "Software / IP License Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["license"],
  requiredFacts: [
    {
      id: "licensedMaterial",
      priority: "critical",
      blocking: true,
      question: "What software, product, or intellectual property is being licensed?",
      reasonRequired: "A license agreement must clearly specify the licensed IP or software product.",
      placeholder: "e.g. DataSync Enterprise Server Software v3.0",
      aliases: ["licensedSoftware", "licensedProduct"],
    },
    {
      id: "licenseScope",
      priority: "critical",
      blocking: true,
      question: "What is the scope of the license (e.g. non-exclusive, worldwide, restricted seats/servers)?",
      reasonRequired: "The grant clause dictates the permitted territory, exclusivity, and use limitations.",
      options: ["Non-exclusive, worldwide", "Exclusive", "Territory-restricted"],
      placeholder: "Select license scope",
    },
    {
      id: "licenseFees",
      priority: "critical",
      blocking: true,
      question: "What are the license fees / royalties and payment terms?",
      reasonRequired: "Financial consideration is required to enforce the license terms.",
      placeholder: "e.g. $25,000 annual subscription license fee",
    },
  ],
  sectionBriefs: [
    { workUnitId: "sec-parties", title: "Parties and Recitals", purpose: "Identify Licensor and Licensee.", requiredContent: ["Licensor legal entity", "Licensee legal entity", "Effective date"] },
    { workUnitId: "sec-grant", title: "Grant of License", purpose: "Define license scope, exclusivity, territory, and field of use.", requiredContent: ["Scope of license grant", "Exclusivity and territory terms", "Permitted users"] },
    { workUnitId: "sec-restrictions", title: "License Restrictions", purpose: "Prohibit reverse engineering, sublicensing, and unauthorized copying.", requiredContent: ["No reverse engineering", "No unauthorized sublicensing", "Use limitations"] },
    { workUnitId: "sec-fees", title: "Fees and Royalties", purpose: "Specify license fees, reporting, and audit rights.", requiredContent: ["License fee amounts", "Payment schedule", "Audit verification rights"] },
    { workUnitId: "sec-ip", title: "IP Ownership", purpose: "Confirm Licensor retains full ownership of underlying IP.", requiredContent: ["Licensor IP title retention", "No implied licenses"] },
    { workUnitId: "sec-termination", title: "Term and Termination", purpose: "Govern license term and revocation on breach.", requiredContent: ["License duration", "Termination for breach", "Post-termination cessation of use"] },
    { workUnitId: "sec-misc", title: "Miscellaneous and Governing Law", purpose: "Boilerplate, jurisdiction, and legal notice.", requiredContent: ["Governing law", "Dispute resolution", "Severability"] },
  ],
};
