/**
 * alignment-prompt.ts
 *
 * System instruction and user prompt builder for the Clause Alignment step.
 *
 * Pattern mirrors modules/drafting/prompts/risk-review-template.ts:
 *   - systemInstruction: a constant string — the per-step directive.
 *   - buildAlignmentPrompt(): a builder function that receives runtime data
 *     and returns the user-turn prompt string.
 *
 * The AI Skill content (clause-alignment.md) is loaded by the step and
 * prepended to systemInstruction at call time, keeping knowledge separate
 * from per-call directives.
 */

import type { ExtractedClause } from "../models/compare-state.js";

// ─── System instruction ───────────────────────────────────────────────────────
// This is the per-step directive. The AI Skill (clause-alignment.md) is
// prepended to this string by clauseAlignStep before the LLM call.

export const systemInstruction = `
You are performing clause alignment between two legal agreements.

Return ONLY a raw JSON array (no markdown fences). Each element:
{
  "clauseAId": string | null,
  "clauseBId": string | null,
  "matchConfidence": number (0.0–1.0),
  "alignmentType": "exact" | "semantic" | "unmatched",
  "alignmentReason": string,
  "status": "matched" | "added" | "removed" | "restructured"
}

Rules:
- Every clause from A must appear in exactly one entry (as clauseAId).
- Unmatched B clauses: clauseAId null, status "added".
- clauseBId null when status is "removed".
- alignmentReason must be non-empty.
- No duplicate clauseBId values across matched entries.
`.trim();

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Builds the user-turn prompt for a batch of clauses to align.
 *
 * To stay within token limits, the step passes only the clause title and
 * a short text preview (first 300 characters) for each clause. The LLM
 * does not need the full clause body to determine alignment — it only needs
 * enough to recognise the legal concept.
 */
export function buildAlignmentPrompt(
  clausesA: ExtractedClause[],
  clausesB: ExtractedClause[]
): string {
  const formatClause = (c: ExtractedClause) =>
    `  { "id": "${c.id}", "title": ${JSON.stringify(c.title)}, "preview": ${JSON.stringify(c.text.slice(0, 300))} }`;

  const aList = clausesA.map(formatClause).join(",\n");
  const bList = clausesB.map(formatClause).join(",\n");

  return `
AGREEMENT A — ${clausesA.length} clause(s):
[
${aList}
]

AGREEMENT B — ${clausesB.length} clause(s):
[
${bList}
]

Produce the alignment array. Account for every clause in A and every unmatched clause in B.
`.trim();
}
