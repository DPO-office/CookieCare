import type { DraftingSkillConfig } from "../../skill-contract.js";

export const slaSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/sla",
  axis: "documentType",
  label: "Service Level Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["sla"],
  requiredFacts: [
    {
      id: "uptimeCommitment",
      priority: "critical",
      blocking: true,
      question: "What is the target uptime / availability percentage (e.g. 99.9%)?",
      reasonRequired: "SLA must state explicit service availability commitment targets.",
      options: ["99.5%", "99.9%", "99.95%", "99.99%"],
      aliases: ["availabilityTarget", "uptimeTarget"],
    },
    {
      id: "creditStructure",
      priority: "critical",
      blocking: true,
      question: "What service credit percentages apply if SLA targets are breached?",
      reasonRequired: "SLA remedies specify credit percentage tiers based on monthly downtime.",
      aliases: ["serviceCredits"],
    },
  ],
  safeDefaults: {
    uptimeCommitment: "99.9% monthly availability",
    maintenanceNotice: "At least 5 business days advance notice for planned maintenance",
  },
  sectionBriefs: [
    { workUnitId: "sec-parties", title: "Parties", purpose: "Identify Service Provider and Customer.", requiredContent: ["Provider entity", "Customer entity", "Effective date"] },
    { workUnitId: "sec-definitions", title: "Definitions", purpose: "Define Availability, Downtime, Scheduled Maintenance, and Service Credits.", requiredContent: ["Uptime definition", "Downtime calculation", "Scheduled maintenance carveout"] },
    { workUnitId: "sec-sla", title: "Service Levels", purpose: "Set monthly uptime commitments and measurement metrics.", requiredContent: ["Target uptime percentage", "Measurement window", "Measurement methodology"] },
    { workUnitId: "sec-credits", title: "Service Credits", purpose: "Define credit request procedures, percentage tiers, and credit caps.", requiredContent: ["Credit tier percentages", "Claim window", "Monthly credit cap"] },
    { workUnitId: "sec-support", title: "Support and Incident Response", purpose: "Specify issue severity levels (P1-P4) and response SLAs.", requiredContent: ["Severity definitions", "Target response times", "Target resolution times"] },
    { workUnitId: "sec-misc", title: "Miscellaneous", purpose: "Sole remedy provisions, exclusions, and governing law.", requiredContent: ["Sole and exclusive remedy clause", "Force majeure exclusions", "Governing law"] },
  ],
};
