/**
 * PdfDocumentPane
 *
 * Renders a PDF File as scrollable pages with highlight overlays for
 * changed clauses.  Pages are rendered lazily via IntersectionObserver —
 * only visible pages (plus a 1-page buffer) are drawn to canvas.
 *
 * Architecture:
 *   PdfDocumentPane loads the PDF document ONCE using pdfjs-dist and caches
 *   the PDFDocumentProxy.  Individual PageRenderer components receive a
 *   pre-loaded PDFPageProxy — they never call getDocument() themselves.
 *
 *   This avoids the "Invalid PDF structure" error caused by:
 *     1. Multiple getDocument() calls transferring/neutering the same ArrayBuffer
 *     2. Race conditions between concurrent document load attempts
 */

import {
  useEffect, useRef, useCallback, useState, useMemo,
} from "react";
import { FileText, Loader2, AlertCircle, FileX } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { CompareClauseRecord } from "../../../randtrustAI/types";
import type { PdfPageMap, PdfTextItem } from "../hooks/usePdfPageMap";
import { resolveClausePage, resolveClauseTextItems } from "../hooks/usePdfPageMap";
import { CHANGE_TYPE_STYLE, SELECTED_FINDING_OUTLINE } from "../constants";
import { normalizeToken } from "../utils/diffHighlight";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * PDF_SCALE is no longer a fixed constant — scale is computed dynamically from
 * the scroll-container width so pages always fit without horizontal clipping.
 * This value is kept only as a maximum cap (prevents over-zooming on very wide
 * screens where a larger render would waste memory with no visible benefit).
 */
const PDF_SCALE_MAX = 2.0;
const PDF_SCALE_FALLBACK = 1.2; // used before the container has been measured
const PDF_HORIZONTAL_PADDING = 32; // px — matches px-4 (16px each side) on the scroll div
const RENDER_BUFFER = 1;

// ─── pdfjs loader ─────────────────────────────────────────────────────────────
// Worker imported as a URL from the installed package — API and worker are
// guaranteed to be the same version (no CDN drift).

import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfjsInstance: typeof import("pdfjs-dist") | null = null;

async function getPdfJs() {
  if (pdfjsInstance) return pdfjsInstance;
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  }
  pdfjsInstance = pdfjs;
  return pdfjs;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PdfDocumentPaneProps {
  file: File | null | undefined;
  label: "Original" | "Modified";
  filename: string;
  side: "A" | "B";
  activeClause: CompareClauseRecord | null;
  /** Change classification for the selected finding (drives active highlight color). */
  activeClassification?: string | null;
  /**
   * Normalised word tokens that fall inside the active finding's diff spans
   * for THIS side (removed words for Original, added words for Modified).
   * When present, only these words get the strong highlight — the rest of
   * the clause gets a light context tint. Null/empty → old whole-clause
   * highlight (used for ADDED/REMOVED and single-sided MOVED findings).
   */
  changedWords?: Set<string> | null;
  allChangedClauseIds: Set<string>;
  /** clauseId → change classification, used so highlights encode change type not document side. */
  clauseClassifications?: Map<string, string>;
  allClauses: CompareClauseRecord[];
  pdfMap: PdfPageMap | null;
  mapStatus: "idle" | "loading" | "ready" | "error";
  mapError: string | null;
}

/**
 * Label pill: neutral — Original / Modified identity is communicated through
 * the text label only.  No red/green background tinting on the pane.
 */
const NEUTRAL_PANE_LABEL =
  "bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]";

function changeTypeFill(classification: string | null | undefined, active: boolean): string {
  const style = CHANGE_TYPE_STYLE[classification ?? ""] ?? CHANGE_TYPE_STYLE.NEUTRAL_REPHRASE;
  return active ? style.fill : style.passive;
}

// ─── Highlight helpers ────────────────────────────────────────────────────────

interface HighlightBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  outline?: string;
}

function computeHighlightBoxes(items: PdfTextItem[], scale: number): HighlightBox[] {
  if (!items.length) return [];
  const lines = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const lineY = Math.round(item.y / 4) * 4;
    const arr = lines.get(lineY) ?? [];
    arr.push(item);
    lines.set(lineY, arr);
  }
  return Array.from(lines.values()).map((lineItems) => {
    const sorted = [...lineItems].sort((a, b) => a.x - b.x);
    const x = sorted[0].x * scale;
    const y = sorted[0].y * scale;
    const right = (sorted[sorted.length - 1].x + sorted[sorted.length - 1].width) * scale;
    const height = Math.max(...sorted.map((i) => i.height)) * scale + 4;
    return { x, y, width: right - x, height, fill: "transparent" };
  });
}

