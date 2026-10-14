import type { RegimePack } from "../types.js";
import { gdprArt28SkillConfig } from "./skill.config.js";
import { gdprArt28Requested } from "../dpdpa/signals.js";

export const gdprArt28Pack: RegimePack = {
  id: "GDPR_ART28",
  triggerCondition: (facts) => gdprArt28Requested(facts),
  additionalWorkUnits: [],
  skillPaths: ["regimes/gdpr-art28"],
  skillConfig: gdprArt28SkillConfig,
};
