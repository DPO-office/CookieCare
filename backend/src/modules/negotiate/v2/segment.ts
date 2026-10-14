/**
 * Deterministic stable clause segmentation + clauseRef (V2 Stage 0).
 *
 * Pure — NO LLM. Segmentation is a function of the stored plaintext only, so:
 *   - the same stored version segments identically every run,
 *   - whitespace/punctuation noise does not change a clauseRef,
 *   - identity is content-anchored (never LLM-generated).
 *
 * Offsets are computed against the exact input string so downstream splice /
 * evidence location is reliable.
 */
import crypto from "crypto";
import { ClauseSegment, SegmentationResult, SEGMENTER_VERSION } from "./types.js";

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/** Normalize for hashing only (collapse whitespace, unify quotes/dashes, lowercase). */
export function normForHash(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A line is a heading/section boundary when it starts a numbered section, an
 * appendix/annex/schedule, or is a short ALL-CAPS title. Deterministic.
 */
const HEADING_RE = new RegExp(
  "^\\s*(" +
    "\\d+(?:\\.\\d+)*\\.?\\s+\\S" +          // "1. ", "2.1 ", "11.3.1 "
    "|[A-Z]\\.\\d+(?:\\.\\d+)*\\s+\\S" +      // "A.1 "
    "|(?:APPENDIX|ANNEX|SCHEDULE|EXHIBIT|SECTION)\\b" + // Appendix/Annex/...
    "|[A-Z][A-Z0-9 ,&/()'-]{3,}$" +          // ALL-CAPS heading line
    ")",
  "i"
);

/** Extract a short heading label from a boundary line. */
function headingLabel(line: string): string {
  const t = line.replace(/\s+/g, " ").trim();
  return t.length <= 80 ? t : t.slice(0, 80);
}

const MAX_SEGMENT_CHARS = 2000; // split over-long sections on blank lines

/**
 * Segment `text` into stable clause units.
 * Algorithm: walk lines; a heading line starts a new segment. Very long
 * segments are further split on blank-line paragraph boundaries so a single
 * unnumbered block does not become one giant clause.
 */
export function segmentDocument(text: string): SegmentationResult {
  const segments: ClauseSegment[] = [];
  if (!text) return { contentHash: sha256(""), segmenterVersion: SEGMENTER_VERSION, segments };

  // Precompute line start offsets against the raw string.
  const lines: { text: string; start: number }[] = [];
  {
    let idx = 0;
    for (const raw of text.split("\n")) {
      lines.push({ text: raw, start: idx });
      idx += raw.length + 1; // +1 for the split '\n'
    }
  }

  type Block = { headingPath: string; startLine: number; endLine: number };
  const blocks: Block[] = [];
  let curHeading = "Preamble";
  let curStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].text;
    if (HEADING_RE.test(ln) && ln.trim().length > 0) {
      if (i > curStart) blocks.push({ headingPath: curHeading, startLine: curStart, endLine: i - 1 });
      curHeading = headingLabel(ln);
      curStart = i;
    }
  }
  blocks.push({ headingPath: curHeading, startLine: curStart, endLine: lines.length - 1 });

  let ordinal = 0;
  for (const b of blocks) {
    const blockStart = lines[b.startLine].start;
    const lastLine = lines[b.endLine];
    const blockEnd = lastLine.start + lastLine.text.length;
    const blockText = text.slice(blockStart, blockEnd);
    if (!blockText.trim()) continue;

    // Split over-long blocks on blank-line boundaries, preserving offsets.
    const pieces: { text: string; start: number; end: number }[] = [];
    if (blockText.length <= MAX_SEGMENT_CHARS) {
      pieces.push({ text: blockText, start: blockStart, end: blockEnd });
    } else {
      let pieceStart = blockStart;
      const parts = blockText.split(/\n\s*\n/);
      let cursor = blockStart;
      for (const part of parts) {
        const partStart = text.indexOf(part, cursor);
        const s = partStart >= 0 ? partStart : cursor;
        const e = s + part.length;
        if (part.trim()) pieces.push({ text: part, start: s, end: e });
        cursor = e;
      }
      if (pieces.length === 0) pieces.push({ text: blockText, start: blockStart, end: blockEnd });
      void pieceStart;
    }

    for (const p of pieces) {
      const clauseRef = "c_" + crypto
        .createHash("sha1")
        .update(normForHash(b.headingPath) + "¶" + normForHash(p.text))
        .digest("hex")
        .slice(0, 12);
      segments.push({
        clauseRef,
        headingPath: b.headingPath,
        text: p.text,
        charStart: p.start,
        charEnd: p.end,
        ordinal: ordinal++,
      });
    }
  }

  return { contentHash: sha256(text), segmenterVersion: SEGMENTER_VERSION, segments };
}

/** Locate a (possibly re-whitespaced) quote's char offset within the document. */
export function locateQuote(quote: string, documentText: string): number {
  if (!quote) return -1;
  const exact = documentText.indexOf(quote);
  if (exact !== -1) return exact;
  // normalized fallback
  const nq = normForHash(quote);
  if (!nq) return -1;
  const norm: string[] = [];
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < documentText.length; i++) {
    const ch = documentText[i];
    if (/\s/.test(ch)) { if (!prevSpace) { norm.push(" "); map.push(i); prevSpace = true; } }
    else { norm.push(ch.toLowerCase()); map.push(i); prevSpace = false; }
  }
  const idx = norm.join("").indexOf(nq);
  return idx === -1 ? -1 : map[idx];
}
