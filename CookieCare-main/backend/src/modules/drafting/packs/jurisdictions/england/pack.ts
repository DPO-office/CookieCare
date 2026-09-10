import type { JurisdictionPack } from "../types.js";

export const englandPack: JurisdictionPack = {
  id: "england",
  aliases: ["england", "england and wales", "uk", "united kingdom"],
  boilerplate:
    "This Agreement shall be governed by and construed in accordance with the laws of England and Wales. " +
    "The courts of England and Wales shall have exclusive jurisdiction.",
  skillPaths: ["jurisdictions/england"],
};
