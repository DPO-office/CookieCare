import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Definitions", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-sla", kind: "section", heading: "Service Levels", dependsOn: ["sec-definitions"], clauseTypes: ["sla"], status: "pending" },
  { id: "sec-credits", kind: "section", heading: "Service Credits", dependsOn: ["sec-sla"], clauseTypes: ["credits"], status: "pending" },
  { id: "sec-support", kind: "section", heading: "Support", dependsOn: ["sec-definitions"], clauseTypes: ["support"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const slaPack: DocumentTypePack = {
  id: "sla",
  aliases: ["sla", "service level agreement"],
  skeleton,
  skillPaths: ["document-types/sla"],
  prompts: {
    plan: (ctx) => `Plan SLA from ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft SLA section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique SLA (${ctx.checklist.length} items)`,
  },
  retrievalHints: { clauseTags: ["sla", "uptime"], playbookTopics: ["service-levels"] },
};
