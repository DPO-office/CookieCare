import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApplicablePacks } from "./resolve-applicable-packs.js";

export interface SkillDoc {
  packId: string;
  packType: "documentType" | "regime" | "jurisdiction";
  content: string;
}

const PACKS_ROOT = path.dirname(fileURLToPath(import.meta.url));

async function readSkillMd(skillPath: string): Promise<string> {
  const fullPath = path.join(PACKS_ROOT, skillPath, "skill.md");
  return readFile(fullPath, "utf8");
}

/** Load skill.md contents for every applicable pack via skillPaths. */
export async function loadSkillDocs(applicable: ApplicablePacks): Promise<SkillDoc[]> {
  const docs: SkillDoc[] = [];

  for (const skillPath of applicable.typePack.skillPaths) {
    docs.push({
      packId: applicable.typePack.id,
      packType: "documentType",
      content: await readSkillMd(skillPath),
    });
  }

  for (const regime of applicable.regimes) {
    for (const skillPath of regime.skillPaths) {
      docs.push({
        packId: regime.id,
        packType: "regime",
        content: await readSkillMd(skillPath),
      });
    }
  }

  if (applicable.jurisdiction) {
    for (const skillPath of applicable.jurisdiction.skillPaths) {
      docs.push({
        packId: applicable.jurisdiction.id,
        packType: "jurisdiction",
        content: await readSkillMd(skillPath),
      });
    }
  }

  return docs;
}
