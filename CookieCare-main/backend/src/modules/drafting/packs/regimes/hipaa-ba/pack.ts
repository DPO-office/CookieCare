import type { RegimePack } from "../types.js";
import { hipaaBaSkillConfig } from "./skill.config.js";

export const hipaaBaPack: RegimePack = {
  id: "HIPAA_BA",
  triggerCondition: (facts) => {
    if (facts.phiInvolved === true) return true;
    if (facts.phiInvolved === false) return false;
    const blob = JSON.stringify(facts).toLowerCase();
    // Avoid matching the key name "phiInvolved" itself.
    return (
      /\bphi\b/.test(blob) ||
      blob.includes("hipaa") ||
      blob.includes("patient") ||
      /\bhealth(?:care|care\s)?\b/.test(blob) ||
      blob.includes("medical")
    );
  },
  additionalWorkUnits: [
    {
      id: "sec-hipaa-ba",
      kind: "section",
      heading: "HIPAA Business Associate Obligations",
      dependsOn: ["sec-definitions"],
      clauseTypes: ["hipaa", "baa"],
      status: "pending",
    },
  ],
  skillPaths: ["regimes/hipaa-ba"],
  skillConfig: hipaaBaSkillConfig,
};
