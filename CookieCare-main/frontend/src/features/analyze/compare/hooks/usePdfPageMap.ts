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
 * Parse the clause-identifying marker out of clause.title.
 *
 * Titles produced by structure-extract.ts look like "2.3. Sub-processors",
 * "5. Personal Data Breach", "Section 7 – Governing Law" or "(a) Definitions".
 * We only need the leading identifier — the string that appears verbatim as a
 * heading item in the rendered PDF — so we return just the numeric or
 * lettered label, without trailing dots or body text.
 *
 * Returns null when the clause has no recognisable marker (preamble segments,
 * paragraph-fallback chunks). Callers must handle that path without an anchor.
 */
function extractClauseMarker(title: string | undefined | null): string | null {
  if (!title) return null;
  const trimmed = title.trim();
  const numeric = trimmed.match(/^(\d+(?:\.\d+)*)/);
  if (numeric) return numeric[1];
  const keyword = trimmed.match(
    /^(?:Section|Clause|Article|Paragraph|Schedule|Annex|Art)\.?\s+(\d+(?:\.\d+)*)/i
  );
  if (keyword) return keyword[1];
  const letter = trimmed.match(/^\(([A-Za-z])\)/);
  if (letter) return `(${letter[1]})`;
  return null;
}

/**
 * Locate the pdfjs text item on a page whose string is the clause's heading
 * marker (e.g. "2.3", "2.3.", or an item that begins with "2.3 Sub-processors"
 * / "2.3.Sub-processors"). Used as a spatial anchor for highlight clipping.
 *
 * The match is deliberately strict so that a body reference like
 * "…see clause 2.3…" or a deeper marker "2.3.1" never wins over the real
 * heading. First-in-reading-order match wins.
 */
function findMarkerAnchor(
  pageItems: PdfTextItem[],
  marker: string
): PdfTextItem | null {
  const dotMarker = `${marker}.`;
  for (const item of pageItems) {
    const s = item.str.trim();
    if (!s) continue;
    if (s === marker || s === dotMarker) return item;
    if (s.startsWith(marker + " ") || s.startsWith(dotMarker + " ")) return item;
    // pdfjs sometimes concatenates the marker with the heading word into a
    // single item: "2.3.Sub-processors" — accept, but reject a deeper marker
    // like "2.3.1" (the char after "2.3." is a digit).
    if (
      s.startsWith(dotMarker) &&
      !/^\d/.test(s.charAt(dotMarker.length))
    ) {
      return item;
    }
  }
  return null;
}

/**
 * Does a pdfjs item's trimmed string look like a standalone clause-heading
 * marker? Used to detect the *next* clause boundary below the anchor when
 * clipping highlight items to the current clause's y-range.
 *
 * We accept "2", "2.", "2.3", "2.3.", "5.1.2", "5.1.2." — anything that is
 * only digits and dots. This intentionally treats sub-clause markers as
 * boundaries too, because backend segmentation emits each numeric label as
 * its own clause (2.3 does not include 2.3.1's body).
 */
function looksLikeClauseMarker(str: string): boolean {
  const s = str.trim();
  return /^\d+(?:\.\d+)*\.?$/.test(s);
}

/**
 * Split items into vertically contiguous groups. Consecutive items whose y
 * difference exceeds `gapMultiplier * medianLineHeight` start a new cluster.
 * Preserves reading order within each cluster.
 *
 * Used by the spatial-coherence step to detect when the content filter has
 * picked up items from more than one visual block on the same page (e.g.
 * items from clause 2.2 above and clause 2.3 below, split by a paragraph
 * gap that exceeds a typical line-height).
 */
function clusterByYGaps(
  items: PdfTextItem[],
  gapMultiplier: number
): PdfTextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const heights = sorted.map((it) => it.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 12;
  const threshold = medianH * gapMultiplier;
  const clusters: PdfTextItem[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y > threshold) {
      clusters.push([sorted[i]]);
    } else {
      clusters[clusters.length - 1].push(sorted[i]);
    }
  }
  return clusters;
}

