import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { partnershipSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Purpose", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-roles", kind: "section", heading: "Roles and Responsibilities", dependsOn: ["sec-parties"], clauseTypes: ["roles"], status: "pending" },
  { id: "sec-financials", kind: "section", heading: "Financial Terms and Revenue Sharing", dependsOn: ["sec-parties"], clauseTypes: ["financials"], status: "pending" },
  { id: "sec-ip", kind: "section", heading: "IP and Governance", dependsOn: ["sec-parties"], clauseTypes: ["ip"], status: "pending" },
  { id: "sec-termination", kind: "section", heading: "Term and Dissolution", dependsOn: ["sec-parties"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous and Governing Law", dependsOn: ["sec-parties"], clauseTypes: ["misc"], status: "pending" },
];

export const partnershipPack: DocumentTypePack = {
  id: "partnership",
  aliases: ["partnership", "partnership agreement", "teaming agreement", "strategic partnership"],
  skeleton,
  skillPaths: ["document-types/partnership"],
  skillConfig: partnershipSkillConfig,
  prompts: {
    plan: (ctx) => `Plan partnership agreement from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft partnership section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique partnership agreement against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: { clauseTags: ["partnership", "teaming"], playbookTopics: ["partnership"] },
};
