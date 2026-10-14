import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { resellerSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Appointment", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-territory", kind: "section", heading: "Territory and Products", dependsOn: ["sec-parties"], clauseTypes: ["territory"], status: "pending" },
  { id: "sec-pricing", kind: "section", heading: "Pricing, Margins, and Ordering", dependsOn: ["sec-parties"], clauseTypes: ["pricing"], status: "pending" },
  { id: "sec-termination", kind: "section", heading: "Term and Termination", dependsOn: ["sec-parties"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous and Governing Law", dependsOn: ["sec-parties"], clauseTypes: ["misc"], status: "pending" },
];

export const resellerPack: DocumentTypePack = {
  id: "reseller",
  aliases: ["reseller", "reseller agreement", "distribution agreement", "distributor agreement"],
  skeleton,
  skillPaths: ["document-types/reseller"],
  skillConfig: resellerSkillConfig,
  prompts: {
    plan: (ctx) => `Plan reseller agreement from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft reseller section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique reseller agreement against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: { clauseTags: ["reseller", "distribution"], playbookTopics: ["distribution"] },
};
