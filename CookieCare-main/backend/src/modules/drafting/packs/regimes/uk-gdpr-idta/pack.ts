import type { RegimePack } from "../types.js";

export const ukGdprIdtaPack: RegimePack = {
  id: "UK_GDPR_IDTA",
  triggerCondition: (facts) => {
    const law = String(facts.governingLaw || "").toLowerCase();
    const mech = String(facts.transferMechanism || "").toLowerCase();
    return law.includes("england") || law.includes("uk") || mech.includes("idta");
  },
  additionalWorkUnits: [],
  skillPaths: ["regimes/uk-gdpr-idta"],
};
