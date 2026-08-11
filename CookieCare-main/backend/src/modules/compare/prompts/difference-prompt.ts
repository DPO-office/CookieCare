/**
 * difference-prompt.ts
 *
 * System instruction and user-turn prompt builder for Difference Detection.
 * Mirrors the structure of alignment-prompt.ts exactly.
 *
 * The AI Skill (difference-analysis.md) is loaded by the step and prepended
 * to systemInstruction at call time — knowledge stays separate from directives.
 */

import type { AlignedPair, ExtractedClause } from "../models/compare-state.js";

// ─── System instruction ───────────────────────────────────────────────────────

export const systemInstruction = `
You are performing semantic difference classification between aligned clause pairs from two legal agreements.

Return ONLY a raw JSON array (no markdown fences). Each element:
{
  "pairId": string,
  "clauseAId": string | null,
  "clauseBId": string | null,
  "classification": "UNCHANGED" | "ADDED" | "REMOVED" | "MODIFIED_BROADER" | "MODIFIED_NARROWER" | "NEUTRAL_REPHRASE",
  "semanticSummary": string,
  "confidence": number (0.0–1.0)
}

Rules:
- Exactly one entry per pair — no more, no fewer.
- semanticSummary: empty string for UNCHANGED, ADDED, REMOVED; 1–3 factual sentences for MODIFIED_* and NEUTRAL_REPHRASE.
- No risk assessment or recommendations in semanticSummary.
`.trim();

// ─── Prompt builder ───────────────────────────────────────────────────────────

/** 
 * A pre-resolved pair ready for the prompt: includes the full clause text
 * for both sides (unlike alignment which only needs titles + previews).
 * Full text is needed here because the model must reason about semantic content.
 */
export interface ResolvedPair {
  pairId: string;
  clauseAId: string | null;
  clauseBId: string | null;
  titleA: string | null;
  titleB: string | null;
  textA: string | null;
  textB: string | null;
}

/**
 * Resolve a batch of AlignedPairs into ResolvedPairs by looking up clause
 * text from the structure maps.
 */
export function resolveClauseTexts(
  pairs: AlignedPair[],
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>
): ResolvedPair[] {
  return pairs.map((p) => {
    const clauseA = p.clauseAId ? clauseMapA.get(p.clauseAId) : undefined;
    const clauseB = p.clauseBId ? clauseMapB.get(p.clauseBId) : undefined;
    return {
      pairId: p.id,
      clauseAId: p.clauseAId,
      clauseBId: p.clauseBId,
      titleA: clauseA?.title ?? null,
      titleB: clauseB?.title ?? null,
      // Cap at 1500 chars per clause to stay within token limits.
      // The full text is sufficient for semantic reasoning at this length.
      textA: clauseA ? clauseA.text.slice(0, 1500) : null,
      textB: clauseB ? clauseB.text.slice(0, 1500) : null,
    };
  });
}

/**
 * Build the user-turn prompt for a batch of resolved clause pairs.
 */
export function buildDifferencePrompt(pairs: ResolvedPair[]): string {
  const formatted = pairs.map((p) => {
    const sideA = p.textA
      ? `A: ${JSON.stringify(p.titleA)} — ${JSON.stringify(p.textA)}`
      : `A: (none — added in B)`;
    const sideB = p.textB
      ? `B: ${JSON.stringify(p.titleB)} — ${JSON.stringify(p.textB)}`
      : `B: (none — removed in B)`;
    return `${JSON.stringify(p.pairId)}\n${sideA}\n${sideB}`;
  });

  return (
    `Classify the semantic difference for each of the following ${pairs.length} clause pair(s). ` +
    `Produce one JSON array entry per pair in order.\n\n` +
    formatted.join("\n\n")
  );
}
