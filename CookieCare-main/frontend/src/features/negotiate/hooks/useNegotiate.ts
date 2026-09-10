import { useState, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { LegalDocument } from "../../../shared/types";
import { AgentMarkup, NegotiationContext, NegotiationStrategy, StrategyDraftResult } from "../types";
import {
  evaluateDocument, acceptRedline,
  rejectRedline, generateCompromise, fetchDocumentDetails,
  saveNegotiationStep, exportDocument, fetchNegotiationContext,
  fetchNegotiationStrategy,
} from "../api/negotiateApi";

// ─── Clause-location helper ───────────────────────────────────────────────────
//
// PDF text extraction frequently produces whitespace, line-break, punctuation,
// and Unicode variants that differ from the text the LLM extracted during
// evaluation.  We use a four-strategy cascade to locate the clause for splicing.
//
// Strategy 1 – Exact match via charOffset (fastest, most reliable when offset
//              was resolved during evaluation against the same plain-text).
// Strategy 2 – Exact indexOf on raw content (works when content is unchanged).
// Strategy 3 – Normalised-whitespace match: collapse all whitespace runs and
//              scan the document for the resulting needle.
// Strategy 4 – Leading-words anchor: take the first 10 significant words of the
//              clause, find their location in the document, then verify the
//              region covers enough of the original clause text before splicing.
//
// Returns { start, end } offsets for slicing, or null if no confident match.

interface SpliceRange { start: number; end: number; }

function collapseWhitespace(s: string): string {
  return s.replace(/[\r\n\t\u00A0\u2003]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/** Replace smart quotes, em/en dashes, ellipsis chars with plain ASCII. */
function normalisePunctuation(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...");
}

function normaliseForMatch(s: string): string {
  return collapseWhitespace(normalisePunctuation(s)).toLowerCase();
}

function locateClauseForSplice(
  content: string,
  markup: AgentMarkup
): SpliceRange | null {
  const original = markup.original;
  if (!original || original.trim().length < 10) return null;

  // ── Strategy 1: charOffset anchor ─────────────────────────────────────────
  // The backend resolves charOffset against the same plain-text used for
  // evaluation, so it is the most reliable anchor when available.
  if (typeof markup.charOffset === "number" && markup.charOffset >= 0) {
    const off = markup.charOffset;
    // Verify the region at charOffset actually matches the original text using
    // normalised comparison (the content may have been edited since evaluation).
    const candidate = content.slice(off, off + original.length + 200);
    const normOrig = normaliseForMatch(original);
    const normCand = normaliseForMatch(candidate.slice(0, original.length + 50));
    // Accept if the leading portion of the candidate matches the original well.
    if (normCand.startsWith(normOrig.slice(0, Math.min(normOrig.length, 60)))) {
      // Find the exact end by scanning forward from charOffset.
      // Use raw length first; fall back to normalised-length estimate.
      const rawEnd = off + original.length;
      return { start: off, end: Math.min(rawEnd, content.length) };
    }
  }

  // ── Strategy 2: raw exact match ───────────────────────────────────────────
  const exactIdx = content.indexOf(original);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + original.length };
  }

  // ── Strategy 3: normalised-whitespace + punctuation match ─────────────────
  // Build a normalised shadow of the document, mapping shadow positions back
  // to original positions.
  const normNeedle = normaliseForMatch(original);
  if (normNeedle.length >= 20) {
    const normDoc: string[] = [];
    const posMap: number[]  = [];  // normDoc[i] came from content[posMap[i]]
    let prevSpace = false;

    for (let i = 0; i < content.length; i++) {
      const ch = normalisePunctuation(content[i]);
      if (/[\s\r\n\t\u00A0]/.test(ch)) {
        if (!prevSpace) {
          normDoc.push(" ");
          posMap.push(i);
          prevSpace = true;
        }
      } else {
        normDoc.push(ch.toLowerCase());
        posMap.push(i);
        prevSpace = false;
      }
    }

    const normDocStr = normDoc.join("");
    const normIdx = normDocStr.indexOf(normNeedle);
    if (normIdx !== -1) {
      const start = posMap[normIdx];
      // End: map the normalised end position back to the original.
      const normEnd = normIdx + normNeedle.length - 1;
      const end = normEnd < posMap.length ? posMap[normEnd] + 1 : start + original.length;
      return { start, end: Math.min(end, content.length) };
    }
  }

  // ── Strategy 4: leading-words anchor ─────────────────────────────────────
  // Extract the first 8 significant words of the original clause and find them
  // in the document.  If found, verify the region has adequate overlap with the
  // original text before accepting.
  const words = original
    .replace(/[\r\n]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length >= 4) {
    const anchor = words.slice(0, 8).join(" ");
    const normAnchor = normaliseForMatch(anchor);
    const normContentFlat = normaliseForMatch(content);
    const anchorIdx = normContentFlat.indexOf(normAnchor);

    if (anchorIdx !== -1) {
      // Map normalised index back to raw content index via Strategy 3's posMap,
      // but we don't have posMap here — use a rough char-ratio approximation.
      const ratio = content.length / normContentFlat.length;
      const approxStart = Math.max(0, Math.round(anchorIdx * ratio));

      // Scan backward slightly to absorb ratio error.
      const scanStart = Math.max(0, approxStart - 20);
      const region = content.slice(scanStart, scanStart + original.length + 200);
      const normRegion = normaliseForMatch(region);

      // Require that ≥70% of the original's normalised text appears in this region.
      const overlapTarget = normNeedle.slice(0, Math.floor(normNeedle.length * 0.7));
      if (normRegion.includes(overlapTarget)) {
        // Find precise start inside the region.
        const regionNormIdx = normRegion.indexOf(normNeedle.slice(0, 40));
        const preciseStart = regionNormIdx >= 0
          ? scanStart + Math.round(regionNormIdx * ratio)
          : scanStart;
        return {
          start: preciseStart,
          end: Math.min(preciseStart + original.length, content.length),
        };
      }
    }
  }

  return null;
}

// ─── Nth-occurrence locator (for manual-selection Accept) ─────────────────────
//
// The manual selection records WHICH rendered occurrence of the selected text
// the user chose (occurrenceIndex, 0-based). This function finds the same
// occurrence in the raw document content using the same normalised matching
// logic as locateClauseForSplice Strategy 3, ensuring Markdown→HTML whitespace
// and smart-quote differences are handled.
//
// Algorithm:
//   1. Build a normalised shadow of the raw content (Strategy 3 position map).
//   2. Scan forward through all occurrences of the normalised target.
//   3. Return the (occurrenceIndex)-th match's raw content start/end.
//
// Returns null if fewer than occurrenceIndex+1 occurrences exist.

function locateNthOccurrenceInContent(
  content: string,
  targetText: string,
  occurrenceIndex: number
): SpliceRange | null {
  if (!targetText || targetText.trim().length < 5) return null;
  if (occurrenceIndex < 0) return null;

  // ── Exact text: try simple scanning first (fast path) ───────────────────
  // Works for HTML documents where rendered text exists verbatim in content.
  const exactTarget = targetText;
  let exactSearchFrom = 0;
  let exactCount = 0;
  while (true) {
    const idx = content.indexOf(exactTarget, exactSearchFrom);
    if (idx === -1) break;
    if (exactCount === occurrenceIndex) {
      return { start: idx, end: idx + exactTarget.length };
    }
    exactCount++;
    exactSearchFrom = idx + exactTarget.length;
  }

  // ── Normalised path: handles Markdown whitespace / smart-quote differences ──
  const normTarget = normaliseForMatch(targetText);
  if (normTarget.length < 5) return null;

  // Build normalised shadow of content with position map (identical to
  // Strategy 3 in locateClauseForSplice).
  const normChars: string[] = [];
  const posMap: number[] = [];
  let prevSpace = false;

  for (let i = 0; i < content.length; i++) {
    const ch = normalisePunctuation(content[i]);
    if (/[\s\r\n\t\u00A0]/.test(ch)) {
      if (!prevSpace) {
        normChars.push(" ");
        posMap.push(i);
        prevSpace = true;
      }
    } else {
      normChars.push(ch.toLowerCase());
      posMap.push(i);
      prevSpace = false;
    }
  }

  const normDoc = normChars.join("");
  let normSearchFrom = 0;
  let normCount = 0;

  while (true) {
    const normIdx = normDoc.indexOf(normTarget, normSearchFrom);
    if (normIdx === -1) break;
    if (normCount === occurrenceIndex) {
      // Map normalised positions back to raw content positions.
      const start = posMap[normIdx];
      const normEnd = normIdx + normTarget.length - 1;
      const end = normEnd < posMap.length ? posMap[normEnd] + 1 : start + targetText.length;
      return { start, end: Math.min(end, content.length) };
    }
    normCount++;
    normSearchFrom = normIdx + normTarget.length;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

interface UseNegotiateOptions {
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  /** Playbook selected on the entry screen. Null means no playbook. */
  initialPlaybookId?: string | null;
  initialPlaybookName?: string | null;
}

export function useNegotiate({
  activeDocument, authToken, onRefresh,
  initialPlaybookId = null, initialPlaybookName = null,
}: UseNegotiateOptions) {
  const [activeDoc, setActiveDoc] = useState<LegalDocument | null>(null);
  const [agentMarkups, setAgentMarkups] = useState<AgentMarkup[]>([]);
  const [selectedMarkup, setSelectedMarkup] = useState<AgentMarkup | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [acceptingMarkupId, setAcceptingMarkupId] = useState<string | null>(null);
  const [appliedClause, setAppliedClause] = useState<{ id: string; text: string; spliceStart: number } | null>(null);
  const [evaluatingDocId, setEvaluatingDocId] = useState<string | null>(null);
  const [editingReplacement, setEditingReplacement] = useState(false);
  const [redlinesOpen, setRedlinesOpen] = useState(false);
  const [draftingCompromise, setDraftingCompromise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  /** Inline error message replacing blocking alert() dialogs.
   *  Set on accept/save/draft failures; auto-clears after 6 s. */
  const [negotiateError, setNegotiateError] = useState<string | null>(null);
  const negotiateErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Show an inline error and auto-dismiss it after 6 seconds. */
  const showNegotiateError = (msg: string) => {
    if (negotiateErrorTimerRef.current) clearTimeout(negotiateErrorTimerRef.current);
    setNegotiateError(msg);
    negotiateErrorTimerRef.current = setTimeout(() => setNegotiateError(null), 6000);
  };

  const clearNegotiateError = () => {
    if (negotiateErrorTimerRef.current) clearTimeout(negotiateErrorTimerRef.current);
    setNegotiateError(null);
  };
  const [userInstruction, setUserInstruction] = useState("");
  // Seeded from the entry screen selection. User can still change it mid-session
  // via the playbook pill in the instruction bar footer.
  const [selectedPlaybook, setSelectedPlaybook] = useState<{ id: string; name: string } | null>(
    initialPlaybookId && initialPlaybookName
      ? { id: initialPlaybookId, name: initialPlaybookName }
      : null
  );
  const [negotiationContext, setNegotiationContext] = useState<NegotiationContext | null>(null);
  const [negotiationStrategy, setNegotiationStrategy] = useState<NegotiationStrategy | null>(null);
  const [strategyDraftResult, setStrategyDraftResult] = useState<StrategyDraftResult | null>(null);
  const evalRequestIdRef = useRef(0);
  const loadedDocIdRef = useRef<string | null>(null);

  /**
   * Stores a user's manual text selection in the document viewer.
   * Using a ref (not state) prevents focus changes — e.g. clicking the
   * instruction textarea — from triggering a re-render that would lose the
   * selection before draftFromStrategy reads it.
   *
   * BLOCKER-1 FIX: `rawContentOffset` is the char offset of the selected text
   * within the RAW document content (not the rendered DOM plain text). It is
   * computed by DocumentViewer.handleMouseUp by stripping Markdown decoration
   * from the raw content and aligning with the DOM selection position.
   *
   * Using a raw-content offset instead of a DOM-occurrence index eliminates
   * the Markdown formatting mismatch: **bold** in raw content is "bold" in
   * DOM, so occurrence counts diverge. A direct raw-content offset does not.
   *
   * -1 means the offset could not be determined; Accept falls back to the
   * existing locateNthOccurrenceInContent path as a safe fallback.
   */
  const manualSelectionRef = useRef<{ text: string; rawContentOffset: number } | null>(null);
  /** Reactive mirror of manualSelectionRef — triggers re-renders in consumers. */
  const [hasManualSelection, setHasManualSelection] = useState(false);
  /** Selected text string exposed to UI for preview — kept in sync with the ref. */
  const [manualSelectionText, setManualSelectionText] = useState<string>("");

  /**
   * Called by DocumentViewer's onTextSelection callback.
   * `rawContentOffset` (passed as the `start` parameter from DocumentViewer)
   * is the char offset of the selected text within the raw document content,
   * computed by stripping Markdown decoration and aligning with the DOM
   * selection position. See DocumentViewer.handleMouseUp for full details.
   */
  const handleTextSelection = (text: string, rawContentOffset: number, _end: number) => {
    manualSelectionRef.current = { text, rawContentOffset };
    setHasManualSelection(true);
    setManualSelectionText(text);
  };

  /** Clears a stored manual selection (called after Accept or Reject). */
  const clearManualSelection = () => {
    manualSelectionRef.current = null;
    setHasManualSelection(false);
    setManualSelectionText("");
  };

  // ── Reset per-clause state when the selected markup changes ───────────────
  // Without this, cached context/strategy from clause A bleeds into clause B.
  useEffect(() => {
    setNegotiationContext(null);
    setNegotiationStrategy(null);
    setStrategyDraftResult(null);
    // Do NOT reset selectedPlaybook — user may want the same playbook across clauses
  }, [selectedMarkup?.clauseId]);

  const loadActiveDocumentDetails = async (docId: string) => {
    if (!docId) return;
    try {
      const fullDoc = await fetchDocumentDetails(authToken, docId);
      setActiveDoc(fullDoc);
      runMultiAgentEvaluation(docId, fullDoc.content, { title: fullDoc.title, type: fullDoc.type });
    } catch (err) {
      console.error("Error fetching document details:", err);
    }
  };

  useEffect(() => {
    const docId = activeDocument?.id ?? "";
    if (!docId) return;
    if (docId === loadedDocIdRef.current) return;
    loadedDocIdRef.current = docId;
    loadActiveDocumentDetails(docId);
  }, [activeDocument?.id]);

  const runMultiAgentEvaluation = async (
    docId: string, docContent: string, metadata: { title: string; type: string }
  ) => {
    if (!docContent) return;
    if (evaluatingDocId === docId) return;
    const requestId = ++evalRequestIdRef.current;
    setEvaluatingDocId(docId);
    setEvaluating(true);
    setEvaluationError("");
    setNegotiationContext(null);
    setNegotiationStrategy(null);
    try {
      const { markups } = await evaluateDocument(authToken, docContent, metadata.title, metadata.type, selectedPlaybook?.id);
      if (requestId !== evalRequestIdRef.current) return;
      setAgentMarkups(markups);
      setSelectedMarkup(markups.length > 0 ? markups[0] : null);
    } catch (err: any) {
      if (requestId === evalRequestIdRef.current) setEvaluationError(err.message);
    } finally {
      if (requestId === evalRequestIdRef.current) { setEvaluating(false); setEvaluatingDocId(null); }
    }
  };

  const handleAcceptAgentMarkup = async (markup: AgentMarkup) => {
    if (!activeDoc || acceptingMarkupId === markup.clauseId) return;
    setAcceptingMarkupId(markup.clauseId);
    setAppliedClause(null);
    try {
      const content = activeDoc.content;

      // ── Locate the target clause ──────────────────────────────────────────
      const manual = manualSelectionRef.current;
      const isManualAccept =
        manual !== null && markup.clauseId.startsWith("manual-");

      let splice: { start: number; end: number } | null = null;

      if (isManualAccept && manual) {
        // ── BLOCKER-1 FIX: raw-content offset anchor ─────────────────────
        //
        // DocumentViewer.handleMouseUp now computes a raw-content char offset
        // by stripping Markdown decoration from the raw content and aligning
        // with the DOM selection position. We use that offset as a direct
        // splice anchor — no occurrence index counting needed.
        //
        // Verification: confirm that `manual.text` (normalised) actually
        // exists at `manual.rawContentOffset` in the content. This guards
        // against cases where the offset could not be computed (rawContentOffset
        // = -1) or the document was edited since the selection was made.

        const rawOffset = manual.rawContentOffset;

        if (rawOffset >= 0 && rawOffset < content.length) {
          // Verify the region at rawOffset matches the selected text using
          // normalised comparison (handles minor whitespace/punctuation drift
          // AND Markdown decoration chars like ** __ that precede the text).
          //
          // Strip Markdown decoration chars from both sides before comparing
          // so "**indemnifying party**" correctly matches "indemnifying party".
          const stripMarkdownDecor = (s: string) =>
            s.replace(/[*_~`#>[\]()]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

          const window = content.slice(rawOffset, rawOffset + manual.text.length + 100);
          const normSelected = stripMarkdownDecor(manual.text);
          const normWindow = stripMarkdownDecor(window);

          if (normSelected.length >= 5 &&
              normWindow.startsWith(normSelected.slice(0, Math.min(normSelected.length, 40)))) {
            // Raw offset is valid — find the precise end by scanning forward.
            // The raw content may have formatting chars interspersed, so the
            // actual end may be slightly beyond rawOffset + text.length.
            // Use the text length as an upper bound and scan for the real end.
            splice = {
              start: rawOffset,
              end: Math.min(rawOffset + manual.text.length + 20, content.length),
            };

            // Tighten the end: walk forward from rawOffset to find where
            // the raw content's normalised text stops matching manual.text.
            // This handles Markdown chars like **/ that sit inside the span.
            let end = rawOffset;
            let matchedChars = 0;
            // Count only the non-decoration, non-whitespace chars in the selected text
            const normLen = manual.text.replace(/[*_~`#>[\]()]/g, "").replace(/\s+/g, "").length;
            while (end < content.length && matchedChars < normLen) {
              const ch = content[end].toLowerCase();
              // Skip Markdown decoration chars that are invisible in DOM
              if (ch === "*" || ch === "_" || ch === "~" || ch === "`" ||
                  ch === "#" || ch === ">" || ch === "[" || ch === "]" ||
                  ch === "(" || ch === ")") {
                end++;
                continue;
              }
              if (!/\s/.test(ch)) matchedChars++;
              else if (matchedChars > 0) matchedChars++; // count a space in the middle
              end++;
            }
            // Only use the tightened end if it's within a reasonable bound
            if (end > rawOffset && end <= rawOffset + manual.text.length + 50) {
              splice = { start: rawOffset, end };
            }
          }
        }

        // Fallback: if offset is -1 or verification failed, use the normalised
        // occurrence-based search (legacy path) as a safe fallback.
        if (!splice) {
          splice = locateNthOccurrenceInContent(content, manual.text, 0);
        }

        if (!splice) {
          // Last resort: try AI-finding locator with a synthetic markup shape
          splice = locateClauseForSplice(content, markup);
        }
      } else {
        splice = locateClauseForSplice(content, markup);
      }

      if (!splice) {
        const preview = markup.original.slice(0, 80).replace(/\n/g, "↵");
        throw new Error(
          `Could not locate clause in document for replacement.\n` +
          `clauseId: ${markup.clauseId}\n` +
          `charOffset: ${markup.charOffset ?? "none"}\n` +
          `Preview: "${preview}…"\n` +
          `Document length: ${content.length} chars.\n` +
          `Try re-running evaluation or check that the document has not changed since loading.`
        );
      }

      const updatedContent =
        content.slice(0, splice.start) + markup.replacement + content.slice(splice.end);

      const nextVersion = (activeDoc.versions?.length || 1) + 1;
      const minAnimation = new Promise((resolve) => setTimeout(resolve, 950));

      await Promise.all([
        saveNegotiationStep(authToken, activeDoc.id, updatedContent, nextVersion),
        minAnimation,
      ]);

      setActiveDoc((prev) => (prev ? { ...prev, content: updatedContent } : prev));
      const remaining = agentMarkups.filter((m) => m.clauseId !== markup.clauseId);
      setAgentMarkups(remaining);
      setSelectedMarkup(remaining[0] ?? null);
      setEditingReplacement(false);
      // Record the exact splice position in the updated content so the green
      // flash renderer can target the correct occurrence rather than using a
      // first-match regex search.
      setAppliedClause({ id: markup.clauseId, text: markup.replacement, spliceStart: splice.start });
      clearManualSelection(); // ← always clear after accept
      onRefresh();
      window.setTimeout(() => {
        setAppliedClause((current) => (current?.id === markup.clauseId ? null : current));
      }, 2200);
    } catch (err: any) {
      showNegotiateError(err.message || "Failed to apply change.");
    } finally {
      setAcceptingMarkupId(null);
    }
  };

  const handleDismissMarkup = (clauseId: string) => {
    const remaining = agentMarkups.filter((m) => m.clauseId !== clauseId);
    setAgentMarkups(remaining);
    setSelectedMarkup(remaining[0] ?? null);
    setEditingReplacement(false);
    // Only clear the manual selection when the dismissed markup IS the manual
    // draft for that selection. Rejecting an independent AI finding must not
    // disturb a pending manual selection the user has made separately.
    if (clauseId.startsWith("manual-")) {
      clearManualSelection();
    }
  };

  const handleSaveDraft = async () => {
    if (!activeDoc || saving) return;
    setSaving(true);
    try {
      const currentVersion = activeDoc.versions?.length || 1;
      await saveNegotiationStep(authToken, activeDoc.id, activeDoc.content, currentVersion);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
      onRefresh();
      // Refresh the document record (versions, redlines, signatures) WITHOUT
      // triggering a full LLM re-evaluation. The document content has not changed
      // from the user's perspective — Accept already updated it in-memory.
      // Calling loadActiveDocumentDetails here would re-run evaluation and waste
      // LLM credits on a document whose findings are still current.
      try {
        const refreshed = await fetchDocumentDetails(authToken, activeDoc.id);
        setActiveDoc(refreshed);
      } catch {
        // Non-fatal — the in-memory copy is still valid if the refresh fails.
      }
    } catch (err: any) {
      showNegotiateError("Failed to save draft: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportDocument = async (format: "pdf" | "docx") => {
    if (!activeDoc) return;
    try {
      const blob = await exportDocument(authToken, activeDoc.id, activeDoc.title, activeDoc.content, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeDoc.title.toLowerCase().replace(/\s+/g, "_")}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      showNegotiateError("Export failed: " + err.message);
    }
  };

  const handleAcceptDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      await acceptRedline(authToken, activeDoc.id, rId);
      onRefresh();
      // BLOCKER-2 FIX: refresh document data WITHOUT triggering LLM re-evaluation.
      // Previously called loadActiveDocumentDetails() which unconditionally calls
      // runMultiAgentEvaluation() — consuming LLM credits and resetting review state.
      // Follow the same pattern as handleSaveDraft: fetch the doc record directly.
      try {
        const refreshed = await fetchDocumentDetails(authToken, activeDoc.id);
        setActiveDoc(refreshed);
      } catch {
        // Non-fatal — the in-memory copy is still valid if the refresh fails.
      }
    } catch (err: any) { showNegotiateError(err.message); }
  };

  const handleRejectDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      await rejectRedline(authToken, activeDoc.id, rId);
      onRefresh();
      // BLOCKER-2 FIX: same as handleAcceptDbRedline above.
      try {
        const refreshed = await fetchDocumentDetails(authToken, activeDoc.id);
        setActiveDoc(refreshed);
      } catch {
        // Non-fatal.
      }
    } catch (err: any) { showNegotiateError(err.message); }
  };

  const handleDocumentPaneClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const highlight = target.closest("[data-clause-id]") as HTMLElement | null;
    if (!highlight) return;
    const clauseId = highlight.dataset.clauseId;
    const markup = agentMarkups.find((m) => m.clauseId === clauseId);
    if (markup) { setSelectedMarkup(markup); setEditingReplacement(false); }
  };

  const updateMarkupReplacement = (val: string) => {
    setSelectedMarkup((prev) => prev ? { ...prev, replacement: val } : null);
    setAgentMarkups((prev) =>
      prev.map((m) => m.clauseId === selectedMarkup?.clauseId ? { ...m, replacement: val } : m)
    );
  };

  const rerunEvaluation = () => {
    if (!activeDoc) return;
    setEvaluatingDocId(null);
    runMultiAgentEvaluation(activeDoc.id, activeDoc.content, { title: activeDoc.title, type: activeDoc.type });
  };

  /**
   * Phase 3+4: Fetch context → generate strategy (if needed) → draft the
   * selected tier in a single click.
   *
   * When a manual text selection is stored in manualSelectionRef, it takes
   * priority over the currently active AI finding. The selected text becomes
   * the negotiation target and a synthetic AgentMarkup is injected so the
   * existing Accept/Reject flow works without any additional changes.
   *
   * The strategy is generated once and cached in state. Subsequent tier
   * switches re-use the cached strategy and only call /compromise again.
   */
  const draftFromStrategy = async (tier: "preferred" | "balanced" | "fallback") => {
    if (!activeDoc) return;
    if (draftingCompromise) return;

    // ── Check for a pending manual selection ─────────────────────────────────
    const manual = manualSelectionRef.current;
    const hasManualSelection = manual !== null && manual.text.trim().length >= 5;

    // For manual selections we need at least a non-empty instruction so the AI
    // knows what the user wants changed.
    if (hasManualSelection && !userInstruction.trim()) return;

    // When there is no manual selection fall back to the AI-finding path which
    // requires selectedMarkup.
    if (!hasManualSelection && !selectedMarkup) return;

    setDraftingCompromise(true);
    setStrategyDraftResult(null);

    try {
      const effectiveInstruction = userInstruction.trim();

      // ── Manual-selection path ─────────────────────────────────────────────
      if (hasManualSelection && manual) {
        // Build a synthetic clauseId. The rawContentOffset is stored in
        // charOffset on the synthetic markup so handleAcceptAgentMarkup can
        // use it directly as a splice anchor (BLOCKER-1 fix).
        const syntheticId = `manual-${Date.now()}`;

        // Fetch context for the selected text (enrichment fields will mostly
        // be undefined since this isn't an AI finding — that's fine).
        let ctx: NegotiationContext | null = null;
        try {
          ctx = await fetchNegotiationContext(authToken, {
            documentId: activeDoc.id,
            original: manual.text,
            clauseId: syntheticId,
            userInstruction: effectiveInstruction,
            playbookId: selectedPlaybook?.id,
          });
        } catch {
          // Non-fatal: proceed without enriched context.
        }

        // Draft directly using the legacy compromise path — for manually
        // selected text we do not need a Preferred/Balanced/Fallback strategy
        // ladder; the user's explicit instruction is the primary directive.
        const riskExplanation =
          `User-selected clause for revision.\nUser instruction: ${effectiveInstruction}`;

        const result = await generateCompromise(
          authToken,
          manual.text,
          riskExplanation,
          false,
          effectiveInstruction,
        ) as string;

        const draft: StrategyDraftResult = {
          result,
          draftMeta: {
            tier,
            position: effectiveInstruction,
            source: "ai",
            rationale: "Manually selected clause — user-directed revision.",
          },
        };

        setStrategyDraftResult(draft);

        // Inject a synthetic markup so Accept/Reject/highlight all work.
        // charOffset carries the raw-content offset computed at selection time
        // (BLOCKER-1 fix). The Accept path reads manualSelectionRef.rawContentOffset
        // directly, but charOffset is set here for consistency/future use.
        const syntheticMarkup: AgentMarkup = {
          clauseId:    syntheticId,
          original:    manual.text,
          replacement: result,
          reasoning:   effectiveInstruction,
          riskLevel:   "YELLOW",
          clauseType:  "other",
          charOffset:  manual.rawContentOffset >= 0 ? manual.rawContentOffset : undefined,
        };

        // Add to the markups list (or update if already present from a
        // previous manual draft of the same selection).
        setAgentMarkups((prev) => {
          const withoutStale = prev.filter((m) => !m.clauseId.startsWith("manual-"));
          return [...withoutStale, syntheticMarkup];
        });
        setSelectedMarkup(syntheticMarkup);
        setNegotiationContext(ctx);
        setNegotiationStrategy(null);
        return;
      }

      // ── AI-finding path (unchanged) ───────────────────────────────────────
      if (!selectedMarkup) return;

      let ctx: NegotiationContext | null = negotiationContext;
      if (!ctx) {
        try {
          ctx = await fetchNegotiationContext(authToken, {
            documentId: activeDoc.id,
            original: selectedMarkup.original,
            clauseId: selectedMarkup.clauseId,
            clauseType: selectedMarkup.clauseType,
            charOffset: selectedMarkup.charOffset,
            userInstruction: effectiveInstruction,
            playbookId: selectedPlaybook?.id,
          });
          setNegotiationContext(ctx);
        } catch (ctxErr) {
          console.warn("[negotiate] context fetch failed, continuing without enriched context:", ctxErr);
        }
      }

      let strategy: NegotiationStrategy | null = negotiationStrategy;
      if (!strategy && ctx) {
        try {
          strategy = await fetchNegotiationStrategy(authToken, ctx);
          setNegotiationStrategy(strategy);
        } catch (stratErr) {
          console.warn("[negotiate] strategy fetch failed, continuing without strategy:", stratErr);
        }
      }

      const riskExplanation = ctx?.analysisFinding?.issue
        ? `${selectedMarkup.reasoning}\n\nAnalysis: ${ctx.analysisFinding.issue}`
        : selectedMarkup.reasoning;

      let draft: StrategyDraftResult;

      if (strategy) {
        const position = strategy[tier];
        draft = await generateCompromise(
          authToken,
          selectedMarkup.original,
          riskExplanation,
          false,
          effectiveInstruction || undefined,
          {
            strategyPosition: {
              ...position,
              tier,
              confidence: strategy.confidence,
            },
            analysisFinding: ctx?.analysisFinding,
            compareFinding:  ctx?.compareFinding,
            playbookRule:    ctx?.playbookRule,
          }
        ) as StrategyDraftResult;
      } else {
        const result = await generateCompromise(
          authToken,
          selectedMarkup.original,
          riskExplanation,
          tier === "preferred",
          effectiveInstruction || undefined,
        ) as string;
        draft = {
          result,
          draftMeta: {
            tier,
            position: tier,
            source: "ai",
            rationale: "Drafted without strategy context.",
          },
        };
      }

      setStrategyDraftResult(draft);
      setSelectedMarkup((prev) => prev ? { ...prev, replacement: draft.result } : null);
      setAgentMarkups((prev) =>
        prev.map((m) =>
          m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: draft.result } : m
        )
      );
    } catch (err: any) {
      showNegotiateError("Error drafting proposal: " + err.message);
    } finally {
      setDraftingCompromise(false);
    }
  };

  return {
    activeDoc, agentMarkups, selectedMarkup, setSelectedMarkup,
    evaluating, evaluationError, setEvaluationError, acceptingMarkupId, appliedClause,
    editingReplacement, setEditingReplacement, redlinesOpen, setRedlinesOpen,
    draftingCompromise, handleAcceptAgentMarkup,
    handleDismissMarkup, handleAcceptDbRedline, handleRejectDbRedline,
    handleDocumentPaneClick, updateMarkupReplacement,
    rerunEvaluation, loadActiveDocumentDetails, saving, showSavedToast,
    handleSaveDraft, handleExportDocument,
    userInstruction, setUserInstruction,
    selectedPlaybook, setSelectedPlaybook,
    negotiationContext,
    negotiationStrategy,
    strategyDraftResult,
    draftFromStrategy,
    handleTextSelection,
    hasManualSelection,
    manualSelectionText,
    clearManualSelection,
    negotiateError,
    clearNegotiateError,
  };
}
