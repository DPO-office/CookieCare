/**
 * usePdfPageMap
 *
 * Loads a PDF File in the browser via pdfjs-dist and builds a mapping from
 * each page's text content to canvas coordinates.  The result is used by
 * PdfDocumentPane to position highlight overlays over the correct words.
 *
 * The mapping is computed once per File and cached — it does NOT recompute
 * when the selected finding changes.
 *
 * Exported types are used by PdfDocumentPane to accept and render highlights.
 */

import { useState, useEffect, useRef } from "react";
import type { CompareClauseRecord } from "../../../randtrustAI/types";

// ─── pdfjs-dist lazy import ───────────────────────────────────────────────────
// We import dynamically so the heavy pdfjs bundle is only loaded when a PDF
// comparison is actually opened.
//
// The worker is imported as a URL via Vite's `?url` suffix — this guarantees
// the worker file served to the browser comes from the EXACT SAME installed
// pdfjs-dist package as the API, eliminating the version mismatch error.
// Using a CDN URL risks version drift whenever npm resolves a newer release.

import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  }
  return pdfjs;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single positioned text item on a page — mirrors pdfjs TextItem */
export interface PdfTextItem {
  str: string;
  /** x coordinate in PDF user-space units */
  x: number;
  /** y coordinate in PDF user-space units (bottom-up) */
  y: number;
  width: number;
  height: number;
  /** Which page (1-indexed) this item is on */
  pageNumber: number;
  /** Cumulative char offset of this item's start in the full document text */
  charOffset: number;
}

/** Per-page viewport dimensions at scale=1 */
export interface PdfPageInfo {
  pageNumber: number;
  /** Width in CSS pixels at scale 1.0 */
  width: number;
  /** Height in CSS pixels at scale 1.0 */
  height: number;
  /** All text items on this page with position data */
  textItems: PdfTextItem[];
}

/** The complete mapping for one PDF document */
export interface PdfPageMap {
  numPages: number;
  pages: PdfPageInfo[];
  /** Flat document text (joined from all pages) */
  fullText: string;
  /**
   * Array of cumulative char offsets where each page starts in fullText.
   * pageStarts[0] === 0 always.  Length === numPages.
   */
  pageStarts: number[];
}

export type PdfPageMapStatus = "idle" | "loading" | "ready" | "error";

export interface UsePdfPageMapResult {
  map: PdfPageMap | null;
  status: PdfPageMapStatus;
  error: string | null;
}

// ─── Clause → page resolution ────────────────────────────────────────────────

/**
 * Given a clause record and a PdfPageMap, return the best page number to
 * navigate to.
 *
 * Resolution order:
 *  1. Backend-provided clause.pageNumber (most reliable — set by Phase 2b)
 *  2. Client-side: binary-search pageStarts using clause.position char offset
 *  3. Fallback: page 1
 */
export function resolveClausePage(
  clause: CompareClauseRecord | undefined | null,
  map: PdfPageMap | null
): number {
  if (!clause) return 1;

  // Phase 2b: backend already resolved the page
  if (typeof clause.pageNumber === "number" && clause.pageNumber >= 1) {
    return clause.pageNumber;
  }

  // Client-side fallback: use char position
  if (
    map &&
    typeof clause.position === "number" &&
    map.pageStarts.length > 0
  ) {
    const pos = clause.position;
    let lo = 0;
    let hi = map.pageStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (map.pageStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-indexed
  }

  return 1;
}

// ─── Content-based item matching ─────────────────────────────────────────────

/**
 * Normalise a raw PDF text item string for content matching:
 *   - lowercase
 *   - collapse all whitespace to single space
 *   - strip surrounding punctuation that pdfjs often attaches to a token
 *     (e.g. trailing period, comma, opening parenthesis)
 *
 * Used to test whether a text item's string is genuinely present inside the
 * clause text — making item selection independent of charOffset drift.
 */
function normStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?()\-–—"'']+|[\s.,;:!?()\-–—"'']+$/g, "")
    .trim();
}

/**
 * Build a Set of normalised tokens from the clause text for O(1) lookup.
 * Splits on whitespace so multi-word pdfjs items can also be matched via
 * `clauseNorm.includes(itemNorm)` (handled separately for longer items).
 */
function buildClauseTokens(clauseText: string): { normText: string; tokens: Set<string> } {
  const normText = clauseText.toLowerCase().replace(/\s+/g, " ");
  const tokens = new Set<string>();
  for (const word of normText.split(" ")) {
    const t = normStr(word);
    if (t.length >= 3) tokens.add(t); // skip very short tokens (articles, etc.)
  }
  return { normText, tokens };
}

