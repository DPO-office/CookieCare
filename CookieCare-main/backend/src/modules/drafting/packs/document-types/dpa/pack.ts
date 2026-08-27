import type { DocumentTypePack } from "../types.js";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { dpaSkillConfig } from "./skill.config.js";

const skeleton: WorkUnit[] = [
  {
    id: "sec-parties",
    kind: "section",
    heading: "Parties and Background",
    dependsOn: [],
    clauseTypes: ["parties", "recitals"],
    status: "pending",
  },
  {
    id: "sec-definitions",
    kind: "section",
    heading: "Definitions",
    dependsOn: [],
    clauseTypes: ["definitions"],
    status: "pending",
  },
  {
    id: "sec-processing",
    kind: "section",
    heading: "Processing of Personal Data",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["processing", "instructions"],
    status: "pending",
  },
  {
    id: "sec-security",
    kind: "section",
    heading: "Security Measures",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["security"],
    status: "pending",
  },
  {
    id: "sec-subprocessors",
    kind: "section",
    heading: "Sub-processors",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["subprocessors"],
    status: "pending",
  },
  {
    id: "sec-transfers",
    kind: "section",
    heading: "International Transfers",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["transfers", "scc"],
    status: "pending",
  },
  {
    id: "sec-assistance",
    kind: "section",
    heading: "Data Subject Rights and Assistance",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["data-subject-rights"],
    status: "pending",
  },
  {
    id: "sec-breach",
    kind: "section",
    heading: "Personal Data Breach",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["breach"],
    status: "pending",
  },
  {
    id: "sec-return",
    kind: "section",
    heading: "Return or Deletion of Data",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["deletion"],
    status: "pending",
  },
  {
    id: "sec-misc",
    kind: "section",
    heading: "Miscellaneous",
    dependsOn: ["sec-definitions"],
    clauseTypes: ["misc", "governing-law"],
    status: "pending",
  },
  {
    id: "exhibit-processing",
    kind: "exhibit",
    heading: "Details of Processing",
    dependsOn: ["sec-processing"],
    clauseTypes: ["exhibit-processing"],
    status: "pending",
  },
  {
    id: "exhibit-security",
    kind: "exhibit",
    heading: "Technical and Organisational Measures",
    dependsOn: ["sec-security"],
    clauseTypes: ["exhibit-security"],
    status: "pending",
  },
];

export const dpaPack: DocumentTypePack = {
  id: "dpa",
  aliases: ["dpa", "data processing agreement", "data processing addendum", "gdpr dpa"],
  skeleton,
  skillPaths: ["document-types/dpa"],
  skillConfig: dpaSkillConfig,
  prompts: {
    plan: (ctx) => `Plan a DPA from facts: ${JSON.stringify(ctx.facts)}`,
    actSection: (ctx) => `Draft DPA section ${ctx.unit.heading}`,
    critique: (ctx) => `Critique DPA against ${ctx.checklist.length} checklist items`,
  },
  retrievalHints: {
    clauseTags: ["dpa", "gdpr", "processing", "security", "subprocessor"],
    playbookTopics: ["data-processing", "security", "transfers"],
  },
};
