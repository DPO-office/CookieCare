import type { RegimePack } from "../types.js";
import { inferPrivacyRegime } from "../dpdpa/signals.js";

export const cpraSpPack: RegimePack = {
  id: "CPRA_SP",
  triggerCondition: (facts) => {
    const regime = String(inferPrivacyRegime(facts) || "").toLowerCase();
    const blob = JSON.stringify(facts).toLowerCase();
    const law = String(facts.governingLaw || "").toLowerCase();
    return (
      regime.includes("cpra") ||
      regime.includes("ccpa") ||
      blob.includes("cpra") ||
      blob.includes("ccpa") ||
      law.includes("california")
    );
  },
  additionalWorkUnits: [],
  skillPaths: ["regimes/cpra-service-provider"],
};
