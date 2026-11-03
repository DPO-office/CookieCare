import type { SourceMap, SourceSpan } from "./source-map.js";

export type LayoutZone = "main" | "margin_note" | "line_number" | "running_header" | "running_footer";

export interface NormalizedBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PageBodyBand {
  columns: Array<{ left: number; right: number }>;
  envelopeLeft: number;
  envelopeRight: number;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isSubstantiveZone(zone: LayoutZone | undefined): boolean {
  return !zone || zone === "main";
}

/** Extract a unified raw bbox from Docling provenance entries on the resolved page when item.bbox is absent. */
export function extractProvenanceBox(
  provenance: unknown[],
  page: number | null,
  explicitBbox?: unknown,
): JsonObject | undefined {
  const direct = asObject(explicitBbox);
  if (direct && finiteNumber(direct.l) !== null && finiteNumber(direct.r) !== null &&
      finiteNumber(direct.t) !== null && finiteNumber(direct.b) !== null) {
    return direct;
  }
  const boxes: JsonObject[] = [];
  for (const entry of provenance) {
    const obj = asObject(entry);
    if (!obj) continue;
    if (page !== null && obj.page_no !== page) continue;
    const bbox = asObject(obj.bbox);
    if (!bbox) continue;
    if (finiteNumber(bbox.l) !== null && finiteNumber(bbox.r) !== null &&
        finiteNumber(bbox.t) !== null && finiteNumber(bbox.b) !== null) {
      boxes.push(bbox);
    }
  }
  if (!boxes.length) return undefined;
  if (boxes.length === 1) return boxes[0]!;
  const origin = boxes[0]!.coord_origin;
  if (!boxes.every(box => box.coord_origin === origin)) return boxes[0]!;
  let minL = Infinity;
  let maxR = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    const l = finiteNumber(box.l)!;
    const r = finiteNumber(box.r)!;
    const t = finiteNumber(box.t)!;
    const b = finiteNumber(box.b)!;
    minL = Math.min(minL, l, r);
    maxR = Math.max(maxR, l, r);
    minY = Math.min(minY, t, b);
    maxY = Math.max(maxY, t, b);
  }
  return origin === "BOTTOMLEFT"
    ? { l: minL, t: maxY, r: maxR, b: minY, ...(origin ? { coord_origin: origin } : {}) }
    : { l: minL, t: minY, r: maxR, b: maxY, ...(origin ? { coord_origin: origin } : {}) };
}

/** Normalize Docling TOPLEFT or BOTTOMLEFT coordinates into top-origin [0..width] x [0..height] space. */
export function normalizeSpanBox(
  span: Pick<SourceSpan, "bbox" | "provenance" | "page">,
  pageSize?: { width: number | null; height: number | null } | null,
): NormalizedBox | null {
  const raw = extractProvenanceBox(span.provenance, span.page, span.bbox);
  if (!raw) return null;
  const l = finiteNumber(raw.l);
  const r = finiteNumber(raw.r);
  const t = finiteNumber(raw.t);
  const b = finiteNumber(raw.b);
  if (l === null || r === null || t === null || b === null) return null;
  const left = Math.min(l, r);
  const right = Math.max(l, r);
  const width = Math.max(0, right - left);
  const pageHeight = pageSize?.height && pageSize.height > 0 ? pageSize.height : null;
  const isBottomLeft = raw.coord_origin === "BOTTOMLEFT" || (raw.coord_origin === undefined && pageHeight !== null && t > b);
  let top: number;
  let bottom: number;
  if (isBottomLeft && pageHeight !== null) {
    top = Math.max(0, pageHeight - Math.max(t, b));
    bottom = Math.max(top, pageHeight - Math.min(t, b));
  } else {
    top = Math.min(t, b);
    bottom = Math.max(t, b);
  }
  return { left, top, right, bottom, width, height: Math.max(0, bottom - top) };
}

function runningSignature(rawText: string): string {
  return rawText
    .trim()
    .toLowerCase()
    .replace(/\d+/gu, "#")
    .replace(/\s+/gu, " ");
}

