import {
  findSkillByPromptId,
  getSkillById,
  getSkillRegistry,
} from "./registry.js";
import type { AnalysisSkillConfig, SkillSelectionResult } from "./types.js";

export const SKILL_SCORE_THRESHOLD = 2;
export const SKILL_AMBIGUITY_MARGIN = 1;

export interface SelectSkillsInput {
  instruction: string;
  promptLibraryId?: string;
  docType?: string;
}

export function selectSkills(input: SelectSkillsInput): SkillSelectionResult {
  // Path A — library click: deterministic, no LLM
  if (input.promptLibraryId) {
    const skill = findSkillByPromptId(input.promptLibraryId);
    if (skill) {
      return { skills: [skill], selectionPath: "library" };
    }
    const fallback = getSkillById("general-review")!;
    return { skills: [fallback], selectionPath: "fallback" };
  }

  // Path B — free text
  const instruction = input.instruction.toLowerCase();
  const docType = (input.docType ?? "unknown").toLowerCase();
  const registry = Object.values(getSkillRegistry());

  const scored = registry
    .map((skill) => ({
      skill,
      score: scoreSkill(skill, instruction, docType),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      skills: [getSkillById("general-review")!],
      selectionPath: "fallback",
    };
  }

  const top = scored[0];
  const second = scored[1];

  if (
    second &&
    top.score - second.score <= SKILL_AMBIGUITY_MARGIN &&
    top.score >= SKILL_SCORE_THRESHOLD
  ) {
    return {
      skills: [top.skill],
      selectionPath: "free_text",
      ambiguous: true,
      candidateSkillIds: [top.skill.skillId, second.skill.skillId],
    };
  }

  if (top.score >= SKILL_SCORE_THRESHOLD) {
    return { skills: [top.skill], selectionPath: "free_text" };
  }

  return {
    skills: [getSkillById("general-review")!],
    selectionPath: "fallback",
  };
}

function scoreSkill(
  skill: AnalysisSkillConfig,
  instruction: string,
  docType: string
): number {
  let score = 0;

  if (skill.appliesToDocTypes.includes(docType)) {
    score += 3;
  }

  for (const phrase of skill.triggerPhrases) {
    if (instruction.includes(phrase.toLowerCase())) {
      score += 2;
    }
  }

  // Partial token overlap for longer phrases
  for (const phrase of skill.triggerPhrases) {
    const words = phrase.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => instruction.includes(w)).length;
    if (hits >= 2) score += 1;
  }

  return score;
}

export function buildSkillAmbiguityClarification(
  candidateSkillIds: string[]
): { field: string; question: string; severity: "critical"; options: string[] } {
  const registry = getSkillRegistry();
  const labels = candidateSkillIds.map((id) => registry[id]?.label ?? id);
  return {
    field: "skillId",
    question: `Your request could match multiple analysis types: ${labels.join(" or ")}. Which should we run?`,
    severity: "critical",
    options: candidateSkillIds,
  };
}
