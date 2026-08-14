import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisSkillConfig } from "./types.js";

const SKILLS_ROOT = path.dirname(fileURLToPath(import.meta.url));

export interface ParsedSkillMd {
  skillId: string;
  raw: string;
  /** Keys like "rule:gdpr.art28.3.e", "risk:dsr_no_response_timeframe", "clause:indemnity". */
  sections: Record<string, string>;
}

const skillMdCache = new Map<string, ParsedSkillMd>();

const SECTION_RE = /^##\s+(rule|risk|clause):([^\s#]+)\s*$/gim;

export function parseSkillMdContent(skillId: string, raw: string): ParsedSkillMd {
  const sections: Record<string, string> = {};
  const matches = [...raw.matchAll(SECTION_RE)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const kind = m[1].toLowerCase();
    const id = m[2].trim();
    const key = `${kind}:${id}`;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;
    sections[key] = raw.slice(start, end).trim();
  }
  return { skillId, raw, sections };
}

export async function loadSkillMarkdown(skillId: string): Promise<string> {
  const fullPath = path.join(SKILLS_ROOT, skillId, "SKILL.md");
  try {
    return await readFile(fullPath, "utf8");
  } catch {
    return "";
  }
}

export async function parseSkillMd(skillId: string): Promise<ParsedSkillMd> {
  const cached = skillMdCache.get(skillId);
  if (cached) return cached;
  const raw = await loadSkillMarkdown(skillId);
  const parsed = parseSkillMdContent(skillId, raw);
  skillMdCache.set(skillId, parsed);
  return parsed;
}

/**
 * Fetch a single SKILL.md section — never load whole prose into ACT prompts by default.
 */
export async function loadSkillMdSection(
  skillId: string,
  sectionKey: string
): Promise<string | null> {
  const doc = skillMdCache.get(skillId) ?? (await parseSkillMd(skillId));
  return doc.sections[sectionKey] ?? null;
}

export async function loadSkillMarkdownForSkills(
  skills: AnalysisSkillConfig[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const skill of skills) {
    const parsed = await parseSkillMd(skill.skillId);
    out[skill.skillId] = parsed.raw;
  }
  return out;
}

/** Test helper. */
export function resetSkillMdCacheForTests(): void {
  skillMdCache.clear();
}
