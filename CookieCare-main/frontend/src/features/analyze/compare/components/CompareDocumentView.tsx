/**
 * CompareDocumentView
 *
 * Three-pane comparison workspace — PDF rendering with change-type highlights.
 *
 *   ┌────────────────────────┬────────────────────────┬──────────────────┐
 *   │  ORIGINAL PDF          │  MODIFIED PDF          │  FINDINGS RAIL   │
 *   │  (rendered pages)      │  (rendered pages)      │  Summary header  │
 *   │  Change-type highlights│  Change-type highlights│  Material / Risk │
 *   │  Selected = blue ring  │  Selected = blue ring  │  Finding cards   │
 *   └────────────────────────┴────────────────────────┴──────────────────┘
 *
 * Visual design principles:
 *   - Change type  → color  (Removed=red, Added=blue, Broader=amber,
 *                            Narrower=purple, Neutral=gray)
 *   - Risk severity → badge (HIGH=dark, MEDIUM=outlined, LOW=muted)
 *   - These two color systems NEVER overlap
 *   - Document panes are visually neutral — labeled Original / Modified only
 *   - Selected finding → blue outline ring (does not destroy change-type color)
 *   - Evidence is inline in the selected card; no disconnected bottom strip
 *
 * Count terminology:
 *   - "Material Changes" = unique clause pairs with a material diff (not
 *     FindingViewModel count, which inflates when one pair has multiple risks)
 *   - "Risks" = total number of risk findings
 */

import {
  useState, useMemo, useCallback, useRef, useEffect,
} from "react";
import {
  FileText, Search, X, ChevronDown, ChevronUp, ArrowRight,
} from "lucide-react";
import {
  COMPARE_RISK_BADGE,
  CHANGE_TYPE_STYLE,
  CATEGORY_LABELS,
  SELECTED_FINDING_OUTLINE,
} from "../constants";
import {
  normalizeCompareData,
  filterFindings,
  DEFAULT_FILTERS,
  type FindingViewModel,
  type NormalizedCompareData,
  type ClauseRecord,
  type FindingFilters,
  type ChangeTypeFilter,
  type SeverityFilter,
  type SortOrder,
  type DraftingFinding,
} from "../utils/normalizeFindings";
import { computeInlineDiff, extractChangedWords, type DiffSpan } from "../utils/diffHighlight";
import { PdfDocumentPane } from "./PdfDocumentPane";
import { usePdfPageMap } from "../hooks/usePdfPageMap";
import { usePdfSource } from "../hooks/usePdfSource";
import type { CompareResult, CompareClauseRecord, AtomicChange } from "../../../randtrustAI/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompareNavState {
  selectedIndex: number;
  filteredLength: number;
  handlePrev: () => void;
  handleNext: () => void;
}