function isStructuralOpeningText(rawText: string): boolean {
  const trimmed = rawText.trim();
  return /^(?:chapter|part|title|division|subdivision|schedule|annex|article|section|rule)\b/iu.test(trimmed) ||
    /^(?:\d+(?:\.\d+)*[a-z]?\.\s+\p{L}|\(\s*(?:\d+[a-z]?|[a-z]|[ivxlcdm]+)\s*\)\s+\p{L})/iu.test(trimmed);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Deterministically classify every SourceSpan into spatial 2D layout zones:
 * - running_header / running_footer (explicit labels, publisher banners, or repeating top/bottom strips)
 * - margin_note / line_number (outer horizontal gutters on 1-column, mirrored odd/even, or 2-column pages)
 * - main (substantive legal text, headings, and tables)
 *
 * Canonical map.text and character offsets are never altered.
 */
export function assignLayoutZones(
  spans: SourceSpan[],
  pages: SourceMap["pages"],
  fullText: string,
): Map<number, PageBodyBand> {
  const pageByNo = new Map(pages.map(page => [page.physicalPage, page]));
  const boxBySpan = new Map<SourceSpan, NormalizedBox>();
  for (const span of spans) {
    const pageInfo = span.page !== null ? pageByNo.get(span.page) ?? null : null;
    const box = normalizeSpanBox(span, pageInfo);
    if (box) boxBySpan.set(span, box);
  }

  // 1. Explicit furniture labels and publisher masthead markers.
  for (const span of spans) {
    const raw = fullText.slice(span.start, span.end).trim();
    if (span.blockType === "page_header") {
      span.layoutZone = "running_header";
      continue;
    }
    if (span.blockType === "page_footer") {
      span.layoutZone = "running_footer";
      continue;
    }
    if (span.parentRef === "#/furniture") {
      const pageInfo = span.page !== null ? pageByNo.get(span.page) : undefined;
      const box = boxBySpan.get(span);
      span.layoutZone = box && pageInfo?.height && box.top >= pageInfo.height * 0.5
        ? "running_footer"
        : "running_header";
      continue;
    }
    if (/^xxxGID[HE]xxx\b/iu.test(raw) ||
        /Separate paging is given to this Part in order that it may be filed as a separate compilation/iu.test(raw) ||
        /California Law\s+Publications\s+Other Resources/iu.test(raw) ||
        /^\s*Code:\s+Select Code\s+Section:\s+Search\s*$/iu.test(raw)) {
      span.layoutZone = "running_header";
    }
  }

  // 2. Geometric repeating top/bottom strips across multi-page documents.
  if (pages.length >= 2) {
    const topPagesBySig = new Map<string, Set<number>>();
    const bottomPagesBySig = new Map<string, Set<number>>();
    const stripCandidates: Array<{ span: SourceSpan; strip: "top" | "bottom"; sig: string; raw: string }> = [];

    for (const span of spans) {
      if (span.layoutZone || span.kind === "table_cell" || span.page === null) continue;
      const pageInfo = pageByNo.get(span.page);
      const box = boxBySpan.get(span);
      if (!pageInfo?.height || pageInfo.height < 200 || !pageInfo.width || pageInfo.width < 200 || !box) continue;
      const raw = fullText.slice(span.start, span.end).trim();
      if (!raw || raw.length > 140 || box.height > pageInfo.height * 0.065) continue;
      const inTop = box.bottom <= pageInfo.height * 0.085;
      const inBottom = !inTop && box.top >= pageInfo.height * 0.915;
      if (!inTop && !inBottom) continue;
      const sig = runningSignature(raw);
      const strip = inTop ? "top" : "bottom";
      stripCandidates.push({ span, strip, sig, raw });
      const targetMap = inTop ? topPagesBySig : bottomPagesBySig;
      const seenPages = targetMap.get(sig) ?? new Set<number>();
      seenPages.add(span.page);
      targetMap.set(sig, seenPages);
    }

    for (const candidate of stripCandidates) {
      if (isStructuralOpeningText(candidate.raw)) continue;
      const seenCount = (candidate.strip === "top" ? topPagesBySig : bottomPagesBySig).get(candidate.sig)?.size ?? 0;
      const standalonePageNumber = /^(?:page\s*)?(?:\d{1,4}|[ivxlcdm]{1,6})$/iu.test(candidate.raw) ||
        /^[-–—]\s*\d{1,4}\s*[-–—]$/u.test(candidate.raw) ||
        /^\[?\s*part\s+[ivx0-9]+\b[^\n]{0,80}\bsec\.\s*\d+/iu.test(candidate.raw) ||
        /^the\s+gazette\s+of\s+india\b/iu.test(candidate.raw);
      if (seenCount >= 2 || standalonePageNumber) {
        candidate.span.layoutZone = candidate.strip === "top" ? "running_header" : "running_footer";
      }
    }
  }

  // 3. Per-page 1-column vs 2-column body band & outer margin detection.
  const spansByPage = new Map<number, SourceSpan[]>();
  for (const span of spans) {
    if (span.layoutZone || span.kind === "table_cell" || span.page === null) continue;
    if (!boxBySpan.has(span)) continue;
    const list = spansByPage.get(span.page) ?? [];
    list.push(span);
    spansByPage.set(span.page, list);
  }

  const pageBands = new Map<number, PageBodyBand>();
  const singleColLefts: number[] = [];
  const singleColRights: number[] = [];

  for (const [pageNo, pageSpans] of spansByPage) {
    const pageInfo = pageByNo.get(pageNo);
    const pageWidth = pageInfo?.width;
    if (!pageWidth || pageWidth < 200) continue;

    // Check for 2-column layout (e.g. EU Official Journal)
    const midX = pageWidth * 0.5;
    const gutterTol = pageWidth * 0.03;
    const colCandidates = pageSpans.filter(span => {
      const box = boxBySpan.get(span)!;
      return box.width >= pageWidth * 0.18 && box.width <= pageWidth * 0.48;
    });
    const leftCol = colCandidates.filter(span => boxBySpan.get(span)!.right <= midX + gutterTol);
    const rightCol = colCandidates.filter(span => boxBySpan.get(span)!.left >= midX - gutterTol);
    const leftChars = leftCol.reduce((sum, span) => sum + (span.end - span.start), 0);
    const rightChars = rightCol.reduce((sum, span) => sum + (span.end - span.start), 0);
    const totalPageChars = pageSpans.reduce((sum, span) => sum + (span.end - span.start), 0);

    if (leftCol.length >= 3 && rightCol.length >= 3 &&
        leftChars >= 180 && rightChars >= 180 &&
        leftChars + rightChars >= totalPageChars * 0.55) {
      const col0Left = Math.min(...leftCol.map(span => boxBySpan.get(span)!.left));
      const col0Right = Math.max(...leftCol.map(span => boxBySpan.get(span)!.right));
      const col1Left = Math.min(...rightCol.map(span => boxBySpan.get(span)!.left));
      const col1Right = Math.max(...rightCol.map(span => boxBySpan.get(span)!.right));
      pageBands.set(pageNo, {
        columns: [{ left: col0Left, right: col0Right }, { left: col1Left, right: col1Right }],
        envelopeLeft: col0Left,
        envelopeRight: col1Right,
      });
      continue;
    }

    // 1-column wide body lines
    const wide = pageSpans.filter(span => boxBySpan.get(span)!.width >= pageWidth * 0.28);
    if (wide.length >= 2) {
      const lefts = wide.map(span => boxBySpan.get(span)!.left).sort((a, b) => a - b);
      const rights = wide.map(span => boxBySpan.get(span)!.right).sort((a, b) => a - b);
      const envelopeLeft = lefts[Math.floor(lefts.length * 0.05)]!;
      const envelopeRight = rights[Math.min(rights.length - 1, Math.ceil(rights.length * 0.95) - 1)]!;
      pageBands.set(pageNo, {
        columns: [{ left: envelopeLeft, right: envelopeRight }],
        envelopeLeft,
        envelopeRight,
      });
      if (wide.length >= 3) {
        singleColLefts.push(envelopeLeft);
        singleColRights.push(envelopeRight);
      }
    }
  }

  const fallbackLeft = median(singleColLefts);
  const fallbackRight = median(singleColRights);

  for (const [pageNo, pageSpans] of spansByPage) {
    const pageInfo = pageByNo.get(pageNo);
    const pageWidth = pageInfo?.width;
    if (!pageWidth || pageWidth < 200) continue;

    let band = pageBands.get(pageNo);
    if (!band && fallbackLeft !== null && fallbackRight !== null) {
      band = {
        columns: [{ left: fallbackLeft, right: fallbackRight }],
        envelopeLeft: fallbackLeft,
        envelopeRight: fallbackRight,
      };
      pageBands.set(pageNo, band);
    }
    if (!band) continue;

    const tol = Math.max(2, pageWidth * 0.005);
    const maxMarginWidth = band.columns.length === 2 ? pageWidth * 0.14 : pageWidth * 0.25;

    for (const span of pageSpans) {
      const box = boxBySpan.get(span)!;
      const raw = fullText.slice(span.start, span.end).trim();
      const outsideLeft = box.right <= band.envelopeLeft - tol;
      const outsideRight = box.left >= band.envelopeRight + tol;

      if ((outsideLeft || outsideRight) && box.width <= maxMarginWidth &&
          raw.length <= 260 && !isStructuralOpeningText(raw)) {
        span.layoutZone = /^\d{1,4}$/u.test(raw) ? "line_number" : "margin_note";
        continue;
      }

      if (band.columns.length === 2) {
        const [col0, col1] = band.columns;
        if (box.right <= col0!.right + tol && box.left >= col0!.left - tol * 3) {
          span.columnIndex = 0;
        } else if (box.left >= col1!.left - tol && box.right <= col1!.right + tol * 3) {
          span.columnIndex = 1;
        }
      }
    }
  }

  for (const span of spans) {
    if (!span.layoutZone) span.layoutZone = "main";
  }

  return pageBands;
}

/** Return true if [start, end) overlaps only non-substantive spans (and whitespace between them). */
export function isRangePurelyNonSubstantive(map: SourceMap, start: number, end: number): boolean {
  if (end <= start) return true;
  const overlapping = map.spans.filter(span => span.end > start && span.start < end);
  if (!overlapping.length) return !map.text.slice(start, end).trim();
  return overlapping.every(span => !isSubstantiveZone(span.layoutZone));
}

/**
 * Trim leading and trailing non-substantive spans (margin notes, headers, footers, line numbers)
 * from a segment range so provisions end cleanly at actual body text. Returns null if no main-zone
 * span remains inside [start, end).
 */
export function trimRangeToSubstantiveSpans(
  map: SourceMap,
  range: { start: number; end: number },
): { start: number; end: number } | null {
  const overlapping = map.spans.filter(span => span.end > range.start && span.start < range.end);
  if (!overlapping.length) return map.text.slice(range.start, range.end).trim() ? range : null;
  const mainSpans = overlapping.filter(span => isSubstantiveZone(span.layoutZone));
  if (!mainSpans.length) return null;

  const firstMain = mainSpans[0]!;
  const lastMain = mainSpans[mainSpans.length - 1]!;
  let start = range.start;
  let end = range.end;
  let trimmedStart = false;
  let trimmedEnd = false;

  if (firstMain.start > start &&
      overlapping.filter(s => s.start < firstMain.start).every(s => s === firstMain || !isSubstantiveZone(s.layoutZone))) {
    start = firstMain.start;
    trimmedStart = true;
  }
  if (lastMain.end < end &&
      overlapping.filter(s => s.end > lastMain.end).every(s => s === lastMain || !isSubstantiveZone(s.layoutZone))) {
    end = lastMain.end;
    trimmedEnd = true;
  }

  if (trimmedStart) {
    while (start < end && /\s/u.test(map.text[start]!)) start++;
  }
  if (trimmedEnd) {
    while (end > start && /\s/u.test(map.text[end - 1]!)) end--;
  }
  return end > start ? { start, end } : null;
}

/** Attach outer-margin side notes as optional metadata onto the nearest top-level provision on the same page. */
export function attachMarginalNotes<
  T extends {
    id: string;
    kind: string;
    start: number;
    end: number;
    sourceSpans: Array<{ itemRef: string; physicalPage: number | null; start: number; end: number }>;
    marginalNotes?: string[];
  },
>(map: SourceMap, provisions: T[]): void {
  const marginSpans = map.spans.filter(span => span.layoutZone === "margin_note" && span.page !== null);
  if (!marginSpans.length || !provisions.length) return;

  const pageByNo = new Map(map.pages.map(page => [page.physicalPage, page]));
  const spanByRef = new Map<string, SourceSpan>();
  for (const span of map.spans) {
    if (!spanByRef.has(span.itemRef)) spanByRef.set(span.itemRef, span);
  }

  const topLevel = provisions.filter(p => ["section", "article", "rule"].includes(p.kind));
  const candidates = topLevel.length ? topLevel : provisions;

  for (const marginSpan of marginSpans) {
    const noteText = map.text.slice(marginSpan.start, marginSpan.end).replace(/\s+/gu, " ").trim();
    if (!noteText) continue;
    const pageNo = marginSpan.page!;
    const pageInfo = pageByNo.get(pageNo);
    const marginBox = normalizeSpanBox(marginSpan, pageInfo);
    const marginMidY = marginBox ? (marginBox.top + marginBox.bottom) / 2 : null;

    const onPage = candidates.filter(prov => prov.sourceSpans.some(loc => loc.physicalPage === pageNo));
    if (!onPage.length) continue;

    let best: T | null = null;
    let bestDistance = Infinity;

    for (const prov of onPage) {
      const firstLocOnPage = prov.sourceSpans.find(loc => loc.physicalPage === pageNo);
      const anchorSpan = firstLocOnPage ? spanByRef.get(firstLocOnPage.itemRef) : undefined;
      const anchorBox = anchorSpan ? normalizeSpanBox(anchorSpan, pageInfo) : null;
      if (marginMidY !== null && anchorBox) {
        const anchorMidY = (anchorBox.top + anchorBox.bottom) / 2;
        const dist = Math.abs(marginMidY - anchorMidY);
        if (dist < bestDistance) {
          bestDistance = dist;
          best = prov;
        }
      } else if (!best) {
        best = prov;
      }
    }

    if (best) {
      const existing = best.marginalNotes ?? [];
      if (!existing.includes(noteText)) {
        best.marginalNotes = [...existing, noteText];
      }
    }
  }
}