/**
 * Word-level variant of computeHighlightBoxes for the ACTIVE (selected)
 * clause only — navigation/page-resolution is untouched (still driven by
 * resolveClauseTextItems), this only changes how the resolved items are
 * painted. Each item gets its own box so a word actually inside a diff span
 * (changedWords) can be painted with the strong "changed" fill while the
 * rest of the clause gets the much lighter "context" fill — instead of one
 * uniform strong-colored block across the whole clause.
 *
 * Falls back to the previous line-merged, uniformly-colored behaviour when
 * changedWords is empty (ADDED/REMOVED and any case where word-level
 * evidence isn't available) so those finding types are unaffected — AND when
 * changedWords is non-empty but matches NONE of the resolved items. The diff
 * engine's changed-word set is built from the backend's plain clause text,
 * while `items` come from pdf.js's own tokenisation of the rendered PDF
 * (which frequently splits/joins words differently — hyphenation, ligatures,
 * multi-word runs). Exact-token equality between the two can legitimately
 * match zero items even though real changed words exist. Silently rendering
 * only "context" tint with no strong emphasis at all is indistinguishable
 * from no highlight — so when word-level resolution finds nothing, fall back
 * to the same whole-clause highlight used when changedWords is empty, rather
 * than leaving a selected, valid finding with no visual emphasis.
 *
 * @param wordOutline   CSS outline applied to each *changed* word box.
 *                      Must be derived from the change-type stroke color so
 *                      REMOVED → red outline, ADDED → blue (ADDED hue), etc.
 *                      Never use SELECTED_FINDING_OUTLINE here.
 * @param clauseOutline CSS outline applied to the whole-clause merged boxes
 *                      in the word-level fallback path (ADDED/REMOVED single-
 *                      sided, or when changedWords is empty).  This IS the
 *                      blue selection ring — it frames the entire clause block
 *                      rather than individual words, so the context is clear.
 */
function computeWordHighlightBoxes(
  items: PdfTextItem[],
  scale: number,
  changedWords: Set<string> | null,
  strongFill: string,
  contextFill: string,
  wordOutline: string,
  clauseOutline: string,
): HighlightBox[] {
  if (!items.length) return [];

  const wholeClauseFallback = (): HighlightBox[] =>
    // Apply the blue clause-level ring here: it frames the whole block and
    // does NOT fight with a per-word change-type fill.
    computeHighlightBoxes(items, scale).map((box) => ({
      ...box,
      fill: strongFill,
      outline: clauseOutline,
    }));

  if (!changedWords || changedWords.size === 0) {
    // No word-level evidence (ADDED/REMOVED, or MOVED with no text on one
    // side) — fall back to the original whole-clause highlight, unchanged.
    return wholeClauseFallback();
  }

  let matchedAny = false;
  const wordBoxes: HighlightBox[] = items.map((item) => {
    const isChanged = changedWords.has(normalizeToken(item.str));
    if (isChanged) matchedAny = true;
    return {
      x: item.x * scale,
      y: item.y * scale,
      width: item.width * scale,
      height: item.height * scale + 2,
      fill: isChanged ? strongFill : contextFill,
      // Only the actually-changed words get an outline — use the change-type
      // stroke color (wordOutline) so the outline always matches the fill hue.
      // The surrounding equal-context words are shown as a light tint only.
      outline: isChanged ? wordOutline : undefined,
    };
  });

  // Word-level tokenisation mismatch — see the doc comment above. Never leave
  // a selected, valid finding with zero visual emphasis.
  if (!matchedAny) {
    return wholeClauseFallback();
  }

  return wordBoxes;
}

// ─── Single page renderer ─────────────────────────────────────────────────────
// Receives an already-loaded PDFPageProxy — never calls getDocument() itself.

interface PageRendererProps {
  pdfPage: PDFPageProxy;
  pageNumber: number;
  scale: number;
  isVisible: boolean;
  highlights: HighlightBox[];
  passiveHighlights: HighlightBox[];
}

