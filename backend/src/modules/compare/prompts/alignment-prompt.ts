/**
 * alignment-prompt.ts
 *
 * System instruction and user prompt builder for the Clause Alignment step.
 *
 * The AI Skill content (clause-alignment.md) is loaded by the step and
 * prepended to systemInstruction at call time, keeping knowledge separate
 * from per-call directives.
 */

import type { ExtractedClause } from "../models/compare-state.js";

// ─── System instruction ───────────────────────────────────────────────────────

export const systemInstruction = `
You are performing clause alignment between two legal agreements.

CONTEXT: The clauses you receive are RESIDUAL — they could not be confidently
paired by deterministic matching (exact text, section numbers, or normalised
headings). Apply semantic reasoning to align them correctly.

Return ONLY a raw JSON array (no markdown fences). Each element:
{
  "clauseAId": string | null,
  "clauseBId": string | null,
  "matchConfidence": number (0.0-1.0),
  "alignmentType": "exact" | "semantic" | "unmatched",
  "alignmentReason": string,
  "status": "matched" | "added" | "removed" | "restructured"
}

━━━ PRIORITY ORDER FOR MATCHING ━━━

Apply these signals in order. A later signal can only confirm what an earlier
signal already suggests — it cannot override a mismatch detected earlier.

1. SEMANTIC CONTENT — required, primary
   Both clause previews must discuss the same legal subject matter: the same
   obligation, right, restriction, or defined concept.
   • "data breach notification" matches "data breach notification"
   • "confidentiality obligations" matches "confidentiality obligations"
   • "audit rights" does NOT match "data breach notification" even if labels match.

2. DOCUMENT ORDER — strong supporting signal
   Clauses are in document order. Prefer pairings that maintain relative order.
   Do not pair A[10] with B[2] when A[2] is unmatched, unless the content
   strongly demands it. Order violations are a red flag.

3. STRUCTURAL LABEL — weak supporting signal only
   sectionPath (e.g. ["3", "3.6"]) and numeric labels are hints, never proof.
   A matching label with mismatched content is NOT a valid match.
   A mismatched label with matching content IS a valid match (restructured).

━━━ MANDATORY REJECTION RULES ━━━

Reject (leave unmatched) any candidate pair where:

R1. CONTENT MISMATCH:
    The preview texts cover clearly different legal topics, even if the
    sectionPath or numeric label is identical.

R2. FRAGMENT DETECTION:
    One preview starts mid-sentence with no grammatical subject — signs of
    extraction corruption.  Examples of suspicious starts:
      "suspects that a Data Security Breach..."
      "themselves, in writing..."
      "an element by which..."
      "costs related to..."
    These are fragment artifacts.  Do not match them on label alone.
    Mark the A clause "removed" and the B clause "added" separately.

R3. LENGTH ASYMMETRY:
    One side has fewer than 15 words while the other is a full legal clause.
    A short fragment cannot be a valid counterpart to a substantive clause.

R4. PREAMBLE / RECITAL MISMATCH:
    Clauses with sectionPath like ["A"], ["B"], ["C"] are lettered recital
    paragraphs from the document preamble.  Match them only if their text
    covers the same recital topic.  An inserted standalone paragraph
    (sectionPath [] with no heading) that has no counterpart on the other
    side must be left as "added" — do not absorb it into the nearest labeled
    recital.

R5. CASCADE PREVENTION:
    If accepting a match would force the next 3+ clause pairs into cross-order
    arrangements, the match is wrong.  Prefer leaving the clause unmatched
    over creating a cascade of misaligned pairs downstream.

━━━ CONSERVATISM RULE ━━━

When uncertain, do NOT force a match.
A false unmatched (marked removed/added) is always safer than a false match
because wrong matches generate false diff findings in every downstream step.
Set matchConfidence below 0.50 and use alignmentType "unmatched" when unsure.

━━━ HARD RULES ━━━

- Every clause from A must appear in exactly one entry (clauseAId field).
- Unmatched B clauses: clauseAId null, status "added".
- clauseBId null when status is "removed".
- alignmentReason must name the specific signal(s) used. If rejecting, name
  which rejection rule (R1–R5) applied.
- No duplicate clauseBId values across matched entries.
- matchConfidence below 0.50 must use alignmentType "unmatched".
`.trim();

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Builds the user-turn prompt for a batch of residual clauses to align.
 *
 * Each clause entry includes:
 *   - id:          stable clause identifier
 *   - title:       heading text (may be bare marker or full inline heading)
 *   - sectionPath: structural parent hierarchy, e.g. ["1", "(a)"]
 *   - preview:     first 600 characters of clause body text
 */
