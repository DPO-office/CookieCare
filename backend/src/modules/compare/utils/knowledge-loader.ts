/**
 * knowledge-loader.ts
 *
 * Loads AI Skill markdown files from the compare module's knowledge/ directory.
 * Results are cached in memory after the first read — the files are never
 * re-read during a running process.
 *
 * ── The esbuild bundle problem ───────────────────────────────────────────────
 * esbuild collapses all source files into a single output (server.js in dev,
 * dist/server.js in prod).  Inside the bundle, `import.meta.url` resolves to
 * the *bundle file's* path, not the original source file's path.  That makes
 * path.join(__dirname, "../knowledge") resolve relative to the bundle — not
 * relative to src/modules/compare/utils/ where the source lives.
 *
 * ── Where the knowledge directory lives at runtime ───────────────────────────
 * We keep the .md files as static assets outside the bundle, at a path that
 * is stable regardless of CWD:
 *
 *   dev   → bundle lands at  backend/server.js
 *           __dirname        = <repo>/backend/
 *           knowledge dir    = <repo>/backend/src/modules/compare/knowledge/
 *           resolved via     path.join(__dirname, "src/modules/compare/knowledge")
 *
 *   prod  → bundle lands at  backend/dist/server.js
 *           __dirname        = <repo>/backend/dist/
 *           knowledge dir    = <repo>/backend/dist/knowledge/   (copied by `npm run build`)
 *           resolved via     path.join(__dirname, "knowledge")
 *
 * resolveKnowledgeDir() probes both candidate paths and returns the first one
 * that exists on disk.  This makes the loader environment-agnostic without
 * any hardcoded project-root paths or CWD assumptions.
 *
 * ── Keeping the .md files up to date in dist/ ────────────────────────────────
 * The `build` script in package.json includes a copy step that mirrors
 * src/modules/compare/knowledge/ → dist/knowledge/ after the esbuild compile.
 * See package.json for details.
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname of the *bundle file* at runtime (not the source file — see note above)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Known skill names ────────────────────────────────────────────────────────

export type SkillName =
  | "clause-alignment"
  | "difference-analysis"
  | "risk-analysis"
  | "executive-summary";

// ─── Path resolution ──────────────────────────────────────────────────────────

/**
 * Returns the absolute path to the knowledge/ directory, probing candidate
 * locations to handle the esbuild bundle (dev/prod) and direct tsx execution
 * (benchmark scripts, tests).
 *
 * Throws if no location exists — fail-fast so missing assets are caught
 * at first use rather than silently sending empty prompts to the LLM.
 */
function resolveKnowledgeDir(): string {
  const candidates: string[] = [];

  // 0. Explicit override via env var — highest priority, used by benchmark scripts
  if (process.env.COMPARE_KNOWLEDGE_DIR) {
    candidates.push(process.env.COMPARE_KNOWLEDGE_DIR);
  }

  // 1. prod: dist/knowledge/ sits next to dist/server.js
  candidates.push(path.join(__dirname, "knowledge"));

  // 2. dev bundle: src/modules/compare/knowledge/ relative to backend/ root
  //    (esbuild output lands at backend/server.js, __dirname = backend/)
  candidates.push(path.join(__dirname, "src", "modules", "compare", "knowledge"));

  // 3. direct tsx execution: __dirname = backend/src/modules/compare/utils/
  //    knowledge/ is one level up
  candidates.push(path.join(__dirname, "..", "knowledge"));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `[knowledge-loader] Could not locate the compare knowledge/ directory.\n` +
    `Searched:\n` +
    candidates.map((c) => `  • ${c}`).join("\n") + "\n" +
    `In dev, run "npm run dev" from the backend/ directory.\n` +
    `In prod, ensure "npm run build" has been run (it copies knowledge/ into dist/).\n` +
    `For scripts/tests, set env var COMPARE_KNOWLEDGE_DIR to the absolute path.`
  );
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const cache = new Map<SkillName, string>();

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Read a single skill file from the knowledge directory.
 * Called lazily by getSkill() on first access.
 */
function loadSkill(name: SkillName): string {
  const knowledgeDir = resolveKnowledgeDir();
  const filePath     = path.join(knowledgeDir, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[knowledge-loader] AI Skill file not found: ${filePath}\n` +
      `Ensure ${name}.md exists in the compare knowledge/ directory.`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();

  if (content.length === 0) {
    throw new Error(
      `[knowledge-loader] AI Skill file is empty: ${filePath}`
    );
  }

  return content;
}

/**
 * Retrieve an AI Skill by name.
 *
 * Reads from disk on first call; returns the cached string on every subsequent
 * call within the same process — the knowledge directory is never polled again.
 *
 * Public API is identical to the original implementation; all callers
 * (clause-align.ts, diff-detect.ts, risk-analysis.ts, executive-summary.ts)
 * are unaffected.
 */
export function getSkill(name: SkillName): string {
  if (!cache.has(name)) {
    const content = loadSkill(name);
    cache.set(name, content);
    console.log(
      `[knowledge-loader] Loaded AI Skill "${name}" (${content.length} chars)`
    );
  }

  return cache.get(name)!;
}
