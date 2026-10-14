import type { RegimePack } from "../types.js";
import { hipaaBaSkillConfig } from "./skill.config.js";

export const hipaaBaPack: RegimePack = {
  id: "HIPAA_BA",
  triggerCondition: (facts) => {
    if (facts.phiInvolved === true) return true;
    if (facts.phiInvolved === false) return false;
    const blob = JSON.stringify(facts).toLowerCase();

    // If explicit HIPAA or BAA is requested, trigger it
    if (
      blob.includes("hipaa") ||
      blob.includes("baa") ||
      blob.includes("business associate")
    ) {
      return true;
    }

    // Do not trigger on generic "health data" / "medical" if jurisdiction is India or regime is DPDPA
    const law = String(facts.governingLaw || "").toLowerCase();
    const regime = String(facts.privacyRegime || "").toLowerCase();
    const instructions = String(facts.instructionText || "").toLowerCase();
    const isIndianOrDpdpa =
      /\b(india|indian|delhi|mumbai|bengaluru|bangalore)\b/.test(law) ||
      regime.includes("dpdpa") ||
      regime.includes("dpdp") ||
      instructions.includes("dpdpa") ||
      instructions.includes("digital personal data protection") ||
      instructions.includes("data fiduciary");

    if (isIndianOrDpdpa) {
      return false;
    }

    // Avoid matching the key name "phiInvolved" itself.
    return (
      /\bphi\b/.test(blob) ||
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