/**
 * Return true when a PDF text item's string belongs to the given clause text.
 *
 * Two acceptance criteria (either is sufficient):
 *   A. The item's normalised string is a substring of the clause's normalised text.
 *      Handles multi-word pdfjs items ("The Supplier shall") and single words.
 *   B. The item's normalised string is in the pre-built token set.
 *      Fast O(1) check for common single-word items.
 *
 * Rejection criteria applied first:
 *   - Empty or whitespace-only strings.
 *   - Very short strings (≤2 chars) — noise, page numbers, single letters.
 *   - Pure numeric strings — page numbers, section markers not in clause body.
 *     Exception: if the clause text itself contains that number as a word, allow.
 */
function itemBelongsToClause(
  itemStr: string,
  normClauseText: string,
  clauseTokens: Set<string>
): boolean {
  const raw = itemStr.trim();
  if (!raw || raw.length <= 2) return false;

  // Pure numeric — could be a page number or a stray marker.
  // Only accept if the exact number string appears in the clause text.
  if (/^\d+\.?$/.test(raw)) {
    return normClauseText.includes(raw.toLowerCase());
  }

  const norm = normStr(raw);
  if (!norm || norm.length <= 2) return false;

  // Criterion A: substring match (works for multi-word pdfjs items too)
  if (normClauseText.includes(norm)) return true;

  // Criterion B: token set lookup (fast path for single words already split)
  if (clauseTokens.has(norm)) return true;

  return false;
}

/**
 * Given a clause and a PdfPageMap, return the text items that visually
 * represent the clause text on the page.  These are used to compute the
 * highlight overlay bounding boxes in PdfDocumentPane.
 *
 * ── Why the old charOffset approach failed ──────────────────────────────────
 * The backend assembles page text via assemblePageTwoPass() (which merges
 * marker + body items into joined strings and uses "\n" between visual lines)
 * while the frontend counts each raw pdfjs item individually with "+1 for
 * space". Additionally, stitchCrossPageMarkers() moves content between pages,
 * shifting all subsequent backend offsets. By page 5 the accumulated drift can
 * exceed 100+ chars, so the ±tolerance window was widened to compensate — but
 * a wider window also includes text items from the preceding and following
 * clauses, producing the visible "sentence above and below gets highlighted"
 * artefact.
 *
 * ── New strategy: content-based item selection ───────────────────────────────
 *   1. Resolve the clause's page via resolveClausePage() — this is unchanged
 *      and reliable because clause.pageNumber comes from the backend's own
 *      resolvePageNumber() over the same pdfjs-extracted text.
 *
 *   2. Filter all text items on that page by checking whether their string
 *      actually appears inside clause.text (case/whitespace normalised).
 *      This is drift-immune: it does not depend on charOffset at all.
 *
 *   3. If content matching returns fewer than 2 items (possible for very short
 *      clauses or clauses where pdfjs splits text differently), fall back to a
 *      charOffset window anchored on the text-search corrected offset with
 *      zero outward tolerance — tight enough to avoid bleed.
 *
 *   4. If the primary page still yields nothing, try page+1 (clause may start
 *      at the very bottom of a page and most of its text is on the next page).
 *
 * All other behaviour — page navigation, coordinate calculation, highlight
 * colors, active/passive distinction — is unchanged.
 */
