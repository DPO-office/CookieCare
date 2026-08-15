import type { InstructionFocus } from "../models/analysis-plan.js";
import type { AnalysisSkillConfig } from "./types.js";
import { pacWarn } from "../utils/pac-log.js";

/** Shared normalization for all deterministic instruction-focus matching. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = normalizeForMatch(phrase);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;

  // A range trigger such as "15-22" also matches "15 to 22" and an
  // enumerated sequence such as "15, 16, 17, 18, 19, 20, 21, 22".
  if (/^\d+\s*-\s*\d+$/.test(needle)) {
    const [a, b] = needle.split("-").map((s) => s.trim());
    if (haystack.includes(`${a} to ${b}`) || haystack.includes(`${a}-${b}`)) return true;
    const numbers = new Set(haystack.match(/\b\d+\b/g) ?? []);
    const start = Number(a);
    const end = Number(b);
    if (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      Array.from({ length: end - start + 1 }, (_, index) => String(start + index)).every(
        (value) => numbers.has(value)
      )
    ) {
      return true;
    }
  }
  return false;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Deterministic keyword match against skill.instructionFocusMap.
 * Returns undefined when nothing matches (full-skill graph).
 */
export function extractInstructionFocus(
  instruction: string,
  skills: AnalysisSkillConfig[]
): InstructionFocus | undefined {
  const haystack = normalizeForMatch(instruction);
  if (!haystack) return undefined;

  const ruleIds: string[] = [];
  const matrixRowIds: string[] = [];
  const riskCategoryIds: string[] = [];
  let matched = false;

  for (const skill of skills) {
    for (const entry of skill.instructionFocusMap ?? []) {
      if (!entry.triggerPhrases.some((p) => containsPhrase(haystack, p))) continue;
      matched = true;
      ruleIds.push(...(entry.focus.ruleIds ?? []));
      matrixRowIds.push(...(entry.focus.matrixRowIds ?? []));
      riskCategoryIds.push(...(entry.focus.riskCategoryIds ?? []));
    }
  }

  if (!matched) {
    const mappedSkillIds = skills
      .filter((skill) => (skill.instructionFocusMap?.length ?? 0) > 0)
      .map((skill) => skill.skillId);
    if (mappedSkillIds.length > 0) {
      pacWarn("focus map present but no match — running full skill", {
        skills: mappedSkillIds,
        instruction,
      });
    }
    return undefined;
  }

  return {
    ruleIds: dedupe(ruleIds),
    matrixRowIds: dedupe(matrixRowIds),
    riskCategoryIds: dedupe(riskCategoryIds),
    instructionText: instruction,
  };
}