/**
 * Given a clause and a PdfPageMap, return the text items that visually
 * represent the clause text on the page.  These are used to compute the
 * highlight overlay bounding boxes in PdfDocumentPane.
 *
 * ── Why the previous strategy still bled into neighbouring clauses ──────────
 * Content-based filtering (an item's string is a substring of clause.text) is
 * drift-immune, but two consecutive clauses on the same page routinely share
 * common tokens ("processor", "controller", "agreement", "termination"), and
 * the fixed medianH * 8 spatial-coherence window is wide enough to accept
 * everything above and below the median. The text-search fallback then used
 * fullText.indexOf(needle) with no starting offset, so if the same needle
 * appeared earlier in the document it snapped one clause — or one whole page —
 * too early. Result: selecting 2.3 could visibly highlight 2.2.
 *
 * ── Strategy now ────────────────────────────────────────────────────────────
 *   1. Resolve the clause's page via resolveClausePage(). This trusts the
 *      backend-provided clause.pageNumber first (already the case) and only
 *      falls back to the char-offset binary search when pageNumber is missing.
 *
 *   2. Anchor by clause title marker. If clause.title yields a numeric marker
 *      like "2.3", locate that marker as an item on the resolved page and
 *      keep only content-matched items whose y sits at or below the anchor
 *      and strictly above the NEXT numeric-marker item on the same page. This
 *      is what prevents 2.2's items from ever entering 2.3's highlight, and
 *      vice-versa — even when both clauses share vocabulary.
 *
 *   3. Cluster-gap spatial coherence. Split the remaining items into y-
 *      clusters separated by paragraph-sized gaps (2.5 × median line height).
 *      When more than one cluster survives, keep the one closest to the
 *      anchor (or the largest, if there is no anchor). This is stricter than
 *      the previous fixed-window filter for short clauses and safer than it
 *      was for long multi-paragraph clauses (which now form one legitimate
 *      cluster instead of being pruned to a random subset).
 *
 *   4. If the primary page yields nothing, try page+1 (clause may start at
 *      the very bottom of a page and continue onto the next).
 *
 *   5. If everything above returns < 2 items, fall back to a text-search
 *      anchored at the resolved page's offset (never the beginning of the
 *      document), then include only items whose charOffset lies strictly
 *      within [correctedStart, correctedEnd). Restricting the search
 *      starting position to the resolved page is what prevents an earlier
 *      occurrence of the same needle on a different page from becoming a
 *      wrong-clause highlight.
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

  // ── Step 1b: anchor by clause marker (title-based y-range clipping) ──────
  // The strongest safeguard against a neighbouring clause on the same page
  // leaking into the highlight. When the clause has a recognisable heading
  // marker ("2.3", "Section 5", "(a)") and we can locate it on the resolved
  // page, clip content-matched items to the strip between that marker and
  // the next clause-heading marker on the same page.
  const marker = extractClauseMarker(clause.title);
  const anchor =
    primaryPage && marker ? findMarkerAnchor(primaryPage.textItems, marker) : null;

  if (anchor && primaryPage && items.length > 0) {
    // Lower bound: reject items above the anchor — those belong to a preceding
    // clause on the same page. Upper bound is decided by a vertical-gap walk
    // over ALL content-matched items on the page (below), not by trying to
    // guess where the next clause-marker item lives. String-based marker
    // detection is inherently fragile: a body-text version number ("TLS 1.3")
    // and a genuine clause marker ("1.3") are string-identical, so any
    // heuristic that promotes strings to boundaries can wrongly cut clause
    // content in half. A y-gap boundary depends only on visual layout and
    // cannot be spoofed by body-text digits.
    const yEps = Math.max(anchor.height * 0.5, 2);
    const below = items
      .filter((it) => it.y >= anchor.y - yEps)
      .sort((a, b) => a.y - b.y);

    if (below.length <= 1) {
      items = below;
    } else {
      // Median line-height across body items (exclude the heading, which has
      // a larger font, from the median so intra-body line spacing isn't
      // inflated).
      const bodyHeights = below
        .slice(1)
        .map((it) => it.height)
        .sort((a, b) => a - b);
      const medianH =
        bodyHeights.length > 0
          ? bodyHeights[Math.floor(bodyHeights.length / 2)] || 12
          : below[0].height || 12;
      // A paragraph break between two clauses is typically ≥ 2× body line-
      // height. Intra-clause line spacing sits below that. Use 2× so tight
      // paragraph structure inside a single clause survives.
      const gapCutoff = medianH * 2;
      let end = below.length;
      for (let i = 1; i < below.length; i++) {
        if (below[i].y - below[i - 1].y > gapCutoff) {
          end = i;
          break;
        }
      }
      items = below.slice(0, end);
    }
  }

  // ── Step 2: try page+1 if primary returned nothing ────────────────────────
  // Clause starts at page bottom; body is mostly on the next page.
  if (items.length === 0 && pageNum < map.numPages) {
    const nextPage = map.pages[pageNum];
    if (nextPage) items = contentFilter(nextPage.textItems);
  }

  // ── Step 2b: cluster-gap spatial coherence — ONLY when no anchor ─────────
  // When we have a marker anchor, Step 1b's y-range clip is already precise:
  // the surviving items are all strictly between this clause's marker and the
  // next clause's marker. Applying cluster-gap on top of that can wrongly
  // split heading from body (heading font is often larger, so the gap between
  // the heading line and the first body line can exceed 2.5 × body line-
  // height) and drop the body. So we only run cluster-gap in the no-anchor
  // path — preamble segments, paragraph-fallback chunks — where the y-range
  // hasn't been constrained yet. Keep the largest cluster in that case.
  if (!anchor && items.length >= 3) {
    const clusters = clusterByYGaps(items, 2.5);
    if (clusters.length > 1) {
      let best = clusters[0];
      for (const c of clusters) {
        if (c.length > best.length) best = c;
      }
      items = best;
    }
  }

  // ── Step 3: tight charOffset fallback, anchored to the resolved page ─────
  // Content matching returned nothing usable (very short clause, or pdfjs
  // returned a single ligature item that doesn't substring-match). Search
  // clause.text into map.fullText, but STARTING FROM the resolved page's
  // offset — never from position 0 — so an earlier occurrence of the same
  // opening phrase on an earlier page cannot become a wrong-clause highlight.
  // A small back-off (200 chars) tolerates minor whitespace/reconstruction
  // drift between backend text and pdfjs fullText at the page boundary.
  //
  // charOffset is a cumulative, document-global offset (see cumOffset in the
  // usePdfPageMap hook below). Once correctedStart is known we still search
  // every page's items so a long clause whose changed tail spills onto the
  // next page can still be found.
  if (items.length < 2) {
    const needle = clause.text.slice(0, 80).trim();
    if (needle.length >= 10) {
      const pageStart =
        pageNum >= 1 && pageNum <= map.pageStarts.length
          ? map.pageStarts[pageNum - 1]
          : 0;
      const searchFrom = Math.max(0, pageStart - 200);
      const correctedStart = map.fullText
        .toLowerCase()
        .indexOf(needle.toLowerCase(), searchFrom);
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
