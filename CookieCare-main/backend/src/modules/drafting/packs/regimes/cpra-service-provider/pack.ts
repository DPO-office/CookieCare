import type { RegimePack } from "../types.js";

export const cpraSpPack: RegimePack = {
  id: "CPRA_SP",
  triggerCondition: (facts) => {
    const blob = JSON.stringify(facts).toLowerCase();
    const law = String(facts.governingLaw || "").toLowerCase();
    return blob.includes("cpra") || blob.includes("ccpa") || law.includes("california");
  },
  additionalWorkUnits: [],
  skillPaths: ["regimes/cpra-service-provider"],
};
