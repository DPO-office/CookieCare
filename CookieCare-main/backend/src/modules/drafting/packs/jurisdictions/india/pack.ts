import type { JurisdictionPack } from "../types.js";

export const indiaPack: JurisdictionPack = {
  id: "india",
  aliases: ["india", "indian", "republic of india", "bharat"],
  boilerplate:
    "This Agreement shall be governed by and construed in accordance with the laws of India. " +
    "The courts at [insert seat] shall have exclusive jurisdiction, subject to any arbitration clause in this Agreement.",
  skillPaths: ["jurisdictions/india"],
};
