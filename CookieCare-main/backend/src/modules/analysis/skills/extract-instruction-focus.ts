import type { InstructionFocus } from "../models/analysis-plan.js";
import type { AnalysisSkillConfig } from "./types.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = normalize(phrase);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  // "15-22" also matches "15 to 22"
  if (/^\d+\s*-\s*\d+$/.test(needle)) {
    const [a, b] = needle.split("-").map((s) => s.trim());
    if (haystack.includes(`${a} to ${b}`) || haystack.includes(`${a}-${b}`)) return true;
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
  const haystack = normalize(instruction);
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

  if (!matched) return undefined;

  return {
    ruleIds: dedupe(ruleIds),
    matrixRowIds: dedupe(matrixRowIds),
    riskCategoryIds: dedupe(riskCategoryIds),
    instructionText: instruction,
  };
}
