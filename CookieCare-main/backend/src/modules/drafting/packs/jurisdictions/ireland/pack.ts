import type { JurisdictionPack } from "../types.js";

export const irelandPack: JurisdictionPack = {
  id: "ireland",
  aliases: ["ireland", "irish", "republic of ireland", "ie"],
  boilerplate:
    "This Agreement shall be governed by and construed in accordance with the laws of Ireland. " +
    "The courts of Ireland shall have exclusive jurisdiction to settle any dispute arising out of or in connection with this Agreement.",
  skillPaths: ["jurisdictions/ireland"],
};
