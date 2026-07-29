/**
 * Prompt Library
 *
 * Loads skill-specific system prompts from backend/prompts/skills/ once at
 * server startup, caches them in memory, and exposes a single accessor.
 *
 * Architecture contract
 * ─────────────────────
 * • Prompt files live at:  backend/prompts/skills/<reviewProfile>.md
 * • Each file name corresponds 1-to-1 with a reviewProfile identifier sent by
 *   the frontend (e.g. "dpa-privacy-risk-review").
 * • The standard DPA Review uses its own hardcoded SYSTEM_PROMPT inside
 *   dpaReviewAgent.ts and NEVER touches this library.
 * • This library is ONLY consulted when reviewProfile is explicitly set.
 *
 * Fail-fast behaviour
 * ────────────────────
 * initPromptLibrary() throws if the prompts directory cannot be read.
 * Individual prompt files that cannot be read also throw so broken skill
 * configurations are caught at startup rather than silently failing at runtime.
 *
 * Usage
 * ─────
 * // In server.ts — call once before app.listen()
 * await initPromptLibrary();
 *
 * // In DPAReviewAgent (or any future agent)
 * import { getSkillPrompt } from "../services/promptLibrary.js";
 * const prompt = getSkillPrompt("dpa-privacy-risk-review"); // undefined if not loaded / empty
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

// ── Path resolution (ESM-safe) ─────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Resolve the prompts/skills directory relative to this file's location.
 *
 * Source layout  (TypeScript):  backend/src/services/promptLibrary.ts
 *                                → ../../.. => backend/
 * Compiled layout (esbuild):    backend/dist/server.js (bundled) or
 *                                backend/server.js (dev bundle)
 *                                → process.cwd() is typically backend/
 *
 * We try several candidates so the library works in both dev and production.
 */
function resolvePromptsDir(): string {
  const candidates = [
    // TypeScript source layout: src/services → ../../.. → backend → prompts/skills
    path.resolve(__dirname, "../../../prompts/skills"),
    // esbuild bundle in backend/dist/: dist → .. → backend → prompts/skills
    path.resolve(__dirname, "../../prompts/skills"),
    // esbuild dev bundle in backend/: server.js sits directly in backend/
    // so __dirname === backend/, and prompts/skills is one level down
    path.resolve(__dirname, "prompts/skills"),
    // Working-directory fallback (works when cwd is the backend folder)
    path.resolve(process.cwd(), "prompts/skills"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logger.info(`[PromptLibrary] Resolved prompts directory: ${candidate}`);
      return candidate;
    }
  }

  // Return the most canonical path even if it doesn't exist yet —
  // initPromptLibrary() will surface a clear error.
  logger.warn(
    `[PromptLibrary] Could not find prompts directory. Tried:\n` +
    candidates.map((c) => `  - ${c}`).join("\n")
  );
  return candidates[0];
}

// ── In-memory cache ────────────────────────────────────────────────────────────

/**
 * Maps reviewProfile → system prompt string.
 * Populated once by initPromptLibrary(); read-only thereafter.
 */
const promptCache = new Map<string, string>();

let _initialized = false;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Load all .md files from prompts/skills/ into the in-memory cache.
 * Call this once during server startup, before any requests are handled.
 *
 * @throws If the prompts directory cannot be read.
 */
export async function initPromptLibrary(): Promise<void> {
  if (_initialized) return;

  const promptsDir = resolvePromptsDir();

  if (!fs.existsSync(promptsDir)) {
    // Not a fatal error at this stage — the directory will exist once real
    // prompts are added.  Log a warning so it's visible, but don't crash.
    logger.warn(
      `[PromptLibrary] Prompts directory not found: ${promptsDir}. ` +
      "AI Skills will fall back to the standard DPA Review prompt until skill prompts are added."
    );
    _initialized = true;
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(promptsDir, { withFileTypes: true });
  } catch (err: any) {
    throw new Error(
      `[PromptLibrary] Failed to read prompts directory (${promptsDir}): ${err.message}`
    );
  }

  const mdFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".md")
  );

  for (const entry of mdFiles) {
    const reviewProfile = entry.name.slice(0, -3); // strip .md
    const filePath = path.join(promptsDir, entry.name);

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8").trim();
    } catch (err: any) {
      throw new Error(
        `[PromptLibrary] Failed to read skill prompt file (${filePath}): ${err.message}`
      );
    }

    if (content.length === 0) {
      logger.warn(
        `[PromptLibrary] Skill prompt file is empty: ${entry.name}. ` +
        `The "${reviewProfile}" skill will fall back to the standard DPA Review prompt.`
      );
      // Store empty string so getSkillPrompt() can detect "not yet defined"
      // and the agent can fall back gracefully.
    }

    promptCache.set(reviewProfile, content);
    logger.info(
      `[PromptLibrary] Loaded skill prompt: "${reviewProfile}" (${content.length} chars)`
    );
  }

  _initialized = true;
  logger.info(
    `[PromptLibrary] Initialized — ${promptCache.size} skill prompt(s) cached: ` +
    `[${[...promptCache.keys()].join(", ")}]`
  );
}

/**
 * Retrieve the system prompt for a given reviewProfile.
 *
 * @param reviewProfile  The skill identifier, e.g. "dpa-privacy-risk-review".
 * @returns The prompt string if it was loaded and is non-empty; `undefined` otherwise.
 *
 * Returning `undefined` is the signal to the calling agent that it should use
 * its own built-in SYSTEM_PROMPT (standard behaviour).  This means:
 *   - reviewProfile not in cache     → undefined (file not found or not loaded yet)
 *   - reviewProfile in cache, empty  → undefined (placeholder / not yet defined)
 *   - reviewProfile in cache, filled → the skill prompt string
 */
export function getSkillPrompt(reviewProfile: string): string | undefined {
  if (!_initialized) {
    logger.warn(
      `[PromptLibrary] getSkillPrompt("${reviewProfile}") called before initPromptLibrary(). ` +
      "Returning undefined — standard prompt will be used."
    );
    return undefined;
  }

  const prompt = promptCache.get(reviewProfile);
  // Treat empty string as "not defined yet" — fall back to standard prompt
  return prompt && prompt.length > 0 ? prompt : undefined;
}
