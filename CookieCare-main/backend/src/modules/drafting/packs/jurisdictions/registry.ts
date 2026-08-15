import type { JurisdictionPack } from "./types.js";
import { irelandPack } from "./ireland/pack.js";
import { delawarePack } from "./delaware/pack.js";
import { englandPack } from "./england/pack.js";
import { californiaPack } from "./california/pack.js";

const packs: JurisdictionPack[] = [irelandPack, delawarePack, englandPack, californiaPack];

export const jurisdictionRegistry = {
  all(): JurisdictionPack[] {
    return packs;
  },
  get(id: string): JurisdictionPack | undefined {
    return packs.find((p) => p.id === id);
  },
  resolveId(hint: string): string | undefined {
    const lower = hint.toLowerCase().trim();
    for (const p of packs) {
      if (p.id === lower || p.aliases.some((a) => lower.includes(a))) {
        return p.id;
      }
    }
    return undefined;
  },
};
