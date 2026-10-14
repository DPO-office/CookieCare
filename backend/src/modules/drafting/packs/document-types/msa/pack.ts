import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { msaSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Recitals", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Terms and Definitions", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-services", kind: "section", heading: "Subject Matter and Rendering Services", dependsOn: ["sec-definitions"], clauseTypes: ["services"], status: "pending" },
  { id: "sec-confidentiality", kind: "section", heading: "Confidentiality", dependsOn: ["sec-definitions"], clauseTypes: ["confidentiality"], status: "pending" },
  { id: "sec-ip", kind: "section", heading: "Intellectual Property Rights", dependsOn: ["sec-definitions"], clauseTypes: ["ip"], status: "pending" },
  { id: "sec-fees", kind: "section", heading: "Remuneration and Payment Procedure", dependsOn: ["sec-definitions"], clauseTypes: ["fees"], status: "pending" },
  { id: "sec-liability", kind: "section", heading: "Limitation of Liability", dependsOn: ["sec-definitions"], clauseTypes: ["liability"], status: "pending" },
  { id: "sec-term", kind: "section", heading: "Term and Termination", dependsOn: ["sec-definitions"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-force-majeure", kind: "section", heading: "Force Majeure", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Dispute Resolution, Amendments, and Governing Law", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const msaPack: DocumentTypePack = {
  id: "msa",
  aliases: ["msa", "master services agreement", "master service agreement", "master agreement"],
  skeleton,
  skillPaths: ["document-types/msa"],
  skillConfig: msaSkillConfig,
  prompts: {
    plan: (ctx) => `Plan MSA from ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft MSA section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique MSA (${ctx.checklist.length} items)`,
  },
  retrievalHints: { clauseTags: ["msa", "services", "liability"], playbookTopics: ["liability", "termination"] },
};
