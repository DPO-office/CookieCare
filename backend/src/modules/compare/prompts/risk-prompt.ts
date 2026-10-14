/**
 * risk-prompt.ts
 *
 * System instruction and user-turn prompt builder for the Risk Analysis step.
 * Mirrors the structure established in alignment-prompt.ts and difference-prompt.ts:
 *   - systemInstruction: a constant per-step directive
 *   - buildRiskPrompt(): builder that receives runtime data and returns the
 *     user-turn prompt string
 *
 * The AI Skill content (risk-analysis.md) is loaded by the step and prepended
 * to systemInstruction at call time — knowledge stays separate from directives.
 */

import type { ClauseDifference, ExtractedClause } from "../models/compare-state.js";

// ─── System instruction ───────────────────────────────────────────────────────

export const systemInstruction = `
You are performing legal and commercial risk analysis on semantic differences between two versions of a legal agreement.

Return ONLY a raw JSON array (no markdown fences). Each element:
{
  "pairId": string,
  "level": "LOW" | "MEDIUM" | "HIGH",
  "category": "liability" | "indemnity" | "ip" | "termination" | "data_protection" | "payment" | "confidentiality" | "governing_law" | "audit_rights" | "other",
  "rationale": string,
  "confidence": number (0.0–1.0)
}

Rules:
- At most one finding per difference; skip if no genuine risk.
- No findings for UNCHANGED or NEUTRAL_REPHRASE.
- No findings for procedural additions (notice addresses, execution blocks, recitals).
- rationale: 1–3 sentences for a business audience.
- Return empty array [] if none of the differences create genuine risk.
`.trim();

// ─── Risk-eligible input shape ────────────────────────────────────────────────

/**
 * A difference entry enriched with the clause text from both sides.
 * This is what the prompt builder serialises into the user turn.
 */
export interface EnrichedDifference {
  pairId: string;
  classification: ClauseDifference["classification"];
  semanticSummary: string;
  titleA: string | null;
  titleB: string | null;
  /** Clause text capped at 800 chars per side — risk reasoning does not need full text */
  textA: string | null;
  textB: string | null;
}

/**
 * Resolve a ClauseDifference into an EnrichedDifference by pulling clause text
 * from the structure maps.  Returns null when the difference should be skipped
 * (UNCHANGED or NEUTRAL_REPHRASE — no LLM call needed for those).
 */
export function enrichDifference(
  diff: ClauseDifference,
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>
): EnrichedDifference | null {
  // Skip classifications that carry no risk signal
  if (
    diff.classification === "UNCHANGED" ||
    diff.classification === "NEUTRAL_REPHRASE"
  ) {
    return null;
  }

  const clauseA = diff.clauseAId ? clauseMapA.get(diff.clauseAId) : undefined;
  const clauseB = diff.clauseBId ? clauseMapB.get(diff.clauseBId) : undefined;

  return {
    pairId: diff.pairId,
    classification: diff.classification,
    semanticSummary: diff.semanticSummary,
    titleA: clauseA?.title ?? null,
    titleB: clauseB?.title ?? null,
    textA: clauseA ? clauseA.text.slice(0, 800) : null,
    textB: clauseB ? clauseB.text.slice(0, 800) : null,
  };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the user-turn prompt for a batch of enriched differences.
 * Kept compact — the AI Skill carries the domain knowledge.
 */
export function buildRiskPrompt(diffs: EnrichedDifference[]): string {
  const formatted = diffs.map((d) => {
    const sideA = d.textA
      ? `A: ${JSON.stringify(d.titleA)} — ${JSON.stringify(d.textA)}`
      : `A: (none — added in B)`;
    const sideB = d.textB
      ? `B: ${JSON.stringify(d.titleB)} — ${JSON.stringify(d.textB)}`
      : `B: (none — removed in B)`;
    return (
      `${JSON.stringify(d.pairId)} [${d.classification}] ${JSON.stringify(d.semanticSummary)}\n` +
      `${sideA}\n${sideB}`
    );
  });

  return (
    `Assess risk for these ${diffs.length} difference(s). ` +
    `Return one JSON array entry per difference that creates genuine risk; empty array if none.\n\n` +
    formatted.join("\n\n")
  );
}
