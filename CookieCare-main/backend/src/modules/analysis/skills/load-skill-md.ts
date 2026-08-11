import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisSkillConfig } from "./types.js";

const SKILLS_ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function loadSkillMarkdown(skillId: string): Promise<string> {
  const fullPath = path.join(SKILLS_ROOT, skillId, "SKILL.md");
  try {
    return await readFile(fullPath, "utf8");
  } catch {
    return "";
  }
}

export async function loadSkillMarkdownForSkills(
  skills: AnalysisSkillConfig[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const skill of skills) {
    out[skill.skillId] = await loadSkillMarkdown(skill.skillId);
  }
  return out;
}
