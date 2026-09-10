import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { HeartHandshake, ChevronDown, ChevronUp } from "lucide-react";
import AiProgressOverlay from "../../../shared/components/AiProgressOverlay";
import { AgentMarkup } from "../types";
import { LegalDocument, RedlineProposal } from "../../../shared/types";
import { buildRenderedDocumentHtml } from "../utils";
import { NEGOTIATE_WORKSPACE_STYLES } from "../styles/negotiateWorkspaceStyles";

interface DocumentViewerProps {
  activeDoc: LegalDocument;
  agentMarkups: AgentMarkup[];
  selectedMarkupId: string | null;
  acceptingMarkupId: string | null;
  appliedClause: { id: string; text: string; spliceStart: number } | null;
  evaluating: boolean;
  evaluationError: string;
  isLocked: boolean;
  redlinesOpen: boolean;
  pendingDbRedlines: RedlineProposal[];
  onDocumentPaneClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  /**
   * Called when the user finishes a text selection.
   * `start` carries a raw-content char offset (or occurrenceIndex fallback);
   * `end` is unused (0) — kept for API compatibility.
   */
  onTextSelection?: (text: string, start: number, end: number) => void;
  hasManualSelection?: boolean;
  onRetryEvaluation: () => void;
  onDismissError: () => void;
  onToggleRedlines: () => void;
  onAcceptDbRedline: (id: string) => void;
  onRejectDbRedline: (id: string) => void;
}

/** One highlight rectangle in paper-relative coordinates. */
interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Convert a DOMRectList from Range.getClientRects() into coordinates
 * relative to the paper container.
 *
 * Both the range rects and paperRect.top/left are viewport-relative values
 * that already include the effect of any ancestor scroll. Subtracting one
 * from the other gives the correct paper-relative offset — no scroll
 * adjustment needed.
 */
function toRelativeRects(
  clientRects: DOMRectList,
  paper: HTMLElement,
): HighlightRect[] {
  const paperRect = paper.getBoundingClientRect();
  const rects: HighlightRect[] = [];

  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i];
    if (r.width < 1 || r.height < 1) continue;
    rects.push({
      top:    r.top  - paperRect.top,
      left:   r.left - paperRect.left,
      width:  r.width,
      height: r.height,
    });
  }
  return rects;
}