interface CompareDocumentViewProps {
  result: CompareResult;
  fileA: string;
  fileB: string;
  onNavStateChange?: (state: CompareNavState) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortName(name: string, max = 30) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

const CLASS_RANK: Record<string, number> = {
  REMOVED: 5,
  ADDED: 5,
  MODIFIED_BROADER: 4,
  MODIFIED_NARROWER: 4,
  NEUTRAL_REPHRASE: 1,
};

function changeTypeStyle(classification: string | null | undefined) {
  return CHANGE_TYPE_STYLE[classification ?? ""] ?? CHANGE_TYPE_STYLE.NEUTRAL_REPHRASE;
}

/** "tls_in_transit" → "TLS in transit". Cosmetic only — never alters meaning. */
function humanizeTopic(topic: string): string {
  const words = topic.split("_").filter(Boolean);
  return words
    .map((w) => (w.length <= 4 && w === w.toLowerCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * FIX 8: Granular "what changed" bullets — one line per backend-provided
 * AtomicChange (e.g. "TLS → TLS 1.2+"). Renders only real pipeline data;
 * falls back to nothing (caller keeps the existing full-text evidence) when
 * the diff carries no atomic changes.
 */
function AtomicChangesList({ changes }: { changes: AtomicChange[] }) {
  return (
    <div className="mb-2 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-2">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">
        What changed
      </p>
      <ul className="space-y-1">
        {changes.map((c, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-[#374151]">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#9CA3AF]" aria-hidden />
            <span>
              <span className="font-medium text-[#111827]">{humanizeTopic(c.topic)}:</span>{" "}
              <span className="font-mono text-[10.5px] text-[#991B1B] line-through decoration-[#EF9999]">
                {c.originalSnippet}
              </span>{" "}
              <span aria-hidden>→</span>{" "}
              <span className="font-mono text-[10.5px] text-[#065F46]">{c.modifiedSnippet}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * FIX 7: Heuristic guard for the known "clause heading captured, body lost"
 * extraction gap (e.g. Mastercard "3.10. Liability. The Parties agree that:").
 * When the Original side is implausibly short next to a much longer Modified
 * counterpart — and looks like a truncated intro (ends with a colon) — say so
 * instead of silently presenting a fragment as the complete original clause.
 * This never fabricates text; it only labels a known extraction limitation.
 */
function isSuspiciouslyShortOriginal(originalText: string, modifiedText: string): boolean {
  const trimmed = originalText.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  if (modifiedText.trim().length < trimmed.length * 3) return false;
  return /[:;]$/.test(trimmed);
}

// ─── Inline diff spans renderer ───────────────────────────────────────────────

function SpanText({ spans, plain }: { spans: DiffSpan[] | null; plain: string }) {
  if (!spans) return <>{plain}</>;
  return (
    <>
      {spans.map((span, i) => {
        if (span.type === "equal") return <span key={i}>{span.text}</span>;
        if (span.type === "removed") {
          return (
            <mark
              key={i}
              className="rounded-[2px] bg-[#FEE2E2]/80 px-[1px] text-[#991B1B]"
              style={{ textDecoration: "line-through", textDecorationColor: "#EF9999" }}
            >
              {span.text}
            </mark>
          );
        }
        return (
          <mark key={i} className="rounded-[2px] bg-[#DBEAFE]/80 px-[1px] text-[#1D4ED8]">
            {span.text}
          </mark>
        );
      })}
    </>
  );
}

// ─── Single clause block inside the text-fallback document pane ──────────────

function ClauseBlock({
  clause,
  spans,
  isSelected,
  isChanged,
  classification,
}: {
  clause: ClauseRecord;
  spans: DiffSpan[] | null;
  isSelected: boolean;
  isChanged: boolean;
  classification: string | null;
}) {
  const accent =
    classification === "REMOVED"
      ? "#DC2626"
      : classification === "ADDED"
        ? "#2563EB"
        : classification === "MODIFIED_BROADER"
          ? "#D97706"
          : classification === "MODIFIED_NARROWER"
            ? "#7C3AED"
            : "#6B7280";

  return (
    <div
      className={`border-b border-[#F3F4F6] border-l-[3px] px-5 py-4 transition-colors duration-150 ${
        isSelected ? "bg-[#F8FAFF]" : "border-l-transparent"
      }`}
      style={
        isSelected
          ? {
              boxShadow: `inset 0 0 0 2px ${SELECTED_FINDING_OUTLINE}`,
              borderLeftColor: isChanged ? accent : SELECTED_FINDING_OUTLINE,
            }
          : undefined
      }
    >
      {clause.title && (
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          {clause.title}
        </p>
      )}
      <p className="text-[13px] leading-[1.75] text-[#374151]">
        <SpanText spans={isSelected && isChanged ? spans : null} plain={clause.text} />
      </p>
    </div>
  );
}

// ─── Text-fallback document pane ──────────────────────────────────────────────

interface DocPaneProps {
  label: "Original" | "Modified";
  filename: string;
  side: "A" | "B";
  clauses: ClauseRecord[];
  changedClauseIds: Set<string>;
  clauseClassifications: Map<string, string>;
  diffSpansMap: Map<string, { aSpans: DiffSpan[] | null; bSpans: DiffSpan[] | null }>;
  scrollToClauseId: string | null;
}

function DocPane({
  label,
  filename,
  side,
  clauses,
  changedClauseIds,
  clauseClassifications,
  diffSpansMap,
  scrollToClauseId,
}: DocPaneProps) {
  const clauseRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setClauseRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) clauseRefs.current.set(id, el);
      else clauseRefs.current.delete(id);
    },
    []
  );

  useEffect(() => {
    if (!scrollToClauseId) return;
    const el = clauseRefs.current.get(scrollToClauseId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollToClauseId]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[#E4E4E7] last:border-r-0">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[#E4E4E7] bg-white px-5 py-3">
        <FileText className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
        <span className="truncate text-[13px] font-semibold text-[#111827]">
          {shortName(filename, 28)}
        </span>
        <span className="ml-auto shrink-0 rounded-md border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
          {label}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-white">
        {clauses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <p className="text-[13px] text-[#9CA3AF]">No clause text available.</p>
          </div>
        ) : (
          clauses.map((clause) => {
            const diffEntry = diffSpansMap.get(clause.id);
            const spans = side === "A" ? (diffEntry?.aSpans ?? null) : (diffEntry?.bSpans ?? null);
            const isChanged = changedClauseIds.has(clause.id);
            const isSelected = scrollToClauseId === clause.id;
            return (
              <div key={clause.id} ref={setClauseRef(clause.id)}>
                <ClauseBlock
                  clause={clause}
                  spans={spans}
                  isSelected={isSelected}
                  isChanged={isChanged}
                  classification={clauseClassifications.get(clause.id) ?? null}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Findings rail ────────────────────────────────────────────────────────────

interface RailProps {
  data: NormalizedCompareData;
  selectedId: string | null;
  onSelect: (f: FindingViewModel) => void;
  onFilteredListChange: (list: FindingViewModel[]) => void;
  clauseMapA: Map<string, CompareClauseRecord>;
  clauseMapB: Map<string, CompareClauseRecord>;
}

const CHANGE_TYPE_OPTS: { value: ChangeTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ADDED", label: "Added" },
  { value: "REMOVED", label: "Removed" },
  { value: "MODIFIED_BROADER", label: "Broader" },
  { value: "MODIFIED_NARROWER", label: "Narrower" },
];

const SEVERITY_OPTS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "none", label: "No risk" },
];

const SORT_OPTS: { value: SortOrder; label: string }[] = [
  { value: "severity", label: "Severity" },
  { value: "position", label: "Order" },
];

function FindingsRail({
  data,
  selectedId,
  onSelect,
  onFilteredListChange,
  clauseMapA,
  clauseMapB,
}: RailProps) {
  const [filters, setFilters] = useState<FindingFilters>(DEFAULT_FILTERS);
  const [draftingOpen, setDraftingOpen] = useState(false);

  const setFilter = useCallback(<K extends keyof FindingFilters>(k: K, v: FindingFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
  }, []);

  const filteredFindings = useMemo(
    () => filterFindings(data.findings, filters),
    [data.findings, filters]
  );

  useEffect(() => {
    onFilteredListChange(filteredFindings);
  }, [filteredFindings, onFilteredListChange]);

  const hasFilters =
    filters.search !== "" ||
    filters.changeType !== "all" ||
    filters.severity !== "all" ||
    filters.sort !== "severity";

  // ── FIX 3: counts from normalizeCompareData use correct terminology ───────
  //
  // materialPairs = unique pair IDs among material findings (not VM count).
  // riskFindings  = total risk finding count (may be > materialPairs when one
  //                 pair has multiple risks).
  // byType breakdown de-dupes by pairId so it always equals materialPairs total.
  const { high, medium, low, materialPairs, riskFindings, merged, uncertain } = data.counts;

  const materialByType = useMemo(() => {
    const seen = new Set<string>();
    const byType: Record<string, number> = {
      REMOVED: 0, ADDED: 0, MODIFIED_BROADER: 0, MODIFIED_NARROWER: 0,
    };
    for (const f of data.findings) {
      const key = f.pair?.id ?? f.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const cls = f.diff?.classification;
      if (cls && cls in byType) byType[cls] += 1;
    }
    return byType;
  }, [data.findings]);

  // Scroll selected card into view
  useEffect(() => {
    if (!selectedId) return;
    const el = document.getElementById(`finding-card-${selectedId}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // Whether structural context (MERGED/UNCERTAIN) is worth surfacing
  const hasStructuralContext = merged > 0 || uncertain > 0;

  return (
    <div className="flex h-full flex-col bg-white">

      {/* ── Summary header ── */}
      <div className="shrink-0 border-b border-[#E4E4E7] px-3 pt-3 pb-2.5 space-y-2.5">

        {/* Material Changes — count is unique pairs, not FindingViewModel count */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11.5px] font-semibold text-[#111827]">Material Changes</p>
            <span className="text-[11px] font-bold tabular-nums text-[#111827]">
              {materialPairs}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(
              [
                ["REMOVED", "Removed"],
                ["ADDED", "Added"],
                ["MODIFIED_BROADER", "Broader"],
                ["MODIFIED_NARROWER", "Narrower"],
              ] as const
            ).map(([key, label]) => {
              const n = materialByType[key];
              if (!n) return null;
              const style = CHANGE_TYPE_STYLE[key];
              return (
                <span key={key} className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${style.badge}`}>
                  {n} {label}
                </span>
              );
            })}
            {materialPairs === 0 && (
              <span className="text-[10px] text-[#9CA3AF]">None detected</span>
            )}
          </div>
        </div>

        <div className="border-t border-[#F3F4F6]" />

        {/* Risks — actual risk finding count */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11.5px] font-semibold text-[#111827]">Risks</p>
            <span className="text-[11px] font-bold tabular-nums text-[#111827]">
              {riskFindings}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {high > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${COMPARE_RISK_BADGE.HIGH.badge}`}>
                {high} HIGH
              </span>
            )}
            {medium > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${COMPARE_RISK_BADGE.MEDIUM.badge}`}>
                {medium} MEDIUM
              </span>
            )}
            {low > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${COMPARE_RISK_BADGE.LOW.badge}`}>
                {low} LOW
              </span>
            )}
            {riskFindings === 0 && (
              <span className="text-[10px] text-[#9CA3AF]">None scored</span>
            )}
          </div>
        </div>

        {/* FIX 4/5: Comparison context — MERGED / UNCERTAIN, plain language,
            visually secondary to Material Changes / Risks above. Uses the
            backend's relationshipType-derived counts directly (see
            normalizeFindings.ts) — never re-derived from heuristics here. */}
        {hasStructuralContext && (
          <>
            <div className="border-t border-[#F3F4F6]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                Comparison context
              </p>
              <p className="mt-1 text-[10.5px] leading-snug text-[#6B7280]">
                {merged > 0 && (
                  <>
                    <span className="font-semibold text-[#6D28D9]">{merged}</span> clause{merged === 1 ? "" : "s"} consolidated
                  </>
                )}
                {merged > 0 && uncertain > 0 && " · "}
                {uncertain > 0 && (
                  <>
                    <span className="font-semibold text-[#6B7280]">{uncertain}</span> clause{uncertain === 1 ? "" : "s"} could not be confidently matched
                  </>
                )}
              </p>
              <p className="mt-1 text-[9.5px] text-[#C4C9D4] leading-snug">
                Shown for context only — not counted in Material Changes or Risks above.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Search ── */}
      <div className="shrink-0 border-b border-[#F0F0F2] px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-[#F9FAFB] px-2.5 py-1.5 focus-within:border-[#2175D9] focus-within:bg-white transition-colors">
          <Search className="h-3 w-3 shrink-0 text-[#9CA3AF]" aria-hidden />
          <input
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Search findings…"
            aria-label="Search findings"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilter("search", "")}
              className="text-[#9CA3AF] hover:text-[#374151]"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="shrink-0 border-b border-[#F0F0F2] px-3 py-1.5 space-y-1.5">
        <div className="flex flex-wrap gap-1">
          {CHANGE_TYPE_OPTS.map((o) => {
            const isActive = filters.changeType === o.value;
            const style = o.value !== "all" ? CHANGE_TYPE_STYLE[o.value] : null;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setFilter("changeType", o.value)}
                className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                  isActive
                    ? style
                      ? style.badge + " ring-1 ring-inset ring-current/30"
                      : "bg-[#2175D9] text-white"
                    : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1">
            {SEVERITY_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setFilter("severity", o.value)}
                className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                  filters.severity === o.value
                    ? "bg-[#111827] text-white"
                    : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[9.5px] text-[#C4C9D4] font-medium">Sort</span>
            {SORT_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setFilter("sort", o.value)}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  filters.sort === o.value
                    ? "bg-[#F0F5FF] text-[#2175D9]"
                    : "text-[#9CA3AF] hover:text-[#374151]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-[10px] font-medium text-[#9CA3AF] hover:text-[#374151]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Material findings list ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredFindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <p className="text-[12px] text-[#9CA3AF]">
              {hasFilters ? "No findings match the filters." : "No material findings detected."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="mt-1.5 text-[11px] font-medium text-[#2175D9] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredFindings.map((f, idx) => (
            <FindingCard
              key={f.id}
              finding={f}
              index={idx}
              selected={f.id === selectedId}
              onSelect={() => onSelect(f)}
              clauseMapA={clauseMapA}
              clauseMapB={clauseMapB}
            />
          ))
        )}

        {/* Drafting / Non-material — collapsed by default */}
        {data.draftingChanges.length > 0 && (
          <div className="border-t border-[#E4E4E7]">
            <button
              type="button"
              onClick={() => setDraftingOpen((v) => !v)}
              aria-expanded={draftingOpen}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[#F9FAFB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2175D9]"
            >
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Drafting / Non-material
                </p>
                <p className="text-[10px] text-[#C4C9D4]">
                  {data.draftingChanges.length} neutral rephrases · no material impact
                </p>
              </div>
              {draftingOpen ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#C4C9D4]" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#C4C9D4]" />
              )}
            </button>
            {draftingOpen &&
              data.draftingChanges.map((f) => (
                <DraftingCard
                  key={f.id}
                  finding={f}
                  selected={f.id === selectedId}
                  onSelect={() => onSelect(f as unknown as FindingViewModel)}
                  clauseMapA={clauseMapA}
                  clauseMapB={clauseMapB}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Finding evidence (inline in selected card) ───────────────────────────────

/**
 * FIX 4: ADDED/REMOVED evidence uses clause title + text directly.
 *
 * When semanticSummary is empty (always the case for ADDED/REMOVED — the
 * backend emits "" for these), the clause title and full text provide the
 * evidence. Absence on each side is explicitly labelled:
 *   ADDED   → Original side shows "Not present in Original"
 *   REMOVED → Modified side shows "Not present in Modified"
 */
function FindingEvidence({
  classification,
  clauseA,
  clauseB,
  changes,
}: {
  classification: string | null | undefined;
  clauseA: CompareClauseRecord | null;
  clauseB: CompareClauseRecord | null;
  changes?: AtomicChange[];
}) {
  const { aSpans, bSpans } = useMemo(() => {
    // Only compute diff spans for MODIFIED_* — ADDED/REMOVED have one side null
    if (!clauseA?.text || !clauseB?.text) return { aSpans: null, bSpans: null };
    return computeInlineDiff(clauseA.text, clauseB.text);
  }, [clauseA?.text, clauseB?.text]);

  if (!clauseA && !clauseB) return null;

  const isAdded = classification === "ADDED";
  const isRemoved = classification === "REMOVED";

  // FIX 7: known extraction gap — Original clause looks like a truncated
  // heading/intro rather than the full clause body. Label it, don't hide it.
  const originalLooksTruncated =
    Boolean(clauseA?.text) &&
    Boolean(clauseB?.text) &&
    isSuspiciouslyShortOriginal(clauseA!.text, clauseB!.text);

  return (
    <div className="mt-2 space-y-1.5">
      {/* FIX 8: granular evidenced edits, when the backend provided any */}
      {changes && changes.length > 0 && <AtomicChangesList changes={changes} />}

      {/* Original pane */}
      <div className="rounded-md border border-[#E5E7EB] bg-[#FAFAFA] px-2.5 py-2">
        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">
          Original
        </p>
        {clauseA ? (
          <>
            {clauseA.title && (
              <p className="mb-0.5 text-[10px] font-semibold text-[#6B7280]">{clauseA.title}</p>
            )}
            <p className="max-h-[88px] overflow-y-auto text-[11px] leading-snug text-[#374151] scrollbar-thin">
              <SpanText spans={aSpans} plain={clauseA.text} />
            </p>
            {originalLooksTruncated && (
              <p className="mt-1 text-[10px] italic text-[#9CA3AF]">
                Limited original clause text was extracted for this section — showing all available text.
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] italic text-[#9CA3AF]">
            {isAdded ? "Not present in Original" : "Text unavailable"}
          </p>
        )}
      </div>

      {/* Modified pane */}
      <div className="rounded-md border border-[#E5E7EB] bg-[#FAFAFA] px-2.5 py-2">
        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">
          Modified
        </p>
        {clauseB ? (
          <>
            {clauseB.title && (
              <p className="mb-0.5 text-[10px] font-semibold text-[#6B7280]">{clauseB.title}</p>
            )}
            <p className="max-h-[88px] overflow-y-auto text-[11px] leading-snug text-[#374151] scrollbar-thin">
              <SpanText spans={bSpans} plain={clauseB.text} />
            </p>
          </>
        ) : (
          <p className="text-[11px] italic text-[#9CA3AF]">
            {isRemoved ? "Not present in Modified" : "Text unavailable"}
          </p>
        )}
      </div>

      {/* Inline diff legend — only shown when both sides have text (MODIFIED_*) */}
      {clauseA?.text && clauseB?.text && (
        <div className="flex items-center gap-3 pt-0.5">
          <span className="flex items-center gap-1 text-[9.5px] text-[#9CA3AF]">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#FEE2E2]" />
            Removed
          </span>
          <span className="flex items-center gap-1 text-[9.5px] text-[#9CA3AF]">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#DBEAFE]" />
            Added
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Finding card ─────────────────────────────────────────────────────────────

/**
 * Hierarchy: section/module → change type badge → [MOVED] → risk badge →
 * title → summary / evidence (expanded on select).
 *
 * FIX 4: For ADDED/REMOVED findings the explanation falls back to a clear
 * description derived from the clause title when semanticSummary is empty.
 *
 * FIX 5: MOVED findings show a subtle "Moved" pill next to the change badge.
 */
function FindingCard({
  finding,
  index,
  selected,
  onSelect,
  clauseMapA,
  clauseMapB,
}: {
  finding: FindingViewModel;
  index: number;
  selected: boolean;
  onSelect: () => void;
  clauseMapA: Map<string, CompareClauseRecord>;
  clauseMapB: Map<string, CompareClauseRecord>;
}) {
  const risk = finding.risk;
  const diff = finding.diff;
  const riskMeta = risk ? (COMPARE_RISK_BADGE[risk.level] ?? COMPARE_RISK_BADGE.MEDIUM) : null;
  const changeMeta = diff ? changeTypeStyle(diff.classification) : null;

  // Section / module label
  const moduleLabel =
    finding.sectionLabel ??
    (risk ? (CATEGORY_LABELS[risk.category] ?? risk.category) : null);

  // Title — for ADDED/REMOVED, clauseTitle is the clause heading from clauseA/B
  const title =
    finding.clauseTitle ??
    (risk ? (CATEGORY_LABELS[risk.category] ?? risk.category) : null) ??
    `Change ${index + 1}`;

  // FIX 4: Build a meaningful explanation for ADDED/REMOVED when semanticSummary is "".
  // The backend deliberately leaves it empty for these — use the risk rationale if
  // available, otherwise generate a clear structural description from available data.
  const isAdded = diff?.classification === "ADDED";
  const isRemoved = diff?.classification === "REMOVED";
  const hasSummary = diff?.semanticSummary && diff.semanticSummary.trim().length > 0;

  const explanation: string | null = (() => {
    if (hasSummary) return diff!.semanticSummary;
    if (risk?.rationale) return risk.rationale;
    if (isAdded) {
      const clauseTitle = finding.clauseTitle;
      return clauseTitle
        ? `"${clauseTitle}" is present in the Modified version but has no counterpart in the Original.`
        : "This clause is entirely new in the Modified version — it has no counterpart in the Original.";
    }
    if (isRemoved) {
      const clauseTitle = finding.clauseTitle;
      return clauseTitle
        ? `"${clauseTitle}" was present in the Original but has been removed from the Modified version.`
        : "This clause was present in the Original but does not appear in the Modified version.";
    }
    return null;
  })();

  const extraRationale =
    risk?.rationale && hasSummary && risk.rationale !== diff?.semanticSummary
      ? risk.rationale
      : null;

  // Module-level REMOVED: entire section absent from Modified (clauseB is null)
  const isModuleRemoval =
    isRemoved && !diff?.clauseBId && !finding.pair?.clauseBId;

  const clauseA = useMemo(() => {
    const id = diff?.clauseAId ?? finding.pair?.clauseAId ?? null;
    return id ? (clauseMapA.get(id) ?? null) : null;
  }, [diff?.clauseAId, finding.pair?.clauseAId, clauseMapA]);

  const clauseB = useMemo(() => {
    const id = diff?.clauseBId ?? finding.pair?.clauseBId ?? null;
    return id ? (clauseMapB.get(id) ?? null) : null;
  }, [diff?.clauseBId, finding.pair?.clauseBId, clauseMapB]);

  return (
    <div
      id={`finding-card-${finding.id}`}
      className={`border-b border-[#F0F0F2] transition-colors ${
        selected ? "bg-[#F4F8FF]" : "bg-white hover:bg-[#F9FAFB]"
      }`}
      style={selected ? { boxShadow: `inset 0 0 0 2px ${SELECTED_FINDING_OUTLINE}` } : undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2175D9]"
      >
        {/* Row 1: index + section label + module-removal marker */}
        <div className="mb-1 flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 text-[9.5px] font-semibold tabular-nums text-[#C4C9D4]">
            {String(index + 1).padStart(2, "0")}
          </span>
          {moduleLabel && (
            <span className="truncate text-[10px] font-medium uppercase tracking-wide text-[#9CA3AF]">
              {moduleLabel}
            </span>
          )}
          {isModuleRemoval && (
            <span className="ml-auto shrink-0 rounded bg-[#FEE2E2] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#991B1B]">
              Module removed
            </span>
          )}
        </div>

        {/* Row 2: title */}
        <p className="text-[12px] font-semibold leading-snug text-[#111827]">
          {title.length > 80 ? `${title.slice(0, 80)}…` : title}
        </p>

        {/* Row 3: change type → [MOVED] → risk (two distinct visual systems) */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {/* Change type — color-coded */}
          {changeMeta && diff?.classification !== "UNCHANGED" && (
            <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${changeMeta.badge}`}>
              {changeMeta.label}
            </span>
          )}
          {/* FIX 5: MOVED indicator — subtle, separate from change-type color */}
          {finding.isMoved && (
            <span className="rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[9px] font-medium text-[#6B7280]">
              Moved
            </span>
          )}
          {/* Separator dot */}
          {changeMeta && riskMeta && diff?.classification !== "UNCHANGED" && (
            <span className="text-[#D1D5DB]" aria-hidden>·</span>
          )}
          {/* Risk severity — monochrome, distinct from change type */}
          {riskMeta && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${riskMeta.badge}`}>
              {riskMeta.label}
            </span>
          )}
          {finding.kind === "no-risk" && !riskMeta && (
            <span className="rounded bg-[#F3F4F6] px-1.5 py-0.5 text-[9px] font-medium text-[#9CA3AF]">
              No risk scored
            </span>
          )}
        </div>

        {/* Explanation preview — collapsed state */}
        {explanation && !selected && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[#6B7280]">
            {explanation}
          </p>
        )}
      </button>

      {/* Expanded state */}
      {selected && (
        <div className="px-3 pb-3">
          {explanation && (
            <p className="text-[11.5px] leading-snug text-[#374151]">{explanation}</p>
          )}
          {extraRationale && (
            <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">{extraRationale}</p>
          )}

          {/* Module removal block */}
          {isModuleRemoval && moduleLabel && (
            <div className="mt-2 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-2">
              <p className="text-[11px] font-semibold text-[#991B1B]">
                {moduleLabel} — Removed from Modified document
              </p>
              <p className="mt-0.5 text-[10.5px] text-[#DC2626]/80">
                This entire module was present in the Original but does not appear in the Modified version.
              </p>
            </div>
          )}

          {/* Inline evidence */}
          {!isModuleRemoval && (
            <FindingEvidence
              classification={diff?.classification}
              clauseA={clauseA}
              clauseB={clauseB}
              changes={diff?.changes}
            />
          )}

          <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[#2175D9]">
            <ArrowRight className="h-3 w-3" aria-hidden />
            Navigated to Original and Modified
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Drafting card ────────────────────────────────────────────────────────────

function DraftingCard({
  finding,
  selected,
  onSelect,
  clauseMapA,
  clauseMapB,
}: {
  finding: DraftingFinding;
  selected: boolean;
  onSelect: () => void;
  clauseMapA: Map<string, CompareClauseRecord>;
  clauseMapB: Map<string, CompareClauseRecord>;
}) {
  const changeMeta = changeTypeStyle("NEUTRAL_REPHRASE");
  const clauseA = finding.diff.clauseAId ? (clauseMapA.get(finding.diff.clauseAId) ?? null) : null;
  const clauseB = finding.diff.clauseBId ? (clauseMapB.get(finding.diff.clauseBId) ?? null) : null;

  return (
    <div
      id={`finding-card-${finding.id}`}
      className={`border-b border-[#F3F4F6] transition-colors ${
        selected ? "bg-[#F4F8FF]" : "hover:bg-[#F9FAFB]"
      }`}
      style={selected ? { boxShadow: `inset 0 0 0 2px ${SELECTED_FINDING_OUTLINE}` } : undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full px-3 py-2 text-left focus-visible:outline-none"
      >
        <div className="flex items-start gap-2">
          <span className="mt-[3px] block h-1.5 w-1.5 shrink-0 rounded-full bg-[#D1D5DB]" />
          <div className="min-w-0 flex-1">
            {finding.sectionLabel && (
              <span className="mr-1 text-[9.5px] font-medium uppercase tracking-wide text-[#C4C9D4]">
                {finding.sectionLabel}
              </span>
            )}
            <span className="text-[11.5px] text-[#6B7280]">
              {finding.clauseTitle ?? finding.diff.semanticSummary?.slice(0, 56) ?? "Rephrased clause"}
            </span>
            {/* FIX 5: MOVED indicator on drafting cards too */}
            {finding.isMoved && (
              <span className="ml-1.5 rounded border border-[#E5E7EB] bg-white px-1 py-0.5 text-[9px] font-medium text-[#6B7280]">
                Moved
              </span>
            )}
          </div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${changeMeta.badge}`}>
            {changeMeta.label}
          </span>
        </div>
      </button>
      {selected && (
        <div className="px-3 pb-2.5">
          {finding.diff.semanticSummary && (
            <p className="text-[11px] leading-snug text-[#6B7280]">{finding.diff.semanticSummary}</p>
          )}
          <FindingEvidence
            classification="NEUTRAL_REPHRASE"
            clauseA={clauseA}
            clauseB={clauseB}
          />
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-[#2175D9]">
            <ArrowRight className="h-3 w-3" aria-hidden />
            Navigated to Original and Modified
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompareDocumentView({
  result,
  fileA,
  fileB,
  onNavStateChange,
}: CompareDocumentViewProps) {
  const normalizedData: NormalizedCompareData = useMemo(
    () => normalizeCompareData(result),
    [result]
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    () => normalizedData.findings[0]?.id ?? null
  );
  const [filteredList, setFilteredList] = useState<FindingViewModel[]>(
    () => normalizedData.findings
  );

  const selectedFinding = useMemo(() => {
    if (!selectedId) return null;
    return (
      filteredList.find((f) => f.id === selectedId) ??
      normalizedData.findings.find((f) => f.id === selectedId) ??
      (normalizedData.draftingChanges.find((f) => f.id === selectedId) as FindingViewModel | undefined) ??
      null
    );
  }, [selectedId, filteredList, normalizedData.findings, normalizedData.draftingChanges]);

  const selectedIndex = filteredList.findIndex((f) => f.id === selectedId);

  const clauseMapA = useMemo(() => {
    const m = new Map<string, CompareClauseRecord>();
    for (const c of (result.clausesA ?? []) as CompareClauseRecord[]) m.set(c.id, c);
    return m;
  }, [result.clausesA]);

  const clauseMapB = useMemo(() => {
    const m = new Map<string, CompareClauseRecord>();
    for (const c of (result.clausesB ?? []) as CompareClauseRecord[]) m.set(c.id, c);
    return m;
  }, [result.clausesB]);

  const activeClauseA: CompareClauseRecord | null = useMemo(() => {
    const id = selectedFinding?.diff?.clauseAId ?? selectedFinding?.pair?.clauseAId ?? null;
    return id ? (clauseMapA.get(id) ?? null) : null;
  }, [selectedFinding, clauseMapA]);

  const activeClauseB: CompareClauseRecord | null = useMemo(() => {
    const id = selectedFinding?.diff?.clauseBId ?? selectedFinding?.pair?.clauseBId ?? null;
    return id ? (clauseMapB.get(id) ?? null) : null;
  }, [selectedFinding, clauseMapB]);

  const changedClauseIds = useMemo(() => {
    const s = new Set<string>();
    for (const diff of result.differences ?? []) {
      if (diff.classification === "UNCHANGED") continue;
      if (diff.clauseAId) s.add(diff.clauseAId);
      if (diff.clauseBId) s.add(diff.clauseBId);
    }
    return s;
  }, [result.differences]);

  const clauseClassifications = useMemo(() => {
    const m = new Map<string, string>();
    for (const diff of result.differences ?? []) {
      if (diff.classification === "UNCHANGED") continue;
      const rank = CLASS_RANK[diff.classification] ?? 0;
      for (const id of [diff.clauseAId, diff.clauseBId]) {
        if (!id) continue;
        const prev = m.get(id);
        if (!prev || rank > (CLASS_RANK[prev] ?? 0)) m.set(id, diff.classification);
      }
    }
    return m;
  }, [result.differences]);

  const textDiffSpansMap = useMemo(() => {
    const m = new Map<string, { aSpans: DiffSpan[] | null; bSpans: DiffSpan[] | null }>();
    for (const diff of result.differences ?? []) {
      if (diff.classification === "UNCHANGED") continue;
      const cA = diff.clauseAId ? clauseMapA.get(diff.clauseAId) : null;
      const cB = diff.clauseBId ? clauseMapB.get(diff.clauseBId) : null;
      if (!cA && !cB) continue;
      const { aSpans, bSpans } =
        cA?.text && cB?.text
          ? computeInlineDiff(cA.text, cB.text)
          : { aSpans: null, bSpans: null };
      if (diff.clauseAId) m.set(diff.clauseAId, { aSpans, bSpans });
      if (diff.clauseBId) m.set(diff.clauseBId, { aSpans, bSpans });
    }
    return m;
  }, [result.differences, clauseMapA, clauseMapB]);

  // FIX 2: word-level PDF highlight intensity for the currently selected
  // finding. Reuses textDiffSpansMap (already computed above for every
  // changed clause) so the active pair's changed words are looked up, not
  // recomputed. null when the finding is single-sided (ADDED/REMOVED) or has
  // no word-level diff available — PdfDocumentPane then falls back to the
  // previous whole-clause highlight for that side, so nothing regresses.
  const activeChangedWordsA = useMemo(() => {
    if (!activeClauseA) return null;
    const words = extractChangedWords(textDiffSpansMap.get(activeClauseA.id)?.aSpans ?? null, "removed");
    return words.size > 0 ? words : null;
  }, [activeClauseA, textDiffSpansMap]);

  const activeChangedWordsB = useMemo(() => {
    if (!activeClauseB) return null;
    const words = extractChangedWords(textDiffSpansMap.get(activeClauseB.id)?.bSpans ?? null, "added");
    return words.size > 0 ? words : null;
  }, [activeClauseB, textDiffSpansMap]);

  const { file: pdfFileA, status: statusA } = usePdfSource(result, "original");
  const { file: pdfFileB, status: statusB } = usePdfSource(result, "revised");
  const isPdf = statusA !== "unavailable" || statusB !== "unavailable";

  const { map: mapA, status: mapStatusA, error: mapErrorA } = usePdfPageMap(isPdf ? pdfFileA : null);
  const { map: mapB, status: mapStatusB, error: mapErrorB } = usePdfPageMap(isPdf ? pdfFileB : null);

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedId(filteredList[selectedIndex - 1].id);
  }, [selectedIndex, filteredList]);

  const handleNext = useCallback(() => {
    if (selectedIndex < filteredList.length - 1)
      setSelectedId(filteredList[selectedIndex + 1].id);
  }, [selectedIndex, filteredList]);

  const handleSelect = useCallback((f: FindingViewModel) => setSelectedId(f.id), []);

  const handleFilteredListChange = useCallback((list: FindingViewModel[]) => {
    setFilteredList(list);
    setSelectedId((cur) => {
      const still = list.some((f) => f.id === cur);
      return still ? cur : (list[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    onNavStateChange?.({
      selectedIndex,
      filteredLength: filteredList.length,
      handlePrev,
      handleNext,
    });
  }, [selectedIndex, filteredList.length, handlePrev, handleNext, onNavStateChange]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F7F8FB]">
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {isPdf ? (
          <PdfDocumentPane
            file={pdfFileA}
            label="Original"
            filename={fileA}
            side="A"
            activeClause={activeClauseA}
            activeClassification={selectedFinding?.diff?.classification ?? null}
            changedWords={activeChangedWordsA}
            allChangedClauseIds={changedClauseIds}
            clauseClassifications={clauseClassifications}
            allClauses={(result.clausesA ?? []) as CompareClauseRecord[]}
            pdfMap={mapA}
            mapStatus={mapStatusA}
            mapError={mapErrorA}
          />
        ) : (
          <DocPane
            label="Original"
            filename={fileA}
            side="A"
            clauses={normalizedData.clausesA}
            changedClauseIds={changedClauseIds}
            clauseClassifications={clauseClassifications}
            diffSpansMap={textDiffSpansMap}
            scrollToClauseId={activeClauseA?.id ?? null}
          />
        )}

        {isPdf ? (
          <PdfDocumentPane
            file={pdfFileB}
            label="Modified"
            filename={fileB}
            side="B"
            activeClause={activeClauseB}
            activeClassification={selectedFinding?.diff?.classification ?? null}
            changedWords={activeChangedWordsB}
            allChangedClauseIds={changedClauseIds}
            clauseClassifications={clauseClassifications}
            allClauses={(result.clausesB ?? []) as CompareClauseRecord[]}
            pdfMap={mapB}
            mapStatus={mapStatusB}
            mapError={mapErrorB}
          />
        ) : (
          <DocPane
            label="Modified"
            filename={fileB}
            side="B"
            clauses={normalizedData.clausesB}
            changedClauseIds={changedClauseIds}
            clauseClassifications={clauseClassifications}
            diffSpansMap={textDiffSpansMap}
            scrollToClauseId={activeClauseB?.id ?? null}
          />
        )}

        <aside
          className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-[#E4E4E7] xl:w-[300px]"
          aria-label="Findings"
        >
          <FindingsRail
            data={normalizedData}
            selectedId={selectedId}
            onSelect={handleSelect}
            onFilteredListChange={handleFilteredListChange}
            clauseMapA={clauseMapA}
            clauseMapB={clauseMapB}
          />
        </aside>
      </div>
    </div>
  );
}
