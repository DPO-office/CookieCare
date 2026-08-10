import type { JurisdictionPack } from "../types.js";

export const californiaPack: JurisdictionPack = {
  id: "california",
  aliases: ["california", "ca"],
  boilerplate:
    "This Agreement shall be governed by the laws of the State of California. " +
    "The state and federal courts located in California shall have exclusive jurisdiction.",
  skillPaths: ["jurisdictions/california"],
};
