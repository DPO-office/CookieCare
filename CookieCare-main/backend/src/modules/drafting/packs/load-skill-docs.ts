/**
 * Loads pack skill.md files for detect-gaps.
 *
 * esbuild collapses sources into server.js / dist/server.js, so import.meta.url
 * points at the bundle — not src/modules/drafting/packs/. Probe candidate roots
 * the same way compare/knowledge-loader does.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApplicablePacks } from "./resolve-applicable-packs.js";

export interface SkillDoc {
  packId: string;
  packType: "documentType" | "regime" | "jurisdiction";
  content: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePacksRoot(): string {
  const candidates = [
    // Explicit override
    process.env.DRAFTING_PACKS_DIR,
    // prod: dist/packs next to dist/server.js (copied by npm run build)
    path.join(__dirname, "packs"),
    // dev bundle: backend/server.js → backend/src/modules/drafting/packs
    path.join(__dirname, "src", "modules", "drafting", "packs"),
    // cwd = backend/
    path.join(process.cwd(), "src", "modules", "drafting", "packs"),
    // cwd = CookieCare-main/
    path.join(process.cwd(), "backend", "src", "modules", "drafting", "packs"),
    // unbundled / tsx: this file lives in packs/
    __dirname,
    // unbundled: this file next to packs/ (if ever moved)
    path.join(__dirname, "packs"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  for (const candidate of candidates) {
    // Prefer a root that actually contains at least one known skill
    if (
      existsSync(path.join(candidate, "document-types", "nda", "skill.md")) ||
      existsSync(path.join(candidate, "document-types", "dpa", "skill.md"))
    ) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return (
    candidates.find((c) => c.includes("modules")) ??
    path.join(process.cwd(), "src", "modules", "drafting", "packs")
  );
}

const PACKS_ROOT = resolvePacksRoot();

async function readSkillMd(skillPath: string): Promise<string> {
  const fullPath = path.join(PACKS_ROOT, skillPath, "skill.md");
  try {
    return await readFile(fullPath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(
        `Drafting skill.md not found at ${fullPath} (packs root: ${PACKS_ROOT}). ` +
          `Ensure packs are present under src/modules/drafting/packs or copied to dist/packs.`
      );
    }
    throw err;
  }
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
