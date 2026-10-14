/**
 * diffHighlight.ts
 *
 * Word-level inline diff computation for side-by-side clause text rendering.
 *
 * Uses the `diff` package (already a frontend dependency) to perform a
 * word-level Myers diff between two text strings, then projects the result
 * into two parallel span arrays — one for Document A (baseline), one for
 * Document B (revised).
 *
 * Rendering contract:
 *   aSpans — spans for the baseline text pane
 *     "equal"   → render as plain text
 *     "removed" → render with red strikethrough highlight
 *     (no "added" spans appear in aSpans)
 *
 *   bSpans — spans for the revised text pane
 *     "equal"   → render as plain text
 *     "added"   → render with green highlight
 *     (no "removed" spans appear in bSpans)
 *
 * This keeps each pane's text self-consistent: Document A shows only what was
 * in A (equal + removed); Document B shows only what is in B (equal + added).
 */

import { diffWords } from "diff";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiffSpanType = "equal" | "removed" | "added";

export interface DiffSpan {
  type: DiffSpanType;
  text: string;
}

export interface InlineDiffResult {
  aSpans: DiffSpan[];
  bSpans: DiffSpan[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum combined character length we'll diff inline.
 * Beyond this limit we fall back to plain (no highlights) to avoid O(n²)
 * performance issues with very long clauses.
 */
const MAX_DIFF_CHARS = 8_000;

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Computes word-level inline diff spans for two clause texts.
 *
 * @param textA  Full text of the clause from the baseline document
 * @param textB  Full text of the clause from the revised document
 * @returns      Two parallel span arrays for rendering in each pane
 */
export function computeInlineDiff(textA: string, textB: string): InlineDiffResult {
  // Guard: empty inputs
  if (!textA && !textB) {
    return { aSpans: [], bSpans: [] };
  }
  if (!textA) {
    return { aSpans: [], bSpans: [{ type: "added", text: textB }] };
  }
  if (!textB) {
    return { aSpans: [{ type: "removed", text: textA }], bSpans: [] };
  }

  // Guard: identical text — skip the diff entirely for performance
  if (textA === textB) {
    return {
      aSpans: [{ type: "equal", text: textA }],
      bSpans: [{ type: "equal", text: textB }],
    };
  }

  // Guard: text too long — degrade gracefully to plain display
  if (textA.length + textB.length > MAX_DIFF_CHARS) {
    return {
      aSpans: [{ type: "equal", text: textA }],
      bSpans: [{ type: "equal", text: textB }],
    };
  }

  // ── Word-level diff ───────────────────────────────────────────────────────
  //
  // diffWords() returns Change[] where each element is:
  //   { value: string, added?: true, removed?: true }
  //
  // Elements that are neither added nor removed are equal (unchanged context).
  //
  const changes = diffWords(textA, textB);

  const aSpans: DiffSpan[] = [];
  const bSpans: DiffSpan[] = [];

  for (const change of changes) {
    if (change.added) {
      // Text exists only in B → bSpans "added"
      bSpans.push({ type: "added", text: change.value });
    } else if (change.removed) {
      // Text exists only in A → aSpans "removed"
      aSpans.push({ type: "removed", text: change.value });
    } else {
      // Equal — appears in both panes
      aSpans.push({ type: "equal", text: change.value });
      bSpans.push({ type: "equal", text: change.value });
    }
  }

  return {
    aSpans: mergeSpans(aSpans),
    bSpans: mergeSpans(bSpans),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises a token for changed-word membership tests: lowercase, strip
 * surrounding punctuation. Used only to decide highlight intensity — never
 * affects the text actually shown to the user.
 */
export function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

/**
 * Extracts the set of normalised word tokens that fall inside "removed" or
 * "added" spans (i.e. the actual changed portion, not the surrounding equal
 * context). Used to drive word-level PDF highlight intensity — see
 * PdfDocumentPane's changedWords prop.
 */
export function extractChangedWords(
  spans: DiffSpan[] | null,
  type: "removed" | "added"
): Set<string> {
  const set = new Set<string>();
  if (!spans) return set;
  for (const span of spans) {
    if (span.type !== type) continue;
    for (const raw of span.text.split(/\s+/)) {
      const norm = normalizeToken(raw);
      if (norm) set.add(norm);
    }
  }
  return set;
}

/**
 * Merges adjacent spans of the same type into a single span.
 * Reduces the number of React elements produced during rendering.
 */
function mergeSpans(spans: DiffSpan[]): DiffSpan[] {
  if (spans.length === 0) return spans;
  const merged: DiffSpan[] = [{ ...spans[0] }];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (last.type === spans[i].type) {
      last.text += spans[i].text;
    } else {
      merged.push({ ...spans[i] });
    }
  }
  return merged;
}
