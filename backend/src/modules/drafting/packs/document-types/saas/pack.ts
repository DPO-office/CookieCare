import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { saasSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Recitals", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Definitions and Interpretation", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-service", kind: "section", heading: "SaaS Service and Subscription Access", dependsOn: ["sec-definitions"], clauseTypes: ["services", "license"], status: "pending" },
  { id: "sec-restrictions", kind: "section", heading: "Acceptable Use and Restrictions", dependsOn: ["sec-service"], clauseTypes: ["acceptable-use", "restrictions"], status: "pending" },
  { id: "sec-sla", kind: "section", heading: "Service Levels and Support", dependsOn: ["sec-service"], clauseTypes: ["sla", "support"], status: "pending" },
  { id: "sec-fees", kind: "section", heading: "Fees and Payment Terms", dependsOn: ["sec-definitions"], clauseTypes: ["fees"], status: "pending" },
  { id: "sec-data-protection", kind: "section", heading: "Data Protection and Privacy", dependsOn: ["sec-definitions"], clauseTypes: ["data-protection", "gdpr"], status: "pending" },
  { id: "sec-customer-data", kind: "section", heading: "Customer Data and Security", dependsOn: ["sec-definitions"], clauseTypes: ["data-security"], status: "pending" },
  { id: "sec-ip", kind: "section", heading: "Intellectual Property Rights", dependsOn: ["sec-definitions"], clauseTypes: ["ip"], status: "pending" },
  { id: "sec-confidentiality", kind: "section", heading: "Confidentiality", dependsOn: ["sec-definitions"], clauseTypes: ["confidentiality"], status: "pending" },
  { id: "sec-warranties", kind: "section", heading: "Warranties and Disclaimers", dependsOn: ["sec-definitions"], clauseTypes: ["warranties"], status: "pending" },
  { id: "sec-liability", kind: "section", heading: "Limitation of Liability", dependsOn: ["sec-definitions"], clauseTypes: ["liability"], status: "pending" },
  { id: "sec-indemnification", kind: "section", heading: "Indemnification", dependsOn: ["sec-liability"], clauseTypes: ["indemnity"], status: "pending" },
  { id: "sec-term", kind: "section", heading: "Term, Termination, and Effects of Termination", dependsOn: ["sec-definitions"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-force-majeure", kind: "section", heading: "Force Majeure", dependsOn: ["sec-definitions"], clauseTypes: ["force-majeure"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "General Provisions and Governing Law", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const saasPack: DocumentTypePack = {
  id: "saas",
  aliases: [
    "saas",
    "saas agreement",
    "saas subscription agreement",
    "software as a service",
    "subscription agreement",
    "cloud service agreement",
  ],
  skeleton,
  skillPaths: ["document-types/saas"],
  skillConfig: saasSkillConfig,
  prompts: {
    plan: (ctx) => `Plan SaaS agreement from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft SaaS section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique SaaS agreement against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: {
    clauseTags: ["saas", "subscription", "cloud", "data-security", "sla"],
    playbookTopics: ["saas-licensing", "data-security", "liability"],
  },
};
