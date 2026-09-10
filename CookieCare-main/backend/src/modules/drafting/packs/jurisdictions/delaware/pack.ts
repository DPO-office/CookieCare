import type { JurisdictionPack } from "../types.js";

export const delawarePack: JurisdictionPack = {
  id: "delaware",
  aliases: ["delaware", "de"],
  boilerplate:
    "This Agreement shall be governed by the laws of the State of Delaware, without regard to conflict of law principles. " +
    "The state and federal courts located in Delaware shall have exclusive jurisdiction.",
  skillPaths: ["jurisdictions/delaware"],
};
