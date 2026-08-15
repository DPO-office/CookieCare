import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Definitions", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-confidentiality", kind: "section", heading: "Confidentiality Obligations", dependsOn: ["sec-definitions"], clauseTypes: ["confidentiality"], status: "pending" },
  { id: "sec-exclusions", kind: "section", heading: "Exclusions", dependsOn: ["sec-definitions"], clauseTypes: ["exclusions"], status: "pending" },
  { id: "sec-term", kind: "section", heading: "Term and Termination", dependsOn: ["sec-definitions"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const ndaPack: DocumentTypePack = {
  id: "nda",
  aliases: ["nda", "non-disclosure", "confidentiality agreement"],
  skeleton,
  skillPaths: ["document-types/nda"],
  prompts: {
    plan: (ctx) => `Plan NDA from ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft NDA section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique NDA (${ctx.checklist.length} items)`,
  },
  retrievalHints: { clauseTags: ["nda", "confidentiality"], playbookTopics: ["confidentiality"] },
};
