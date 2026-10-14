import type { Locator } from "../models/locator.js";
import type { DocumentSegment, SegmentedDocument } from "../models/document-workspace.js";

const HEADING_RE = /^(#{1,3}\s+.+|[A-Z][A-Z0-9 \-/]{8,}|Article\s+\d+[.:)].*|\d+\.\s+[A-Z].+)$/m;
/**
 * Numbered clauses: `1. Title`, `1) Title`, and dotted `3.6 Title` / `3.6.1 Title`.
 * Does not treat a bare integer + capital (`28 The processor`) as a clause.
 */
export const NUMBERED_CLAUSE_RE =
  /^(\d+(?:\.\d+)*)[.)]\s+|^(\d+\.\d+(?:\.\d+)*)\s+/;

/**
 * Mid-line compound-numbered clause markers, e.g. `... 8.1. Notification.` or
 * `... 9.2. Except for ...`. Some docx→text conversions (particularly
 * PDF-to-DOCX round trips) lose paragraph breaks between adjacent numbered
 * items, collapsing several clauses onto one line/paragraph. Requiring a
 * dotted (compound) number here — not a bare top-level `8.` — keeps this from
 * false-matching ordinary numbers in running prose ("30 days").
 */
const INLINE_CLAUSE_RE = /(\d+\.\d+(?:\.\d+)*)[.)]\s+(?=[A-Z"“(])/g;

/**
 * Deterministic structural segmentation of plain text.
 * Produces stable structuralPath + charRange for Locator schema.
 * v1: headings + numbered clauses; no OCR/table parser.
 */
export function segmentDocument(
  docId: string,
  fullText: string,
  opts?: { title?: string; role?: SegmentedDocument["role"] }
): SegmentedDocument {
  const text = fullText.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const segments: DocumentSegment[] = [];

  let offset = 0;
  let clauseCounter = 0;
  let paraCounter = 0;
  let currentHeadingPath = "root";

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const trimmed = line.trim();

    if (!trimmed) {
      offset = lineEnd + 1; // +1 for newline
      continue;
    }

    const leadingWs = line.length - line.trimStart().length;
    const trimmedStart = lineStart + leadingWs;

    // Split this line at any mid-line compound-numbered clause markers first,
    // so a collapsed multi-clause line becomes one segment per clause instead
    // of one giant blob (see INLINE_CLAUSE_RE).
    const boundaries = [0];
    for (const m of trimmed.matchAll(INLINE_CLAUSE_RE)) {
      if (m.index! > 0) boundaries.push(m.index!);
    }
    boundaries.push(trimmed.length);

    for (let i = 0; i < boundaries.length - 1; i++) {
      const chunkRaw = trimmed.slice(boundaries[i], boundaries[i + 1]);
      const chunkLeadingWs = chunkRaw.length - chunkRaw.trimStart().length;
      const chunk = chunkRaw.trim();
      if (!chunk) continue;

      const chunkStart = trimmedStart + boundaries[i] + chunkLeadingWs;
      const chunkEnd = chunkStart + chunk.length;

      const numbered = chunk.match(NUMBERED_CLAUSE_RE);
      if (numbered) {
        clauseCounter += 1;
        const number = numbered[1] ?? numbered[2]!;
        const path = `clause-${number}`;
        segments.push({
          locator: makeLocator(docId, path, chunkStart, chunkEnd),
          text: chunk,
          kind: "clause",
        });
        currentHeadingPath = path;
        continue;
      }

      if (HEADING_RE.test(chunk) && chunk.length < 120) {
        const slug = slugify(chunk.replace(/^#+\s*/, ""));
        const path = `heading-${slug}`;
        segments.push({
          locator: makeLocator(docId, path, chunkStart, chunkEnd),
          text: chunk,
          kind: "heading",
        });
        currentHeadingPath = path;
        continue;
      }

      paraCounter += 1;
      const path = `${currentHeadingPath}.para-${paraCounter}`;
      segments.push({
        locator: makeLocator(docId, path, chunkStart, chunkEnd),
        text: chunk,
        kind: "paragraph",
      });
    }

    offset = lineEnd + 1;
  }

  // Merge consecutive paragraphs under the same clause into richer spans when short
  const merged = mergeAdjacentParagraphs(docId, text, segments);

  return {
    docId,
    title: opts?.title,
    role: opts?.role ?? "unknown",
    fullText: text,
    segments: merged,
    clauses: [],
  };
}

function makeLocator(
  docId: string,
  structuralPath: string,
  start: number,
  end: number
): Locator {
  return {
    docId,
    structuralPath,
    charRange: [start, end],
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "section";
}

function mergeAdjacentParagraphs(
  docId: string,
  fullText: string,
  segments: DocumentSegment[]
): DocumentSegment[] {
  if (segments.length === 0) return segments;
  const out: DocumentSegment[] = [];
  let buf: DocumentSegment | null = null;

  for (const seg of segments) {
    if (seg.kind === "clause" || seg.kind === "heading") {
      if (buf) out.push(buf);
      buf = null;
      out.push(seg);
      continue;
    }
    if (!buf) {
      buf = { ...seg };
      continue;
    }
    // Extend char range across adjacent paragraphs
    const start = buf.locator.charRange[0];
    const end = seg.locator.charRange[1];
    buf = {
      locator: makeLocator(docId, buf.locator.structuralPath, start, end),
      text: fullText.slice(start, end).trim(),
      kind: "paragraph",
    };
  }
  if (buf) out.push(buf);
  return out;
}

/** Resolve a locator against segmented document text. */
export function resolveSpan(
  doc: SegmentedDocument,
  locator: Locator
): string | null {
  if (locator.docId !== doc.docId) return null;
  const [start, end] = locator.charRange;
  if (start < 0 || end > doc.fullText.length || start > end) return null;
  const byPath = doc.segments.find((s) => s.locator.structuralPath === locator.structuralPath);
  if (byPath) {
    const slice = doc.fullText.slice(start, end);
    return slice || byPath.text;
  }
  return doc.fullText.slice(start, end) || null;
}
