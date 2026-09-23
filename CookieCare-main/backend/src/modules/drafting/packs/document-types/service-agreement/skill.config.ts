import type { DraftingSkillConfig } from "../../skill-contract.js";

export const serviceAgreementSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/service-agreement",
  axis: "documentType",
  label: "Service Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["service-agreement"],
  requiredFacts: [
    {
      id: "servicesDescription",
      priority: "critical",
      blocking: true,
      question: "Briefly describe the specific services to be performed.",
      reasonRequired: "Service agreement must define scope of services.",
      placeholder: "e.g. IT consulting, database migration, and cloud maintenance",
      aliases: ["serviceScope"],
    },
    {
      id: "compensation",
      priority: "critical",
      blocking: true,
      question: "What is the fee or compensation structure (e.g. fixed fee, hourly rate, milestones)?",
      reasonRequired: "Payment terms and fee schedules are required.",
      placeholder: "e.g. $150 per hour, invoiced bi-weekly",
    },
  ],
  sectionBriefs: [
    { workUnitId: "sec-parties", title: "Parties and Recitals", purpose: "Identify Contractor and Client.", requiredContent: ["Contractor entity", "Client entity", "Effective date"] },
    { workUnitId: "sec-services", title: "Services and Deliverables", purpose: "Define scope of services, milestones, and deliverables.", requiredContent: ["Services description", "Deliverables checklist", "Milestone schedule"] },
    { workUnitId: "sec-fees", title: "Fees and Payment", purpose: "Compensation, invoicing, expenses, and payment terms.", requiredContent: ["Fee rates / amounts", "Invoicing terms", "Reimbursable expenses policy"] },
    { workUnitId: "sec-term", title: "Term and Termination", purpose: "Duration and termination notice rights.", requiredContent: ["Agreement duration", "Termination for convenience notice", "Termination for cause"] },
    { workUnitId: "sec-misc", title: "Miscellaneous", purpose: "Governing law, jurisdiction, and notices.", requiredContent: ["Governing law", "Independent contractor status", "Notices"] },
  ],
};
