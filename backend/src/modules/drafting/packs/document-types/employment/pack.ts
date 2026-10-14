import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { employmentSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Employment Offer", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-position", kind: "section", heading: "Position, Role, and Duties", dependsOn: ["sec-parties"], clauseTypes: ["position"], status: "pending" },
  { id: "sec-compensation", kind: "section", heading: "Compensation and Benefits", dependsOn: ["sec-parties"], clauseTypes: ["compensation"], status: "pending" },
  { id: "sec-confidentiality", kind: "section", heading: "Confidentiality and IP Assignment", dependsOn: ["sec-parties"], clauseTypes: ["confidentiality", "ip"], status: "pending" },
  { id: "sec-restrictive-covenants", kind: "section", heading: "Restrictive Covenants", dependsOn: ["sec-parties"], clauseTypes: ["non-compete"], status: "pending" },
  { id: "sec-termination", kind: "section", heading: "Termination of Employment", dependsOn: ["sec-parties"], clauseTypes: ["termination"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous and Governing Law", dependsOn: ["sec-parties"], clauseTypes: ["misc"], status: "pending" },
];

export const employmentPack: DocumentTypePack = {
  id: "employment",
  aliases: [
    "employment",
    "employment agreement",
    "employment contract",
    "offer letter",
    "job agreement",
    "job contract",
  ],
  skeleton,
  skillPaths: ["document-types/employment"],
  skillConfig: employmentSkillConfig,
  prompts: {
    plan: (ctx) => `Plan employment agreement from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft employment section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique employment agreement against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: {
    clauseTags: ["employment", "compensation", "non-compete"],
    playbookTopics: ["employment", "termination"],
  },
};
