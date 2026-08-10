import type { RegimePack } from "../types.js";

export const hipaaBaPack: RegimePack = {
  id: "HIPAA_BA",
  triggerCondition: (facts) => {
    if (facts.phiInvolved === true) return true;
    const blob = JSON.stringify(facts).toLowerCase();
    return (
      blob.includes("phi") ||
      blob.includes("hipaa") ||
      blob.includes("patient") ||
      blob.includes("health") ||
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
};
