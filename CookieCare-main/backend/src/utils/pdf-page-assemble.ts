/**
 * Structure-aware reconstruction of one PDF page's text items.
 *
 * Separates left-margin numeric markers from body text, assigns body to
 * markers using a small same-line window (not a large global Y tolerance),
 * then repairs ownership with structural/content signals:
 *
 *   Pattern C — re-saved PDFs: clause-opening sentence sits slightly above
 *               its marker; steal that opening when the next block starts
 *               as a lowercase continuation.
 *   Pattern A — sentence-continuation bleed: a numeric marker appears in
 *               the middle of an incomplete sentence; demote the marker
 *               and keep the text in the previous clause.
 *   Pattern B — footer / standalone numeric fragments are not emitted as
 *               empty clauses.
 *
 * Deterministic. No LLM. Coordinate distance is only a local window around
 * content-triggered repairs, never the sole assignment rule.
 */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  hasEOL?: boolean;
}

/** Pure numeric clause marker: "1."  "1.1"  "3.6."  "10.3." */
export const MARKER_ONLY_RE = /^\d+(?:\.\d+)*\s*[.)]\s*$/;

/**
 * Left-margin cutoff (PDF points). Body-embedded numbers sit further right.
 */
export const MARKER_MARGIN_MAX_X = 90;

/** Items within this Y gap are treated as the same visual line. */
export const SAME_LINE_Y_TOLERANCE = 4;

/**
 * Same-line / inline window. Used for (a) initial assignment of body that
 * shares a line with its marker, including slight re-save Y jitter, and
 * (b) whether a marker and first body item are inlined in the output.
 *
 * This is NOT a multi-line global capture radius.
 */
export const INLINE_Y_TOLERANCE = 12;

const FOOTER_MAX_Y = 55;
const PAGE_NUM_RE = /^\d{1,3}$/;
const HUNGRY_BODY_CHARS = 40;
const CLAUSE_OPEN_RE =
  /^(The|This|If|Each|Where|When|For|In|Any|No|Not|Subject|Notwithstanding|A|An)\b/;