export default function DocumentViewer({
  activeDoc,
  agentMarkups,
  selectedMarkupId,
  acceptingMarkupId,
  appliedClause,
  evaluating,
  evaluationError,
  isLocked,
  redlinesOpen,
  pendingDbRedlines,
  onDocumentPaneClick,
  onTextSelection,
  hasManualSelection = false,
  onRetryEvaluation,
  onDismissError,
  onToggleRedlines,
  onAcceptDbRedline,
  onRejectDbRedline,
}: DocumentViewerProps) {
  const renderedHtml = useMemo(
    () =>
      buildRenderedDocumentHtml(activeDoc.content, agentMarkups, selectedMarkupId, {
        appliedClause,
      }),
    [activeDoc.content, agentMarkups, selectedMarkupId, appliedClause],
  );

  // Refs for coordinate calculation
  const paperRef  = useRef<HTMLDivElement | null>(null); // position: relative white card
  const docBodyRef = useRef<HTMLDivElement | null>(null);

  // ── Overlay state ─────────────────────────────────────────────────────────
  // Stored in a ref AND mirrored to state. The ref is written synchronously
  // inside the mouseup handler (before React batches the onTextSelection state
  // update), so the overlay is painted in the same flush. The state drives the
  // actual render so it survives React re-renders — it lives outside of
  // dangerouslySetInnerHTML and is never wiped by an innerHTML reset.
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([]);

  const clearOverlay = useCallback(() => {
    setHighlightRects([]);
  }, []);

  // Clear when the parent clears the manual selection (×, Accept, Reject)
  useEffect(() => {
    if (!hasManualSelection) clearOverlay();
  }, [hasManualSelection, clearOverlay]);

  // ── Text selection capture ────────────────────────────────────────────────
  //
  // BLOCKER-1 FIX: We no longer pass a DOM-occurrence index to the hook.
  // Instead we compute a raw-content char offset at selection time.
  //
  // Why occurrence index was wrong for Markdown documents:
  //   The DOM plain text for "**indemnifying party**" is "indemnifying party".
  //   The raw Markdown content contains "**indemnifying party**" — the exact
  //   string "indemnifying party" does NOT appear verbatim in the raw content.
  //   So the occurrence count in rendered DOM ≠ occurrence count in raw content,
  //   causing Accept to splice the wrong location.
  //
  // New approach — raw-content char offset anchor:
  //   1. Walk the rendered DOM to determine the plain-text char offset of the
  //      selection start (same as before).
  //   2. Build a plain-text "shadow" of the raw document content by stripping
  //      Markdown decoration (**/__ /##/>/etc.) while recording a posMap[] that
  //      maps each shadow char back to its raw-content position.
  //   3. Find which occurrence of `selectedText` (normalised) appears AT or just
  //      before the plain-text start offset in the shadow — using the posMap to
  //      translate that shadow position back to a raw-content char offset.
  //   4. Store that raw-content offset in `start`. The Accept path uses it as a
  //      direct splice anchor, completely bypassing occurrence counting.
  //
  // For HTML documents (no Markdown processing) the posMap is identity and the
  // result is equivalent to the previous behavior.

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent<HTMLDivElement>) => {
      if (!onTextSelection) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const text = sel.toString().trim();
      if (text.length < 5) return;

      const range = sel.getRangeAt(0);
      const paper = paperRef.current;
      const docBody = docBodyRef.current;

      // ── Step 1: measure the DOM plain-text start offset ──────────────────
      // Walk text nodes in docBody to find where range.startContainer sits
      // within the concatenated plain text of the rendered document.
      let domPlainStartOffset = -1;

      if (docBody) {
        let totalLen = 0;
        const startIsText = range.startContainer.nodeType === Node.TEXT_NODE;
        const walker = document.createTreeWalker(docBody, NodeFilter.SHOW_TEXT);
        let node: Node | null;

        while ((node = walker.nextNode()) !== null) {
          const nodeText = node.nodeValue ?? "";
          if (startIsText && node === range.startContainer) {
            domPlainStartOffset = totalLen + range.startOffset;
            break;
          } else if (!startIsText && domPlainStartOffset === -1 && range.startContainer.contains(node)) {
            domPlainStartOffset = totalLen;
            break;
          }
          totalLen += nodeText.length;
        }
      }

      // ── Step 2: build a Markdown-stripped plain-text shadow of raw content ─
      // posMap[i] = index in rawContent that produced shadow char i.
      // This lets us translate a shadow position back to a raw-content offset.
      //
      // We strip the most common Markdown inline/block decorators that are
      // invisible in rendered text but present in raw content:
      //   **bold**  *italic*  __bold__  _italic_  `code`
      //   ### headings  > blockquote  --- / *** / ___ (horizontal rules)
      //   [link](url)  ![img](url)  ~~strikethrough~~
      //
      // We do NOT use a full Markdown parser here — we need a char-level mapping.
      // The strip pass is conservative: only remove decoration chars that produce
      // zero visible output, so the shadow's character count matches the DOM
      // plain text closely enough for our occurrence search.

      const rawContent = activeDoc.content;
      const isHtmlDoc = /<[a-z][\s\S]*>/i.test(rawContent.trim());

      // rawContentOffset: the raw-content char offset of the selection start.
      // -1 means we couldn't compute it; fallback to occurrenceIndex path.
      let rawContentOffset = -1;

      if (!isHtmlDoc && domPlainStartOffset >= 0) {
        // Build the shadow + posMap by walking rawContent char-by-char and
        // skipping Markdown decoration sequences.
        const shadowChars: string[] = [];
        const posMap: number[] = []; // posMap[shadowIdx] = rawContent index
        let i = 0;
        const rc = rawContent;
        const rcLen = rc.length;

        while (i < rcLen) {
          // ── ATX headings: skip leading # chars on a line ─────────────────
          // At line start: consume "#{1,6} " so heading text remains.
          if ((i === 0 || rc[i - 1] === "\n") && rc[i] === "#") {
            let j = i;
            while (j < rcLen && rc[j] === "#") j++;
            if (j < rcLen && rc[j] === " ") {
              i = j + 1; // skip "### " prefix entirely
              continue;
            }
          }

          // ── Blockquote: skip leading "> " ────────────────────────────────
          if ((i === 0 || rc[i - 1] === "\n") && rc[i] === ">" && i + 1 < rcLen && rc[i + 1] === " ") {
            i += 2;
            continue;
          }

          // ── Horizontal rules: skip "---", "***", "___" on their own line ─
          if (i === 0 || rc[i - 1] === "\n") {
            const hrMatch = rc.slice(i).match(/^([*\-_]){3,}\s*\n/);
            if (hrMatch) {
              i += hrMatch[0].length;
              continue;
            }
          }

          // ── Fenced code blocks: skip entire block ────────────────────────
          if (rc[i] === "`" && rc[i + 1] === "`" && rc[i + 2] === "`") {
            const closeIdx = rc.indexOf("```", i + 3);
            if (closeIdx !== -1) {
              i = closeIdx + 3;
              // skip trailing newline
              if (i < rcLen && rc[i] === "\n") i++;
              continue;
            }
          }

          // ── Inline code: skip surrounding backticks ───────────────────────
          if (rc[i] === "`") {
            const closeIdx = rc.indexOf("`", i + 1);
            if (closeIdx !== -1 && closeIdx - i <= 80) {
              // Emit the inner content, skip the surrounding backticks.
              i++; // skip opening `
              while (i < closeIdx) {
                shadowChars.push(rc[i]);
                posMap.push(i);
                i++;
              }
              i++; // skip closing `
              continue;
            }
          }

          // ── Bold/italic: ** __ * _ ~~ ─────────────────────────────────────
          // Match opening/closing pairs: **, __, ~~, *, _, with a lookahead to
          // avoid consuming standalone punctuation (e.g. "3 * 4").
          const twoChar = rc.slice(i, i + 2);
          if (twoChar === "**" || twoChar === "__" || twoChar === "~~") {
            i += 2;
            continue;
          }
          if ((rc[i] === "*" || rc[i] === "_")) {
            // Only skip if surrounded by word chars (decoration, not multiplication/underscore in word)
            const prev = i > 0 ? rc[i - 1] : " ";
            const next = i + 1 < rcLen ? rc[i + 1] : " ";
            // Skip when: adjacent to non-space (opening) OR adjacent to non-space on left (closing)
            if (prev !== " " || next !== " ") {
              i++;
              continue;
            }
          }

          // ── Image syntax: ![alt](url) — emit alt text only ───────────────
          if (rc[i] === "!" && rc[i + 1] === "[") {
            const altClose = rc.indexOf("]", i + 2);
            const urlOpen = altClose !== -1 ? rc.indexOf("(", altClose) : -1;
            const urlClose = urlOpen !== -1 ? rc.indexOf(")", urlOpen) : -1;
            if (urlClose !== -1 && urlOpen === altClose + 1) {
              // Emit alt text
              for (let k = i + 2; k < altClose; k++) {
                shadowChars.push(rc[k]);
                posMap.push(k);
              }
              i = urlClose + 1;
              continue;
            }
          }

          // ── Link syntax: [text](url) — emit link text only ───────────────
          if (rc[i] === "[") {
            const textClose = rc.indexOf("]", i + 1);
            const urlOpen = textClose !== -1 ? rc.indexOf("(", textClose) : -1;
            const urlClose = urlOpen !== -1 ? rc.indexOf(")", urlOpen) : -1;
            if (urlClose !== -1 && urlOpen === textClose + 1) {
              for (let k = i + 1; k < textClose; k++) {
                shadowChars.push(rc[k]);
                posMap.push(k);
              }
              i = urlClose + 1;
              continue;
            }
          }

          // ── Default: emit the character as-is ────────────────────────────
          shadowChars.push(rc[i]);
          posMap.push(i);
          i++;
        }

        // ── Step 3: find the occurrence of `text` in the shadow that
        //    corresponds to domPlainStartOffset ──────────────────────────────
        //
        // The shadow and rendered plain text should now have very similar
        // character content. We look for the occurrence of `text` in the
        // shadow whose end position is closest to (but not after)
        // domPlainStartOffset, then take the one that starts at or just before
        // that offset.
        //
        // To handle minor length drift between shadow and DOM plain text
        // (caused by e.g. entity substitution in typographer), we search for
        // the occurrence whose start index in the shadow is closest to
        // domPlainStartOffset, with a tolerance window of ±50 chars.

        const shadowStr = shadowChars.join("").toLowerCase();
        const normText = text.toLowerCase();
        const TOLERANCE = 50;

        let bestRawOffset = -1;
        let bestDist = Infinity;
        let searchFrom = 0;

        while (searchFrom < shadowStr.length) {
          const idx = shadowStr.indexOf(normText, searchFrom);
          if (idx === -1) break;

          const dist = Math.abs(idx - domPlainStartOffset);
          if (dist < bestDist) {
            bestDist = dist;
            // Map shadow start index back to raw content offset.
            bestRawOffset = posMap[idx] ?? -1;
          }
          searchFrom = idx + normText.length;
        }

        if (bestRawOffset !== -1 && bestDist <= domPlainStartOffset + TOLERANCE) {
          rawContentOffset = bestRawOffset;
        }
      } else if (isHtmlDoc && domPlainStartOffset >= 0) {
        // HTML document: plain text matches raw content closely.
        // Find the occurrence of `text` in rawContent nearest to domPlainStartOffset.
        const lc = rawContent.toLowerCase();
        const normText = text.toLowerCase();
        let searchFrom = 0;
        let bestOffset = -1;
        let bestDist = Infinity;
        while (searchFrom < lc.length) {
          const idx = lc.indexOf(normText, searchFrom);
          if (idx === -1) break;
          const dist = Math.abs(idx - domPlainStartOffset);
          if (dist < bestDist) { bestDist = dist; bestOffset = idx; }
          searchFrom = idx + normText.length;
        }
        if (bestOffset !== -1) rawContentOffset = bestOffset;
      }

      // ── Step 4: capture overlay rects and fire callback ──────────────────
      // Capture rects BEFORE removeAllRanges() clears the selection geometry.
      if (paper) {
        const rects = toRelativeRects(range.getClientRects(), paper);
        setHighlightRects(rects);
      }

      sel.removeAllRanges();

      // `start` now carries the raw-content char offset (or -1 as fallback).
      // The hook stores this in manualSelectionRef.occurrenceIndex for
      // backward-compat naming, but uses it as a direct splice offset.
      onTextSelection(text, rawContentOffset, 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onTextSelection, activeDoc.content],
  );

  // ── Scroll effects (unchanged) ────────────────────────────────────────────

  useEffect(() => {
    if (!acceptingMarkupId) return;
    const el = document.querySelector(
      `[data-clause-id="${CSS.escape(acceptingMarkupId)}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.classList.add("negotiate-clause-working");
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [acceptingMarkupId]);

  useEffect(() => {
    if (!appliedClause?.id) return;
    const el = document.querySelector(
      `[data-clause-id="${CSS.escape(appliedClause.id)}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [appliedClause?.id]);

  useEffect(() => {
    if (!selectedMarkupId) return;
    const el = document.querySelector(
      `[data-clause-id="${CSS.escape(selectedMarkupId)}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    el.classList.add("negotiate-clause-focused");
    const timer = setTimeout(() => el.classList.remove("negotiate-clause-focused"), 1400);
    return () => clearTimeout(timer);
  }, [selectedMarkupId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const clauseCnt = agentMarkups.length;

  return (
    <>
      <style>{NEGOTIATE_WORKSPACE_STYLES}</style>
      <div
        className="negotiate-scroll scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto bg-transparent"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[1100px] flex-col justify-start px-6 py-5 sm:px-10">
          {/* position:relative so overlay rects are anchored here */}
          <div
            ref={paperRef}
            className="negotiate-paper relative min-h-[calc(100%-8px)] flex-1 overflow-visible bg-white"
            style={{
              borderRadius: 22,
              boxShadow:
                "0 25px 50px -12px rgba(15, 23, 42, 0.18), 0 8px 16px -8px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)",
              padding: "48px 56px 64px",
            }}
          >
            <AiProgressOverlay
              visible={evaluating || !!evaluationError}
              message={evaluating ? "Parsing contract structure and detecting risk clauses…" : ""}
              error={evaluationError}
              label="Evaluating contract"
              subtitle={activeDoc.title}
              illustration="scan"
              onRetry={evaluationError ? onRetryEvaluation : undefined}
              onDismiss={evaluationError ? onDismissError : undefined}
            />

            {!evaluating && !evaluationError && (
              renderedHtml ? (
                <div
                  ref={docBodyRef}
                  className={`negotiate-document-body prose prose-sm max-w-none${hasManualSelection ? " has-manual-selection" : ""}`}
                  onClick={onDocumentPaneClick}
                  onMouseUp={handleMouseUp}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              ) : (
                <p className="text-[#A1A1AA] italic text-sm text-center py-16 m-0">
                  Agreement content is empty.
                </p>
              )
            )}

            {/* ── Manual-selection highlight overlay ── */}
            {/* Rendered as sibling to dangerouslySetInnerHTML — never wiped by */}
            {/* innerHTML resets. pointer-events:none so clicks pass through.   */}
            {highlightRects.map((r, i) => (
              <div
                key={i}
                aria-hidden="true"
                style={{
                  position:        "absolute",
                  top:             r.top,
                  left:            r.left,
                  width:           r.width,
                  height:          r.height,
                  background:      "rgba(148, 163, 184, 0.38)",
                  borderRadius:    2,
                  pointerEvents:   "none",
                  zIndex:          10,
                  mixBlendMode:    "multiply",
                }}
              />
            ))}
          </div>

          {/* ── Below-document hints ──────────────────────────────────────────
              Shown only when evaluation is complete and the document has
              content. Two lines: one for AI findings, one for manual selection.
              Both disappear while evaluating so they don't compete with the
              AiProgressOverlay. The legend line only appears when there are AI
              findings to distinguish from. Neither hint is shown while a manual
              selection is already active — no point reminding at that point. */}
          {!evaluating && !evaluationError && renderedHtml && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              {/* AI finding interaction hint */}
              {clauseCnt > 0 && (
                <p className="m-0 text-center text-[11px] text-[#98A2B3]">
                  Click a highlighted clause in the document to review the AI suggestion
                </p>
              )}
              {/* Manual selection discoverability hint (#19) — hidden once active */}
              {!hasManualSelection && (
                <p className="m-0 text-center text-[11px] text-[#B0BAC8]">
                  Or select any text to request your own revision
                </p>
              )}
              {/* Compact legend — only shown when AI findings exist (#21) */}
              {clauseCnt > 0 && !hasManualSelection && (
                <div
                  className="mt-1 inline-flex items-center gap-3.5 rounded-full bg-white px-3.5 py-1.5"
                  style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
                  role="note"
                  aria-label="Colour legend for document highlights"
                >
                  {/* AI finding swatch — uses yellow as representative mid-risk colour */}
                  <span className="flex items-center gap-1.5 text-[10.5px] text-[#667085]">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-50"
                      aria-hidden="true"
                    />
                    AI finding
                  </span>
                  <span className="h-3 w-px bg-[#E4E7EC]" aria-hidden="true" />
                  {/* Manual selection swatch — matches the overlay rgba(148,163,184,0.38) */}
                  <span className="flex items-center gap-1.5 text-[10.5px] text-[#667085]">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-200 bg-slate-200/60"
                      aria-hidden="true"
                    />
                    Your selection
                  </span>
                </div>
              )}
            </div>
          )}

          {pendingDbRedlines.length > 0 && (
            <div
              className="mt-5 overflow-hidden bg-white"
              style={{
                borderRadius: 22,
                boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
              }}
            >
              <button
                type="button"
                onClick={onToggleRedlines}
                className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-5 py-4 text-[13px] font-medium text-[#1a1a1a] transition hover:bg-[#F7F8FB]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                    <HeartHandshake className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <span>Pending redlines</span>
                  <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
                    {pendingDbRedlines.length}
                  </span>
                </div>
                {redlinesOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#A1A1AA]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#A1A1AA]" />
                )}
              </button>

              {redlinesOpen && (
                <div className="negotiate-scroll max-h-[280px] space-y-3 overflow-y-auto border-t border-[#F4F4F5] px-5 pb-5">
                  {pendingDbRedlines.map((p) => (
                    <div
                      key={p.id}
                      className="bg-[#FAFAFA] border border-[#F0F0F0] rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#A1A1AA]">
                        <span className="truncate max-w-[160px] font-medium">{p.proposedByEmail}</span>
                        <span>{new Date(p.proposedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[12px] line-through text-[#DC2626] leading-relaxed m-0">
                          {p.originalText}
                        </p>
                        <p className="text-[12px] text-[#166534] font-medium leading-relaxed m-0">
                          {p.proposedText}
                        </p>
                      </div>
                      {p.comment && (
                        <p className="text-[11px] italic text-[#A1A1AA] m-0">{p.comment}</p>
                      )}
                      {!isLocked && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onAcceptDbRedline(p.id)}
                            className="primary-gradient inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-none px-4 text-[12px] font-semibold text-white"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onRejectDbRedline(p.id)}
                            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-[#E4E4E7] bg-white text-[12px] font-medium text-[#52525B] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
