import type { RegimePack } from "./types.js";
import { gdprArt28Pack } from "./gdpr-art28/pack.js";
import { hipaaBaPack } from "./hipaa-ba/pack.js";
import { cpraSpPack } from "./cpra-service-provider/pack.js";
import { ukGdprIdtaPack } from "./uk-gdpr-idta/pack.js";

const packs: RegimePack[] = [gdprArt28Pack, hipaaBaPack, cpraSpPack, ukGdprIdtaPack];

export const regimeRegistry = {
  all(): RegimePack[] {
    return packs;
  },
  get(id: string): RegimePack | undefined {
    return packs.find((p) => p.id === id);
  },
};