function PageRenderer({
  pdfPage,
  pageNumber,
  scale,
  isVisible,
  highlights,
  passiveHighlights,
}: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [rendered, setRendered] = useState(false);

  const viewport = useMemo(() => pdfPage.getViewport({ scale }), [pdfPage, scale]);

  useEffect(() => {
    if (!isVisible || rendered) return;
    let cancelled = false;

    (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        if (renderTaskRef.current) renderTaskRef.current.cancel();
        renderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport });
        await renderTaskRef.current.promise;
        if (!cancelled) setRendered(true);
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException" && !cancelled) {
          console.error(`[PdfDocumentPane] Page ${pageNumber} render error:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [isVisible, pdfPage, pageNumber, viewport, rendered]);

  // canvas dimensions in physical pixels — set directly on the element so
  // pdfjs renders at the correct resolution.  The *CSS* size is kept at
  // width:100% so the canvas stretches to fill whatever the container gives
  // it, which is already constrained to the pane width by the scroll div.
  const canvasW = Math.round(viewport.width);
  const canvasH = Math.round(viewport.height);

  // Aspect-ratio padding trick: preserves the correct height as the container
  // width changes, eliminating layout shift before the canvas is painted.
  const aspectPadding = `${(canvasH / canvasW) * 100}%`;

  return (
    <div
      className="relative mx-auto mb-3 overflow-hidden rounded-sm shadow-sm"
      style={{ width: "100%" }}
    >
      {/* Placeholder while rendering — sized via aspect-ratio padding */}
      {!rendered && isVisible && (
        <div
          className="flex items-center justify-center bg-[#F3F4F6]"
          style={{ paddingTop: aspectPadding }}
        >
          <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-[#9CA3AF]" />
        </div>
      )}

      {/*
       * canvas has explicit pixel width/height attributes (required by pdfjs)
       * but CSS width:100% lets it scale down to the container.
       * height:auto preserves the aspect ratio so nothing is squashed.
       */}
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        className="block"
        style={{ width: "100%", height: "auto", display: rendered ? "block" : "none" }}
      />

      {/* Passive highlights — positioned as % of canvas so they scale with CSS width:100% */}
      {passiveHighlights.map((box, i) => (
        <div
          key={`p-${i}`}
          className="pointer-events-none absolute rounded-[2px]"
          style={{
            left: `${(box.x / canvasW) * 100}%`,
            top: `${(box.y / canvasH) * 100}%`,
            width: `${(box.width / canvasW) * 100}%`,
            height: `${(box.height / canvasH) * 100}%`,
            background: box.fill,
          }}
        />
      ))}

      {/* Active highlights — word-level: only the actually-changed words
          (see computeWordHighlightBoxes) carry the selection outline, so the
          eye lands on "annually → quarterly", not the whole clause block. */}
      {highlights.map((box, i) => (
        <div
          key={`a-${i}`}
          className="pointer-events-none absolute rounded-[2px]"
          style={{
            left: `${(box.x / canvasW) * 100}%`,
            top: `${(box.y / canvasH) * 100}%`,
            width: `${(box.width / canvasW) * 100}%`,
            height: `${(box.height / canvasH) * 100}%`,
            background: box.fill,
            outline: box.outline,
          }}
        />
      ))}

      {/* Page badge */}
      <div className="absolute bottom-1.5 right-2 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold text-white">
        {pageNumber}
      </div>
    </div>
  );
}

// ─── Document loader hook ─────────────────────────────────────────────────────
// Loads the PDF once and caches PDFDocumentProxy + all PDFPageProxy objects.

interface PdfDocState {
  status: "idle" | "loading" | "ready" | "error";
  doc: PDFDocumentProxy | null;
  pages: (PDFPageProxy | null)[];
  error: string | null;
}

function usePdfDoc(file: File | null | undefined): PdfDocState {
  const [state, setState] = useState<PdfDocState>({
    status: "idle", doc: null, pages: [], error: null,
  });

  const cacheKey = file
    ? `${file.name}::${file.size}::${file.lastModified}`
    : null;

  // Cache loaded documents to avoid re-loading on re-renders
  const docCache = useRef<Map<string, { doc: PDFDocumentProxy; pages: (PDFPageProxy | null)[] }>>(new Map());

  useEffect(() => {
    if (!file || !cacheKey) {
      setState({ status: "idle", doc: null, pages: [], error: null });
      return;
    }

    // Return cached result immediately
    const cached = docCache.current.get(cacheKey);
    if (cached) {
      setState({ status: "ready", doc: cached.doc, pages: cached.pages, error: null });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", doc: null, pages: [], error: null });

    (async () => {
      try {
        const pdfjs = await getPdfJs();
        // Read the file once as a Uint8Array.
        // We use Uint8Array (not ArrayBuffer) because pdfjs-dist takes ownership
        // of the buffer on first load; subsequent calls to arrayBuffer() on the
        // same File would return a detached buffer causing "Invalid PDF structure".
        const ab = await file.arrayBuffer();
        const data = new Uint8Array(ab);
        if (cancelled) return;

        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        // Pre-load all page proxies (lightweight metadata objects, not rendered)
        const pages: PDFPageProxy[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          pages.push(await doc.getPage(i));
          if (cancelled) return;
        }

        docCache.current.set(cacheKey, { doc, pages });
        setState({ status: "ready", doc, pages, error: null });
      } catch (err: any) {
        if (!cancelled) {
          console.error("[PdfDocumentPane] Failed to load PDF document:", err);
          setState({
            status: "error", doc: null, pages: [],
            error: err?.message ?? "Failed to load PDF.",
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PdfDocumentPane({
  file,
  label,
  filename,
  activeClause,
  activeClassification = null,
  changedWords = null,
  allChangedClauseIds,
  clauseClassifications,
  allClauses,
  pdfMap,
}: PdfDocumentPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1, 2]));

  // ── Load PDF document once ───────────────────────────────────────────────
  const { status: docStatus, pages: pdfPages, error: docError } = usePdfDoc(file);

  // ── Dynamic scale — derived from the scroll container's measured width ───
  // We observe the scroll container with ResizeObserver. On each resize we
  // re-compute the scale so that the page fills the available width exactly.
  // PDF viewport at scale=1 for A4 is 595 px wide; we use the first loaded
  // page's natural width as the reference so it works for any page size.
  const [paneWidth, setPaneWidth] = useState<number>(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setPaneWidth(w);
    });
    ro.observe(el);
    // Seed immediately — ResizeObserver fires asynchronously on first attach
    setPaneWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Natural (scale=1) page width of the first page — used as the scale reference.
  const naturalPageWidth = useMemo(() => {
    if (!pdfPages[0]) return null;
    return pdfPages[0].getViewport({ scale: 1 }).width;
  }, [pdfPages]);

  /**
   * Scale that fits the page exactly inside the pane minus horizontal padding.
   * Capped at PDF_SCALE_MAX so we never over-zoom on very wide screens.
   * Falls back to PDF_SCALE_FALLBACK until the container has been measured.
   */
  const pdfScale = useMemo(() => {
    if (!naturalPageWidth || paneWidth <= 0) return PDF_SCALE_FALLBACK;
    const available = paneWidth - PDF_HORIZONTAL_PADDING;
    return Math.min(available / naturalPageWidth, PDF_SCALE_MAX);
  }, [naturalPageWidth, paneWidth]);

  // ── Navigation: scroll to active clause page ─────────────────────────────
  //
  // Two-phase approach:
  //   Phase 1 (activeClause changes): compute the target page, ensure it is
  //   in visiblePages so the page div is rendered into the DOM, and store the
  //   target in a ref so Phase 2 knows what to scroll to.
  //
  //   Phase 2 (visiblePages changes): once the state update has caused the
  //   target page div to be mounted (pageRefs now contains it), scroll to it.
  //
  // This correctly handles:
  //   - Lazy pages that haven't been rendered yet (phase 1 forces them in)
  //   - Two consecutive findings on the same page (activeClause object ref
  //     changes even when resolveClausePage returns the same number, so the
  //     effect always fires and re-queues the scroll)
  //   - Original and Modified panes are independent (each has its own
  //     scrollRef, pageRefs, visiblePages, and pdfMap)

  const pendingScrollPageRef = useRef<number | null>(null);
  const numPagesRef = useRef<number>(0);
  // Keep numPagesRef in sync so phase-1 can clamp neighbor pages
  numPagesRef.current = pdfPages.length;

  // Phase 1: react to every activeClause change (not just activePage number changes)
  useEffect(() => {
    if (!activeClause) return;

    const target = resolveClausePage(activeClause, pdfMap);
    pendingScrollPageRef.current = target;

    const numPages = numPagesRef.current;
    if (numPages === 0) return; // PDF not loaded yet — phase 2 will fire once it is

    // Ensure the target page and its neighbours are in the render set.
    // This is the fix for Bug 1: page may not be in pageRefs yet.
    setVisiblePages((prev) => {
      const next = new Set(prev);
      for (let d = -RENDER_BUFFER; d <= RENDER_BUFFER; d++) {
        const p = target + d;
        if (p >= 1 && p <= numPages) next.add(p);
      }
      // No change needed if target already present — but we still want Phase 2
      // to fire, so return a new Set reference to trigger the effect below.
      return next;
    });
  // activeClause is an object ref — it changes on every finding selection even
  // when the resolved page number stays the same (fixes Bug 2).
  }, [activeClause, pdfMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2: after visiblePages update causes the page div to mount, scroll to it.
  useEffect(() => {
    const target = pendingScrollPageRef.current;
    if (!target) return;
    const el = pageRefs.current.get(target);
    if (!el) return; // div not mounted yet — will fire again on next visiblePages change
    // Consume the pending request so we don't scroll again on unrelated rerenders
    pendingScrollPageRef.current = null;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visiblePages]); // re-check every time visiblePages expands

  // ── IntersectionObserver — lazy rendering ─────────────────────────────────
  const setPageRef = useCallback(
    (pageNum: number) => (el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(pageNum, el);
      else pageRefs.current.delete(pageNum);
    },
    []
  );

  useEffect(() => {
    if (docStatus !== "ready" || pdfPages.length === 0) return;
    const numPages = pdfPages.length;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageNum = Number((entry.target as HTMLElement).dataset.page);
            if (!pageNum) continue;
            if (entry.isIntersecting) {
              for (let d = -RENDER_BUFFER; d <= RENDER_BUFFER; d++) {
                const p = pageNum + d;
                if (p >= 1 && p <= numPages) next.add(p);
              }
            }
          }
          return next;
        });
      },
      { root: scrollRef.current, rootMargin: "300px 0px", threshold: 0 }
    );
    for (const [, el] of pageRefs.current) observer.observe(el);
    return () => observer.disconnect();
  }, [docStatus, pdfPages.length]);

  // ── Highlight boxes ───────────────────────────────────────────────────────
  const activeItems = useMemo(
    () => resolveClauseTextItems(activeClause, pdfMap),
    [activeClause, pdfMap]
  );

  const activeBoxesByPage = useMemo(() => {
    const byPage = new Map<number, HighlightBox[]>();
    const grouped = new Map<number, PdfTextItem[]>();
    for (const item of activeItems) {
      const arr = grouped.get(item.pageNumber) ?? [];
      arr.push(item);
      grouped.set(item.pageNumber, arr);
    }
    const strongFill = changeTypeFill(activeClassification, true);
    const contextFill = changeTypeFill(activeClassification, false);

    // Per-word outline: use the change-type stroke color, NOT the blue
    // selection ring.  SELECTED_FINDING_OUTLINE (#2175D9) is reserved for the
    // finding-card inset box-shadow — it must never appear on individual word
    // boxes, otherwise a REMOVED finding's red fill gets dominated by blue.
    const style = CHANGE_TYPE_STYLE[activeClassification ?? ""] ?? CHANGE_TYPE_STYLE.NEUTRAL_REPHRASE;
    const wordOutline = `1.5px solid ${style.stroke}`;

    // Clause-level selection ring (blue) — only applied on the whole-clause
    // fallback path (ADDED/REMOVED single-side, or when changedWords is empty).
    // Rendered as a slightly transparent blue outline so it frames the clause
    // without painting over the change-type fill.
    const clauseOutline = `2px solid ${SELECTED_FINDING_OUTLINE}`;

    for (const [pg, items] of grouped) {
      byPage.set(
        pg,
        computeWordHighlightBoxes(
          items,
          pdfScale,
          changedWords,
          strongFill,
          contextFill,
          wordOutline,
          clauseOutline,
        ),
      );
    }
    return byPage;
  }, [activeItems, pdfScale, activeClassification, changedWords]);

  const passiveBoxesByPage = useMemo(() => {
    const byPage = new Map<number, HighlightBox[]>();
    if (!pdfMap) return byPage;
    const activeId = activeClause?.id;
    for (const clause of allClauses) {
      if (!allChangedClauseIds.has(clause.id)) continue;
      if (activeId && clause.id === activeId) continue;
      const items = resolveClauseTextItems(clause, pdfMap);
      if (!items.length) continue;
      const classification = clauseClassifications?.get(clause.id) ?? null;
      const fill = changeTypeFill(classification, false);
      const grouped = new Map<number, PdfTextItem[]>();
      for (const item of items) {
        const arr = grouped.get(item.pageNumber) ?? [];
        arr.push(item);
        grouped.set(item.pageNumber, arr);
      }
      for (const [pg, pgItems] of grouped) {
        const existing = byPage.get(pg) ?? [];
        existing.push(
          ...computeHighlightBoxes(pgItems, pdfScale).map((box) => ({ ...box, fill })),
        );
        byPage.set(pg, existing);
      }
    }
    return byPage;
  }, [pdfMap, allClauses, allChangedClauseIds, pdfScale, clauseClassifications, activeClause?.id]);

  const labelCls = NEUTRAL_PANE_LABEL;

  // ── Fallback: no file ─────────────────────────────────────────────────────
  if (!file) {
    return (
      <PaneShell label={label} filename={filename} labelCls={labelCls}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <FileX className="h-8 w-8 text-[#D1D5DB]" />
          <p className="text-[13px] font-medium text-[#6B7280]">PDF not available</p>
          <p className="max-w-[200px] text-[11px] text-[#9CA3AF]">
            Original file is only retained for the active session.
            Switch to Report view for historical comparisons.
          </p>
        </div>
      </PaneShell>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (docStatus === "loading" || docStatus === "idle") {
    return (
      <PaneShell label={label} filename={filename} labelCls={labelCls}>
        <div className="flex flex-1 items-center justify-center gap-2 py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[#9CA3AF]" />
          <span className="text-[13px] text-[#9CA3AF]">Loading PDF…</span>
        </div>
      </PaneShell>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (docStatus === "error" || pdfPages.length === 0) {
    return (
      <PaneShell label={label} filename={filename} labelCls={labelCls}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <AlertCircle className="h-6 w-6 text-[#DC2626]" />
          <p className="text-[13px] font-medium text-[#991B1B]">Could not render PDF</p>
          <p className="max-w-[220px] text-[11px] text-[#9CA3AF]">
            {docError ?? "An error occurred while loading this document."}
          </p>
        </div>
      </PaneShell>
    );
  }

  // ── Render pages ──────────────────────────────────────────────────────────
  return (
    <PaneShell label={label} filename={filename} labelCls={labelCls}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin bg-[#F3F4F6] px-4 py-4"
      >
        {pdfPages.map((pdfPage, idx) => {
          if (!pdfPage) return null;
          const pageNum = idx + 1;
          const isVisible = visiblePages.has(pageNum);
          return (
            <div key={pageNum} ref={setPageRef(pageNum)} data-page={pageNum}>
              <PageRenderer
                pdfPage={pdfPage}
                pageNumber={pageNum}
                scale={pdfScale}
                isVisible={isVisible}
                highlights={activeBoxesByPage.get(pageNum) ?? []}
                passiveHighlights={passiveBoxesByPage.get(pageNum) ?? []}
              />
            </div>
          );
        })}
      </div>
    </PaneShell>
  );
}

// ─── Shell wrapper ────────────────────────────────────────────────────────────

function PaneShell({
  label, filename, labelCls, children,
}: {
  label: string;
  filename: string;
  labelCls: string;
  children: React.ReactNode;
}) {
  const short = (n: string, max = 28) => n.length > max ? `${n.slice(0, max - 1)}…` : n;
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[#E4E4E7] last:border-r-0">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[#E4E4E7] bg-white px-4 py-3">
        <FileText className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
        <span className="truncate text-[13px] font-semibold text-[#111827]">
          {short(filename)}
        </span>
        <span className={`ml-auto shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${labelCls}`}>
          {label}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
