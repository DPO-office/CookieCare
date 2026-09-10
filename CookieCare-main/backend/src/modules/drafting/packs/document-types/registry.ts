import type { DocumentTypePack } from "./types.js";
import { dpaPack } from "./dpa/pack.js";
import { ndaPack } from "./nda/pack.js";
import { msaPack } from "./msa/pack.js";
import { slaPack } from "./sla/pack.js";
import { serviceAgreementPack } from "./service-agreement/pack.js";

const packs: DocumentTypePack[] = [dpaPack, ndaPack, msaPack, slaPack, serviceAgreementPack];

export const documentTypeRegistry = {
  all(): DocumentTypePack[] {
    return packs;
  },
  get(id: string): DocumentTypePack {
    return packs.find((p) => p.id === id) ?? dpaPack;
  },
  resolveId(hint: string): string {
    const lower = hint.toLowerCase().trim();
    for (const p of packs) {
      if (p.id === lower || p.aliases.some((a) => lower.includes(a))) {
        return p.id;
      }
    }
    return dpaPack.id;
  },
};
