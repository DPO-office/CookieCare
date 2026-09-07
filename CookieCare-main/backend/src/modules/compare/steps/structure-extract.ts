/**
 * structure-extract.ts — Step 2 of the Compare pipeline
 *
 * Responsibility: segment each document's extracted text into addressable
 * clause objects and populate CompareState.structure.
 *
 * Deterministic only — no LLM involvement.
 * Uses clause-boundaries.ts for regex/heuristic segmentation.
 */

import crypto from "crypto";
import {
  CompareState,
  ExtractedClause,
} from "../models/compare-state.js";
import {
  segmentIntoRawClauses,
  chunkByParagraphs,
  RawSegment,
} from "../utils/clause-boundaries.js";

// Minimum segment body length to be treated as a meaningful clause.
// Segments shorter than this are likely stray headings or page artefacts.
const MIN_CLAUSE_CHARS = 40;

/**
 * Given a sorted array of cumulative page-start offsets and a clause char
 * position within the flat extracted text, return the 1-indexed page number.
 *
 * Binary search: O(log n) over number of pages.
 */
function resolvePageNumber(
  position: number,
  pageBreaks: number[] | undefined
): number | undefined {
  if (!pageBreaks || pageBreaks.length === 0) return undefined;
  // pageBreaks[i] is the char offset at which page i+1 begins.
  // We want the largest i such that pageBreaks[i] <= position.
  let lo = 0;
  let hi = pageBreaks.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pageBreaks[mid] <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // 1-indexed
}

/**
 * Convert a RawSegment array produced by clause-boundaries.ts into
 * ExtractedClause objects with stable IDs.
 *
 * @param segments    Raw segments from the boundary detector
 * @param docKey      "a" or "b" — used to namespace clause IDs
 * @param pageBreaks  Cumulative page offsets from extractText (PDF only)
 */
function toExtractedClauses(
  segments: RawSegment[],
  docKey: "a" | "b",
  pageBreaks?: number[]
): ExtractedClause[] {
  return segments
    .filter((s) => s.text.trim().length >= MIN_CLAUSE_CHARS)
    .map((s, index) => ({
      id: `doc-${docKey}-clause-${index + 1}`,
      title: s.heading || `Clause ${index + 1}`,
      text: s.text.trim(),
      position: s.position,
      sectionPath: s.sectionPath,
      pageNumber: resolvePageNumber(s.position, pageBreaks),
    }));
}

/**
 * Segment one document's text into clauses, with a fallback to paragraph
 * chunking if the heading-based approach yields fewer than 2 segments.
 */
function extractClauses(
  text: string,
  docKey: "a" | "b",
  pageBreaks?: number[]
): ExtractedClause[] {
  let segments = segmentIntoRawClauses(text);

  // Fallback: unstructured documents (e.g. no numbered sections or headings)
  if (segments.length < 2) {
    console.log(
      `[structureExtractStep] doc-${docKey}: heading-based segmentation yielded ` +
        `${segments.length} segment(s) — falling back to paragraph chunking.`
    );
    segments = chunkByParagraphs(text);
  }

  return toExtractedClauses(segments, docKey, pageBreaks);
}

/**
 * structureExtractStep — Stage 2 of the compare pipeline.
 *
 * Requires state.parsed to be populated (i.e. parseStep must have run first).
 * Returns an enriched CompareState with the `structure` field populated.
 */
export async function structureExtractStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.parsed) {
    throw new Error(
      "[structureExtractStep] state.parsed is null — parseStep must run before structure extraction."
    );
  }

  const { textA, textB, pageBreaksA, pageBreaksB } = state.parsed;

  const clausesA = extractClauses(textA, "a", pageBreaksA);
  const clausesB = extractClauses(textB, "b", pageBreaksB);

  console.log(
    `[structureExtractStep] Segmentation complete — ` +
      `original: ${clausesA.length} clause(s) | revised: ${clausesB.length} clause(s)`
  );

  return {
    ...state,
    structure: { clausesA, clausesB },
  };
}