function looksLikeClauseOpening(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (CLAUSE_OPEN_RE.test(t)) return true;
  return t.length > 40 && /^[A-Z(]/.test(t);
}

function looksLikeTerminalFragment(s: string): boolean {
  const t = s.trim();
  if (!COMPLETE_RE.test(t)) return false;
  if (looksLikeClauseOpening(t)) return false;
  return t.split(/\s+/).filter(Boolean).length <= 4;
}

function isHungryMarker(marker: PdfTextItem, block: PdfTextItem[]): boolean {
  if (block.length === 0) return true;
  const first = block[0].str;
  if (startsLowercase(first)) return true;
  if (looksLikeClauseOpening(first)) return false;
  if (looksLikeTerminalFragment(first)) return true;
  const sameLine = Math.abs(block[0].y - marker.y) <= INLINE_Y_TOLERANCE;
  if (sameLine && startsClauseLike(first)) return false;
  return blockText(block).length < HUNGRY_BODY_CHARS;
}
const COMPLETE_RE = /[.!?:;]$/;
const LIST_INTRO_RE = /[:;]$/;

export function isStructuralMarker(item: PdfTextItem, marginMaxX = MARKER_MARGIN_MAX_X): boolean {
  return item.x <= marginMaxX && MARKER_ONLY_RE.test(item.str.trim());
}

/**
 * Left-column cutoff for this page: leftmost pure numeric label plus one
 * indent. Avoids a single global 90pt that misses re-saved PDFs whose
 * margin shifted, without treating body-embedded numbers as headings.
 */
function markerMarginForPage(items: PdfTextItem[]): number {
  const xs = items
    .filter((i) => MARKER_ONLY_RE.test(i.str.trim()))
    .map((i) => i.x)
    .sort((a, b) => a - b);
  if (xs.length === 0) return MARKER_MARGIN_MAX_X;
  if (xs[0] > 110) return MARKER_MARGIN_MAX_X;
  return xs[0] + 40;
}

function isFooterPageNumber(item: PdfTextItem): boolean {
  const t = item.str.trim();
  return item.y <= FOOTER_MAX_Y && PAGE_NUM_RE.test(t);
}

function startsLowercase(s: string): boolean {
  return /^[a-z]/.test(s.trim());
}

/** Mid-sentence leftover glued onto the next marker ("Name's behalf, Supplier shall:"). */
function isDisplacedWrapOpening(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (CLAUSE_OPEN_RE.test(t)) return false;
  if (/[.!?]$/.test(t) && !LIST_INTRO_RE.test(t)) return false;
  const head = t.split(/[.!?]/)[0] ?? t;
  if (!head.includes(",")) return false;
  return head.split(/\s+/).filter(Boolean).length > 3;
}

function startsClauseLike(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && /^[A-Z(]/.test(t);
}

function isIncomplete(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && !COMPLETE_RE.test(t);
}

function previousAllowsNewNumericHeading(text: string): boolean {
  const prev = text.trim();
  if (!prev) return true;
  if (LIST_INTRO_RE.test(prev)) return true;
  if (/[.!?]$/.test(prev)) return true;
  const body = prev.replace(/^\d+(?:\.\d+)*\s*[.)]\s*/, "").trim();
  const words = body.split(/\s+/).filter(Boolean);
  const hasFiniteVerb =
    /\b(shall|must|will|may|agrees|ensures|means|includes)\b/i.test(body);
  if (words.length <= 8 && !hasFiniteVerb) return true;
  if (/\b(the|a|an|that|which|of|to|and|or|for|with|by|as)\s*$/i.test(body)) {
    return false;
  }
  return !hasFiniteVerb;
}

function blockText(items: PdfTextItem[]): string {
  return items
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Typical inter-line gap on this page, ignoring section-sized jumps.
 */
export function medianLineHeight(items: PdfTextItem[]): number {
  const ys = [...new Set(items.map((i) => Math.round(i.y * 2) / 2))].sort(
    (a, b) => b - a
  );
  if (ys.length < 2) return 12;
  const gaps: number[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const g = ys[i] - ys[i + 1];
    if (g >= 5 && g <= 40) gaps.push(g);
  }
  if (gaps.length === 0) return 12;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function spatialWindow(median: number): number {
  return 2 * median + INLINE_Y_TOLERANCE;
}

function nearMarker(itemY: number, markerY: number, median: number): boolean {
  return Math.abs(itemY - markerY) <= spatialWindow(median);
}

export function sortItems(items: PdfTextItem[]): PdfTextItem[] {
  return [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > SAME_LINE_Y_TOLERANCE) return yDiff;
    return a.x - b.x;
  });
}

export function assembleItemBlock(items: PdfTextItem[]): string {
  if (items.length === 0) return "";
  let result = "";
  for (let k = 0; k < items.length; k++) {
    const cur = items[k];
    const prev = k > 0 ? items[k - 1] : null;
    if (prev === null) {
      result += cur.str;
      continue;
    }
    const yDiff = Math.abs(prev.y - cur.y);
    if (yDiff >= 5 || prev.hasEOL === true) {
      result += "\n" + cur.str;
    } else {
      const gap = cur.x - (prev.x + prev.width);
      result += (gap > 1 ? " " : "") + cur.str;
    }
  }
  return result;
}

export function assembleSorted(items: PdfTextItem[]): string {
  return assembleItemBlock(sortItems(items));
}

/**
 * Trailing run of the previous block that looks like the *next* clause's
 * opening sentence (capital start, incomplete, not the previous clause's
 * own first line).
 */
function takeTrailingOpening(
  prevItems: PdfTextItem[],
  destMarkerY: number,
  median: number
): { keep: PdfTextItem[]; steal: PdfTextItem[] } {
  if (prevItems.length < 2) {
    return { keep: prevItems, steal: [] };
  }

  let lastOpen = -1;
  for (let i = 0; i < prevItems.length; i++) {
    if (startsClauseLike(prevItems[i].str)) lastOpen = i;
  }
  // Index 0 is the previous clause's own opening — never steal the whole block.
  if (lastOpen <= 0) return { keep: prevItems, steal: [] };

  const steal = prevItems.slice(lastOpen);
  const stealStr = blockText(steal);
  if (!isIncomplete(stealStr)) return { keep: prevItems, steal: [] };
  if (!nearMarker(steal[0].y, destMarkerY, median)) {
    return { keep: prevItems, steal: [] };
  }

  return { keep: prevItems.slice(0, lastOpen), steal };
}

function firstBodyStr(items: PdfTextItem[]): string {
  return items[0]?.str ?? "";
}

/**
 * Assemble one page: marker-anchored blocks + content-aware ownership repair.
 */
export function assemblePageTwoPass(textItems: PdfTextItem[]): string {
  if (textItems.length === 0) return "";

  const usable = textItems.filter((it) => !isFooterPageNumber(it));

  const markerX = markerMarginForPage(usable);
  const markers: PdfTextItem[] = [];
  const bodyItems: PdfTextItem[] = [];
  for (const item of usable) {
    if (isStructuralMarker(item, markerX)) markers.push(item);
    else bodyItems.push(item);
  }

  if (markers.length === 0) {
    return assembleSorted(usable);
  }

  markers.sort((a, b) => b.y - a.y);
  const median = medianLineHeight(usable);

  // ── Initial assignment: marker above, or same visual line (4pt) only ──
  const preambleItems: PdfTextItem[] = [];
  const blocks: PdfTextItem[][] = markers.map(() => []);

  for (const item of bodyItems) {
    const threshold = item.y - SAME_LINE_Y_TOLERANCE;
    let candidate = -1;
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].y >= threshold) candidate = i;
      else break;
    }
    if (candidate === -1) preambleItems.push(item);
    else blocks[candidate].push(item);
  }

  for (let i = 0; i < blocks.length; i++) {
    blocks[i] = sortItems(blocks[i]);
  }
  let preamble = sortItems(preambleItems);

  // ── Pattern C: hungry marker takes items spatially nearer to it ─────────
  // Used when a re-save leaves a marker with little/no body. Distance is
  // compared to the previous marker with a half-line margin so the last
  // line of a well-fed previous clause is not stolen.
  for (let i = 1; i < markers.length; i++) {
    if (!isHungryMarker(markers[i], blocks[i])) continue;
    const prevY = markers[i - 1].y;
    const curY = markers[i].y;
    const margin = median * 0.5;
    const stay: PdfTextItem[] = [];
    const move: PdfTextItem[] = [];
    for (const it of blocks[i - 1]) {
      const dCur = Math.abs(it.y - curY);
      const dPrev = Math.abs(it.y - prevY);
      if (dCur + margin < dPrev) move.push(it);
      else stay.push(it);
    }
    if (stay.length === 0 || move.length === 0) continue;
    blocks[i - 1] = stay;
    blocks[i] = sortItems([...move, ...blocks[i]]);
  }

  // ── Pattern C: steal a displaced clause-opening from the previous block ─
  for (let i = 1; i < markers.length; i++) {
    const needsOpening =
      startsLowercase(firstBodyStr(blocks[i])) ||
      isHungryMarker(markers[i], blocks[i]);
    if (!needsOpening) continue;

    const { keep, steal } = takeTrailingOpening(
      blocks[i - 1],
      markers[i].y,
      median
    );
    if (steal.length === 0) continue;
    blocks[i - 1] = keep;
    blocks[i] = sortItems([...steal, ...blocks[i]]);
  }

  // ── Pattern C (first marker): nearby preamble that is really clause body ─
  if (preamble.length > 0 && markers.length > 0) {
    const curFirst = firstBodyStr(blocks[0]);
    const hungry = isHungryMarker(markers[0], blocks[0]);
    const bodyStartsAsContinuation = startsLowercase(curFirst);
    const empty = blocks[0].length === 0;

    const attachable = preamble.filter((it) => {
      if (!nearMarker(it.y, markers[0].y, median)) return false;
      if (bodyStartsAsContinuation || empty) return true;
      if (hungry && startsLowercase(it.str)) return true;
      if (Math.abs(it.y - markers[0].y) <= INLINE_Y_TOLERANCE) return true;
      return false;
    });
    if (attachable.length > 0) {
      const attachSet = new Set(attachable);
      preamble = preamble.filter((it) => !attachSet.has(it));
      blocks[0] = sortItems([...attachable, ...blocks[0]]);
    }
  }

  // ── Pattern A: demote a marker that does not own a real clause opening ──
  // A lowercase first body is wrap/bleed, not a new clause — except after a
  // list intro (":"/";"), where nested items may start lowercase.
  const keepMarker = markers.map(() => true);
  for (let i = 1; i < markers.length; i++) {
    if (blocks[i].length === 0) continue;
    const prevStr = blockText(blocks[i - 1]);
    const curFirst = firstBodyStr(blocks[i]);
    if (!prevStr) continue;
    if (LIST_INTRO_RE.test(prevStr)) continue;
    if (startsLowercase(curFirst) || isDisplacedWrapOpening(curFirst)) {
      blocks[i - 1] = sortItems([...blocks[i - 1], ...blocks[i]]);
      blocks[i] = [];
      keepMarker[i] = false;
      continue;
    }
    if (previousAllowsNewNumericHeading(prevStr)) continue;
    if (looksLikeClauseOpening(curFirst)) continue;
    const continuation =
      /^[A-Z][A-Za-z'’]*,/.test(curFirst.trim()) ||
      curFirst.trim().split(/\s+/).filter(Boolean).length >= 8;
    if (!continuation) continue;

    blocks[i - 1] = sortItems([...blocks[i - 1], ...blocks[i]]);
    blocks[i] = [];
    keepMarker[i] = false;
  }

  // ── Assembly ───────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (preamble.length > 0) {
    parts.push(assembleSorted(preamble));
  }

  for (let i = 0; i < markers.length; i++) {
    if (!keepMarker[i] && blocks[i].length === 0) continue;

    const marker = markers[i];
    const sortedBlock = blocks[i];

    // Pattern B: empty numeric marker with no body is an extraction stub.
    if (sortedBlock.length === 0) continue;

    // Always bind the marker to the first owned body line so the segmenter
    // sees a titled heading ("6.3. The Supplier…") rather than a bare "6.3."
    // whose title Jaccard then fails against the other PDF's inlined heading.
    const inlined: PdfTextItem = {
      ...sortedBlock[0],
      str: marker.str.trim() + " " + sortedBlock[0].str,
    };
    parts.push(assembleItemBlock([inlined, ...sortedBlock.slice(1)]));
  }

  return parts.join("\n");
}
