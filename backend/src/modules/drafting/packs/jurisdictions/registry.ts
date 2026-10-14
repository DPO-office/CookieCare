import type { JurisdictionPack } from "./types.js";
import { irelandPack } from "./ireland/pack.js";
import { delawarePack } from "./delaware/pack.js";
import { englandPack } from "./england/pack.js";
import { californiaPack } from "./california/pack.js";
import { indiaPack } from "./india/pack.js";

const packs: JurisdictionPack[] = [
  irelandPack,
  delawarePack,
  englandPack,
  californiaPack,
  indiaPack,
];

export const jurisdictionRegistry = {
  all(): JurisdictionPack[] {
    return packs;
  },
  get(id: string): JurisdictionPack | undefined {
    return packs.find((p) => p.id === id);
  },
  resolveId(hint: string): string | undefined {
    if (!hint || typeof hint !== "string") return undefined;
    const lower = hint.toLowerCase().trim();
    for (const p of packs) {
      if (p.id === lower) return p.id;
      for (const a of p.aliases) {
        if (a === lower) return p.id;
        if (a.length <= 3) {
          const re = new RegExp(`\\b${a}\\b`, "i");
          if (re.test(lower)) return p.id;
        } else if (lower.includes(a)) {
          return p.id;
        }
      }
    }
    return undefined;
  },
};