export function resolveClauseTextItems(
  clause: CompareClauseRecord | undefined | null,
  map: PdfPageMap | null
): PdfTextItem[] {
  if (!clause || !map || !clause.text) return [];

  const pageNum = resolveClausePage(clause, map);

  // ── Step 1: content-based filter on the resolved page ────────────────────
  const { normText: normClauseText, tokens: clauseTokens } =
    buildClauseTokens(clause.text);

  function contentFilter(items: PdfTextItem[]): PdfTextItem[] {
    return items.filter((item) =>
      itemBelongsToClause(item.str, normClauseText, clauseTokens)
    );
  }

  const primaryPage = map.pages[pageNum - 1];
  let items: PdfTextItem[] = primaryPage
    ? contentFilter(primaryPage.textItems)
    : [];

  // ── Step 2: try page+1 if primary returned nothing ────────────────────────
  // Clause starts at page bottom; body is mostly on the next page.
  if (items.length === 0 && pageNum < map.numPages) {
    const nextPage = map.pages[pageNum];
    if (nextPage) items = contentFilter(nextPage.textItems);
  }

  // ── Step 2b: spatial coherence — remove isolated outlier items ────────────
  // Content matching is immune to charOffset drift but can pick up items from
  // a different clause on the same page that happen to share words (e.g.
  // "agreement", "termination") with the target clause. These outliers are
  // visually far from the main cluster of matching items. We remove any item
  // whose y-coordinate lies more than N line-heights away from the cluster's
  // median y, unless fewer than 4 items were found (short clause — keep
  // everything to avoid dropping legitimate content).
  if (items.length >= 4) {
    const ys = items.map((it) => it.y).sort((a, b) => a - b);
    const midIdx = Math.floor(ys.length / 2);
    const medianY = ys[midIdx];
    // Typical line height for the majority of items in the cluster
    const heights = items.map((it) => it.height);
    heights.sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] || 12;
    // Spread scales with how many items actually matched: a fixed 8-line
    // window is generous for a short clause but silently prunes most (or
    // all) of a genuinely long, multi-paragraph clause — e.g. Sub-processors
    // or Personal Data Breach, which legitimately span 20+ lines — down to a
    // near-empty set. Keep the original tight 8-line floor for short clauses
    // (where a stray same-page word match is the real risk) and widen it
    // proportionally to the matched item count for longer ones.
    const spread = medianH * Math.max(8, Math.ceil(items.length / 2));
    items = items.filter(
      (it) => Math.abs(it.y - medianY) <= spread
    );
  }

  // ── Step 3: tight charOffset fallback ────────────────────────────────────
  // Content matching found nothing (e.g. very short clause, or pdfjs returned
  // a single ligature item that doesn't substring-match). Use text-search to
  // find the corrected start offset and filter with zero outward tolerance so
  // we never bleed into a neighbouring clause.
  //
  // charOffset is a cumulative, document-global offset (see cumOffset in the
  // usePdfPageMap hook below) — it is NOT page-relative. Restricting this
  // filter to primaryPage.textItems silently produces zero items whenever the
  // corrected offset actually falls on a different page than the one
  // resolveClausePage picked (e.g. a long clause whose changed tail — the
  // part that actually needs a highlight — spills onto the next page). Search
  // every page's items so the fallback can find the clause wherever it
  // actually is, instead of silently showing no highlight.
  if (items.length < 2) {
    const needle = clause.text.slice(0, 80).trim();
    if (needle.length >= 10) {
      const correctedStart = map.fullText.toLowerCase().indexOf(needle.toLowerCase());
      if (correctedStart !== -1) {
        const correctedEnd = correctedStart + clause.text.length;
        // Zero outward bleed — only items strictly within the clause range.
        const allItems = map.pages.flatMap((p) => p.textItems);
        const fallbackItems = allItems.filter(
          (item) =>
            item.charOffset >= correctedStart &&
            item.charOffset < correctedEnd
        );
        if (fallbackItems.length >= 1) items = fallbackItems;
      }
    }
  }

  return items;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Loads a PDF File and produces a PdfPageMap.
 * Returns { map, status, error }.
 *
 * The map is stable for the lifetime of the component (cached by file identity).
 * Pass `null` to opt out — returns { map: null, status: "idle" }.
 */
export function usePdfPageMap(file: File | null | undefined): UsePdfPageMapResult {
  const [status, setStatus] = useState<PdfPageMapStatus>("idle");
  const [map, setMap] = useState<PdfPageMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cache key: use file identity (name + size + lastModified)
  const cacheKey = file
    ? `${file.name}::${file.size}::${file.lastModified}`
    : null;
  const cacheRef = useRef<Map<string, PdfPageMap>>(new Map());

  useEffect(() => {
    if (!file || !cacheKey) {
      setStatus("idle");
      setMap(null);
      setError(null);
      return;
    }

    // Return cached result immediately if available
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setMap(cached);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setMap(null);
    setError(null);

    (async () => {
      try {
        const pdfjs = await getPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        const numPages = doc.numPages;
        const pages: PdfPageInfo[] = [];
        const fullTextParts: string[] = [];
        const pageStarts: number[] = [];
        let cumOffset = 0;

        for (let i = 1; i <= numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();

          pageStarts.push(cumOffset);

          const textItems: PdfTextItem[] = [];
          const pageTextParts: string[] = [];

          for (const item of content.items) {
            if (!("str" in item)) continue;
            const str = (item as any).str as string;
            const tx = (item as any).transform as number[];
            // tx = [a, b, c, d, e, f] — e=x, f=y in PDF user-space
            // Convert PDF y (bottom-up) to canvas y (top-down)
            const x = tx[4];
            const pdfY = tx[5];
            const height = Math.abs((item as any).height ?? 12);
            const width = (item as any).width ?? str.length * 6;
            // Convert bottom-up to top-down: canvasY = pageHeight - pdfY - height
            const y = viewport.height - pdfY - height;

            textItems.push({
              str,
              x,
              y,
              width,
              height,
              pageNumber: i,
              charOffset: cumOffset,
            });
            pageTextParts.push(str);
            cumOffset += str.length + 1; // +1 for space separator
          }

          const pageText = pageTextParts.join(" ");
          fullTextParts.push(pageText);

          pages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
            textItems,
          });
        }

        if (cancelled) return;

        const result: PdfPageMap = {
          numPages,
          pages,
          fullText: fullTextParts.join("\n"),
          pageStarts,
        };

        cacheRef.current.set(cacheKey, result);
        setMap(result);
        setStatus("ready");
      } catch (err: any) {
        if (!cancelled) {
          console.error("[usePdfPageMap] Failed to load PDF:", err);
          setError(err?.message ?? "Failed to load PDF document.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey]); // re-run only when the file identity changes

  return { map, status, error };
}
