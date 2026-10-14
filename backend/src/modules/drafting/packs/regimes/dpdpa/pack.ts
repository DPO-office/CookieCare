import type { RegimePack } from "../types.js";
import { dpdpaSkillConfig } from "./skill.config.js";
import { dpdpaRequested } from "./signals.js";

export const dpdpaPack: RegimePack = {
  id: "DPDPA",
  triggerCondition: (facts) => dpdpaRequested(facts),
  additionalWorkUnits: [],
  skillPaths: ["regimes/dpdpa"],
  skillConfig: dpdpaSkillConfig,
};
