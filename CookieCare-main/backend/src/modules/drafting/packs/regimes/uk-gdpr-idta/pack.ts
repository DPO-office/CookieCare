import type { RegimePack } from "../types.js";
import { ukGdprIdtaSkillConfig } from "./skill.config.js";

export const ukGdprIdtaPack: RegimePack = {
  id: "UK_GDPR_IDTA",
  triggerCondition: (facts) => {
    const law = String(facts.governingLaw || "").toLowerCase();
    const mech = String(facts.transferMechanism || "").toLowerCase();
    return (
      law.includes("england") ||
      law.includes("uk") ||
      mech.includes("idta") ||
      facts.ukIdta === true
    );
  },
  additionalWorkUnits: [],
  skillPaths: ["regimes/uk-gdpr-idta"],
  skillConfig: ukGdprIdtaSkillConfig,
};
