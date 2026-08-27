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

    const numbered = trimmed.match(NUMBERED_CLAUSE_RE);
    if (numbered) {
      clauseCounter += 1;
      const number = numbered[1] ?? numbered[2]!;
      const path = `clause-${number}`;
      segments.push({
        locator: makeLocator(docId, path, lineStart, lineEnd),
        text: trimmed,
        kind: "clause",
      });
      currentHeadingPath = path;
      offset = lineEnd + 1;
      continue;
    }

    if (HEADING_RE.test(trimmed) && trimmed.length < 120) {
      const slug = slugify(trimmed.replace(/^#+\s*/, ""));
      const path = `heading-${slug}`;
      segments.push({
        locator: makeLocator(docId, path, lineStart, lineEnd),
        text: trimmed,
        kind: "heading",
      });
      currentHeadingPath = path;
      offset = lineEnd + 1;
      continue;
    }

    paraCounter += 1;
    const path = `${currentHeadingPath}.para-${paraCounter}`;
    segments.push({
      locator: makeLocator(docId, path, lineStart, lineEnd),
      text: trimmed,
      kind: "paragraph",
    });
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
