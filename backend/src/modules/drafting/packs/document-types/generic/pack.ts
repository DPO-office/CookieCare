import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { genericSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  { id: "sec-parties", kind: "section", heading: "Parties and Background", dependsOn: [], clauseTypes: ["parties"], status: "pending" },
  { id: "sec-definitions", kind: "section", heading: "Definitions", dependsOn: [], clauseTypes: ["definitions"], status: "pending" },
  { id: "sec-obligations", kind: "section", heading: "Scope and Obligations", dependsOn: ["sec-definitions"], clauseTypes: ["obligations"], status: "pending" },
  { id: "sec-term", kind: "section", heading: "Term and Termination", dependsOn: ["sec-definitions"], clauseTypes: ["term"], status: "pending" },
  { id: "sec-liability", kind: "section", heading: "Liability and Indemnification", dependsOn: ["sec-definitions"], clauseTypes: ["liability"], status: "pending" },
  { id: "sec-misc", kind: "section", heading: "Miscellaneous and Governing Law", dependsOn: ["sec-definitions"], clauseTypes: ["misc"], status: "pending" },
];

export const genericPack: DocumentTypePack = {
  id: "generic",
  aliases: ["generic", "agreement", "contract", "general contract"],
  skeleton,
  skillPaths: ["document-types/generic"],
  skillConfig: genericSkillConfig,
  prompts: {
    plan: (ctx) => `Plan agreement from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique draft against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: { clauseTags: ["general", "contract"], playbookTopics: ["liability", "termination"] },
};
