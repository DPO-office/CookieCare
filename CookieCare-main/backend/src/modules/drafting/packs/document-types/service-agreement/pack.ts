import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Definitions", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-scope", kind: "section", heading: "Scope of Services", dependsOn: ["sec-definitions"], clauseTypes: ["services"], status: "pending" },
  { id: "sec-fees", kind: "section", heading: "Fees", dependsOn: ["sec-definitions"], clauseTypes: ["fees"], status: "pending" },
  { id: "sec-term", kind: "section", heading: "Term", dependsOn: ["sec-definitions"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const serviceAgreementPack: DocumentTypePack = {
  id: "service-agreement",
  aliases: ["service agreement", "services agreement", "sow"],
  skeleton,
  skillPaths: ["document-types/service-agreement"],
  prompts: {
    plan: (ctx) => `Plan service agreement from ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique service agreement (${ctx.checklist.length} items)`,
  },
  retrievalHints: { clauseTags: ["services"], playbookTopics: ["services"] },
};
