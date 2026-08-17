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
 * Parse article references after an explicit "article(s)" / "art(s)" marker.
 * Supports ranges, comma lists, whitespace lists, and "and"/"&"-joined lists.
 */
export function extractArticleNumbers(instruction: string): number[] {
  const normalized = normalizeForMatch(instruction);
  const numbers = new Set<number>();
  const reference =
    /\b(?:articles?|arts?)\.?\s*(\d{1,3}(?:(?:\s*(?:-|to|,|and|&)\s*|\s+)\d{1,3})*)/g;

  for (const match of normalized.matchAll(reference)) {
    const expression = match[1];
    for (const range of expression.matchAll(
      /(\d{1,3})\s*(?:-|to)\s*(\d{1,3})/g
    )) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end >= start && end - start <= 100) {
        for (let article = start; article <= end; article++) numbers.add(article);
      }
    }

    for (const token of expression.match(/\d{1,3}/g) ?? []) {
      numbers.add(Number(token));
    }
  }

  return [...numbers].filter(Number.isInteger).sort((a, b) => a - b);
}

function articleNumberFromRuleId(ruleId: string): number | undefined {
  const match = ruleId.match(/(?:^|\.)art(\d{1,3})(?:\.|$)/i);
  return match ? Number(match[1]) : undefined;
}

function articleNumberFromMatrixArticle(article: string): number | undefined {
  const match = article.match(/\d{1,3}/);
  return match ? Number(match[0]) : undefined;
}

function explicitArticleFocus(
  instruction: string,
  skills: AnalysisSkillConfig[]
): InstructionFocus | undefined {
  const requested = extractArticleNumbers(instruction);
  if (requested.length === 0) return undefined;
  const requestedSet = new Set(requested);

  const rules = skills
    .flatMap((skill) => skill.regimeRules)
    .filter((rule) => requestedSet.has(articleNumberFromRuleId(rule.ruleId) ?? -1));
  const rows = skills
    .flatMap((skill) => skill.rightsMatrixRows ?? [])
    .filter((row) =>
      requestedSet.has(articleNumberFromMatrixArticle(row.article) ?? -1)
    );
  const matrixArticles = new Set(
    rows
      .map((row) => articleNumberFromMatrixArticle(row.article))
      .filter((article): article is number => article !== undefined)
  );
  const directlyEvaluatedRules = rules.filter(
    (rule) => !matrixArticles.has(articleNumberFromRuleId(rule.ruleId) ?? -1)
  );

  if (rules.length === 0 && rows.length === 0) return undefined;

  return {
    ruleIds: dedupe(directlyEvaluatedRules.map((rule) => rule.ruleId)),
    matrixRowIds: dedupe(rows.map((row) => row.rowId)),
    riskCategoryIds: dedupe(
      directlyEvaluatedRules.map((rule) => rule.findingCategory)
    ),
    instructionText: instruction,
  };
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

  // Explicit article enumeration is authoritative. Do this before broad phrase
  // maps such as "article 15" → the complete Chapter III checklist.
  const articleNumbers = extractArticleNumbers(instruction);
  const articleFocus = explicitArticleFocus(instruction, skills);
  const hasCompleteDsrRange = Array.from(
    { length: 8 },
    (_, index) => 15 + index
  ).every((article) => articleNumbers.includes(article));
  const isExplicitlyRestricted =
    /\b(?:only|nothing more(?:\s+than)?(?:\s+that)?|no more than that|limited to|exclusively)\b/i.test(
      instruction
    );
  if (articleFocus && (!hasCompleteDsrRange || isExplicitlyRestricted)) {
    return articleFocus;
  }

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
