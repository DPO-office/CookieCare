import type { RegimePack } from "../types.js";
import { gdprArt28SkillConfig } from "./skill.config.js";

export const gdprArt28Pack: RegimePack = {
  id: "GDPR_ART28",
  triggerCondition: (facts) => {
    const type = String(facts.documentType || "").toLowerCase();
    const law = String(facts.governingLaw || "").toLowerCase();
    return (
      type.includes("dpa") ||
      law.includes("ireland") ||
      law.includes("gdpr") ||
      law.includes("eea") ||
      law.includes("eu") ||
      !facts.governingLaw
    );
  },
  additionalWorkUnits: [],
  skillPaths: ["regimes/gdpr-art28"],
  skillConfig: gdprArt28SkillConfig,
};
