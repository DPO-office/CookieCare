import type { RegimePack } from "../types.js";
import { ukGdprIdtaSkillConfig } from "./skill.config.js";
import { inferPrivacyRegime } from "../dpdpa/signals.js";

export const ukGdprIdtaPack: RegimePack = {
  id: "UK_GDPR_IDTA",
  triggerCondition: (facts) => {
    const regime = String(inferPrivacyRegime(facts) || "").toLowerCase();
    const law = String(facts.governingLaw || "").toLowerCase();
    const mech = String(facts.transferMechanism || "").toLowerCase();
    return (
      regime.includes("uk") ||
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
