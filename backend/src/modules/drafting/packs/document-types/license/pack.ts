import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { licenseSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Recitals", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-grant", kind: "section", heading: "Grant of License", dependsOn: ["sec-parties"], clauseTypes: ["license"], status: "pending" },
  { id: "sec-restrictions", kind: "section", heading: "License Restrictions", dependsOn: ["sec-grant"], clauseTypes: ["restrictions"], status: "pending" },
  { id: "sec-fees", kind: "section", heading: "Fees and Royalties", dependsOn: ["sec-parties"], clauseTypes: ["fees"], status: "pending" },
  { id: "sec-ip", kind: "section", heading: "IP Ownership", dependsOn: ["sec-parties"], clauseTypes: ["ip"], status: "pending" },
  { id: "sec-termination", kind: "section", heading: "Term and Termination", dependsOn: ["sec-parties"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous and Governing Law", dependsOn: ["sec-parties"], clauseTypes: ["misc"], status: "pending" },
];

export const licensePack: DocumentTypePack = {
  id: "license",
  aliases: ["license", "license agreement", "software license", "ip license"],
  skeleton,
  skillPaths: ["document-types/license"],
  skillConfig: licenseSkillConfig,
  prompts: {
    plan: (ctx) => `Plan license agreement from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft license section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique license agreement against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: { clauseTags: ["license", "ip"], playbookTopics: ["licensing"] },
};
