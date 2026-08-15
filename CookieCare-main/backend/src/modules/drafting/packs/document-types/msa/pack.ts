import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Recitals", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Definitions", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-services", kind: "section", heading: "Services", dependsOn: ["sec-definitions"], clauseTypes: ["services"], status: "pending" },
  { id: "sec-fees", kind: "section", heading: "Fees and Payment", dependsOn: ["sec-definitions"], clauseTypes: ["fees"], status: "pending" },
  { id: "sec-ip", kind: "section", heading: "Intellectual Property", dependsOn: ["sec-definitions"], clauseTypes: ["ip"], status: "pending" },
  { id: "sec-liability", kind: "section", heading: "Limitation of Liability", dependsOn: ["sec-definitions"], clauseTypes: ["liability"], status: "pending" },
  { id: "sec-term", kind: "section", heading: "Term and Termination", dependsOn: ["sec-definitions"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const msaPack: DocumentTypePack = {
  id: "msa",
  aliases: ["msa", "master services agreement", "master service agreement"],
  skeleton,
  skillPaths: ["document-types/msa"],
  prompts: {
    plan: (ctx) => `Plan MSA from ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft MSA section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique MSA (${ctx.checklist.length} items)`,
  },
  retrievalHints: { clauseTags: ["msa", "services", "liability"], playbookTopics: ["liability", "termination"] },
};
