import type { DocumentTypePack } from "./types.js";
import { dpaPack } from "./dpa/pack.js";
import { ndaPack } from "./nda/pack.js";
import { msaPack } from "./msa/pack.js";
import { slaPack } from "./sla/pack.js";
import { serviceAgreementPack } from "./service-agreement/pack.js";
import { genericPack } from "./generic/pack.js";
import { saasPack } from "./saas/pack.js";
import { employmentPack } from "./employment/pack.js";
import { licensePack } from "./license/pack.js";
import { resellerPack } from "./reseller/pack.js";
import { partnershipPack } from "./partnership/pack.js";

const packs: DocumentTypePack[] = [
  dpaPack,
  ndaPack,
  msaPack,
  slaPack,
  serviceAgreementPack,
  saasPack,
  employmentPack,
  licensePack,
  resellerPack,
  partnershipPack,
  genericPack,
];

export const documentTypeRegistry = {
  all(): DocumentTypePack[] {
    return packs;
  },
  get(id: string): DocumentTypePack {
    const found = packs.find((p) => p.id === id);
    return found ?? genericPack;
  },
  resolveId(hint: string): string {
    const lower = hint.toLowerCase().trim();
    if (!lower) return genericPack.id;

    for (const p of packs) {
      if (p.id === genericPack.id) continue;
      if (p.id === lower || p.aliases.some((a) => lower.includes(a) || a.includes(lower))) {
        return p.id;
      }
    }
    return genericPack.id;
  },
};