export const verificationSystemInstruction = `
You verify whether two residual contract clauses represent the same underlying provision.

The backend already scored these pairs structurally. You do NOT invent pairings.
You do NOT invent clause IDs. Use only the IDs supplied on each candidate.

Return ONLY a raw JSON array. One element per candidate, in the same order:
{
  "clauseAId": string,
  "clauseBId": string | null,
  "relationship": "MATCH" | "NOT_MATCH" | "MOVED" | "UNCERTAIN",
  "confidence": number (0.0-1.0),
  "reason": string,
  "same_underlying_subject": boolean
}

Rules:
- MATCH: same legal subject (obligation, right, restriction, defined concept), even if numbering/title changed.
- MOVED: same subject, clearly relocated or renumbered.
- NOT_MATCH: different legal subject. Shared section numbers are not proof of a match.
- UNCERTAIN: cannot tell from the provided text.
- same_underlying_subject must be true for MATCH and MOVED; false for NOT_MATCH.
- Prefer a candidate in the same document module (controller-to-processor vs controller-to-controller, annex vs main terms). A similar title in a different module is not a match unless the body shows the provision actually moved.
- Do not create legal findings. Do not classify added/removed.
- Do not classify SPLIT or MERGED. The backend owns split/merge detection.
- If two candidates share a clause ID, you may MATCH at most one ordinary pair; prefer the stronger subject match.
`.trim();

export interface VerificationCandidatePrompt {
  clauseAId: string;
  clauseBId: string;
  titleA: string;
  titleB: string;
  sectionPathA: string[];
  sectionPathB: string[];
  parentA: string;
  parentB: string;
  positionA: number;
  positionB: number;
  textA: string;
  textB: string;
  neighborA: string;
  neighborB: string;
  structuralScore: number;
  structuralReasons: string[];
  moduleA: string;
  moduleB: string;
}

export function buildVerificationPrompt(candidates: VerificationCandidatePrompt[]): string {
  const blocks = candidates.map((c, i) => {
    return [
      `CANDIDATE ${i + 1}`,
      `A.id=${c.clauseAId} title=${JSON.stringify(c.titleA)} path=${JSON.stringify(c.sectionPathA)} parent=${JSON.stringify(c.parentA)} position=${c.positionA}`,
      `A.neighbors=${JSON.stringify(c.neighborA)}`,
      `A.text=${JSON.stringify(c.textA.slice(0, 800))}`,
      `B.id=${c.clauseBId} title=${JSON.stringify(c.titleB)} path=${JSON.stringify(c.sectionPathB)} parent=${JSON.stringify(c.parentB)} position=${c.positionB}`,
      `B.neighbors=${JSON.stringify(c.neighborB)}`,
      `B.text=${JSON.stringify(c.textB.slice(0, 800))}`,
      `structuralScore=${c.structuralScore.toFixed(2)} reasons=${JSON.stringify(c.structuralReasons)}`,
      `moduleA=${JSON.stringify(c.moduleA)} moduleB=${JSON.stringify(c.moduleB)}`,
    ].join("\n");
  });

  return [
    `Verify ${candidates.length} candidate pair(s).`,
    `Question for each: do these two clauses represent the same underlying contractual provision?`,
    ``,
    ...blocks,
    ``,
    `Return one JSON object per candidate, using the supplied clauseAId and clauseBId only.`,
  ].join("\n");
}

export function buildAlignmentPrompt(
  clausesA: ExtractedClause[],
  clausesB: ExtractedClause[]
): string {
  const formatClause = (c: ExtractedClause) =>
    `  { "id": "${c.id}", "title": ${JSON.stringify(c.title)}, ` +
    `"sectionPath": ${JSON.stringify(c.sectionPath)}, ` +
    `"preview": ${JSON.stringify(c.text.slice(0, 600))} }`;

  const aList = clausesA.map(formatClause).join(",\n");
  const bList = clausesB.map(formatClause).join(",\n");

  return `
AGREEMENT A — ${clausesA.length} residual clause(s) (document order):
[
${aList}
]

AGREEMENT B — ${clausesB.length} residual clause(s) (document order):
[
${bList}
]

Produce the alignment array. Rules:
- Match only when semantic content confirms the same legal subject (signal 1).
- Use sectionPath as a weak hint only — never as proof of a match.
- Apply rejection rules R1–R5 before accepting any pair.
- Unmatched B clauses with sectionPath [] and no title are standalone inserted
  paragraphs — mark them status "added", do not absorb into another clause.
- When uncertain, leave unmatched rather than forcing a match.
`.trim();
}
