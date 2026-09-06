import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ChatMessage, CompareResult } from "../../../randtrustAI/types";
import type { ComposerProps } from "../../../randtrustAI/components/Composer";
import type { CompareHistoryEntry } from "../utils/compareHistory";
import { RISK_BADGE, COMPARE_RISK_BADGE } from "../constants";
import { CompareChatToolbar } from "./CompareChatToolbar";
import { CompareAnalyzingState } from "./CompareAnalyzingState";
import { CompareAskPanel, type CompareNote } from "./CompareAskPanel";
import { CompareFindingInspector, type CompareInspectTarget } from "./CompareFindingInspector";
import { CompareAlignRow, CompareDiffRow, CompareRiskRow } from "./CompareFindingRow";
import { CompareDocumentView, type CompareNavState } from "./CompareDocumentView";

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

// Top-level view selector — kept for the Report fallback path type only
type ResultsView = "summary" | "risks" | "changes";

interface CompareResultsStateProps {
  messages: ChatMessage[];
  isLoading: boolean;
  originalName?: string;
  revisedName?: string;
  composerProps: Omit<ComposerProps, "placeholder">;
  onReset: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  historyEntries: CompareHistoryEntry[];
  activeHistoryId?: string | null;
  onSelectHistory: (entry: CompareHistoryEntry) => void;
  onDeleteHistory: (id: string) => void;
}

function shortName(name: string, max = 36) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function stripMd(text: string) {
  return text.replace(/\*\*/g, "").trim();
}

function extractNotes(messages: ChatMessage[]): { notes: CompareNote[]; pending: string | null } {
  const start = messages.findIndex((m) => m.compareResult);
  if (start < 0) return { notes: [], pending: null };

  const rest = messages.slice(start + 1);
  const notes: CompareNote[] = [];
  let pending: string | null = null;

  for (const m of rest) {
    if (m.role === "user") {
      pending = m.content;
    } else if (m.role === "assistant" && !m.isStreaming && pending) {
      notes.push({ question: pending, answer: m.content });
      pending = null;
    }
  }

  return { notes, pending };
}

export function CompareResultsState({
  messages,
  isLoading,
  originalName,
  revisedName,
  composerProps,
  onReset,
  historyOpen,
  onToggleHistory,
  onCloseHistory,
  historyEntries,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
}: CompareResultsStateProps) {
  const [mounted, setMounted] = useState(false);
  const [activeView, setActiveView] = useState<ResultsView>("summary");
  const [inspect, setInspect] = useState<CompareInspectTarget | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const resultMsg = messages.find((m) => m.compareResult);
  const result = resultMsg?.compareResult ?? null;
  const streamingMsg = messages.find((m) => m.isStreaming);
  const failedMsg = messages.find(
    (m) =>
      m.role === "assistant" &&
      !m.compareResult &&
      !m.isStreaming &&
      /comparison failed/i.test(stripMd(m.content)),
  );

  const fileA = result?.originalFileName || originalName || "Original agreement";
  const fileB = result?.revisedFileName || revisedName || "Revised agreement";

  const { notes, pending } = useMemo(() => extractNotes(messages), [messages]);

  const hasClauseData = Boolean(
    result?.clausesA?.length || result?.clausesB?.length
  );

  // ── Loading / error states ──────────────────────────────────────────────
  if (!result && (isLoading || streamingMsg)) {
    return (
      <CompareAnalyzingState
        originalName={fileA}
        revisedName={fileB}
        currentLabel={streamingMsg?.content}
      />
    );
  }

  if (!result && failedMsg) {
    return (
      <div className="dpa-results-bg flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-12">
          <div className="rounded-[24px] bg-white p-8 sm:p-10" style={{ boxShadow: CARD_SHADOW }}>
            <span className="score-badge bg-badge-red text-[11px] font-medium text-badge-red-text">
              Failed
            </span>
            <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.03em] text-[#1a1a1a]">
              Comparison could not be completed
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-dark-200">
              {stripMd(failedMsg.content).replace(/^Comparison failed\s*/i, "") ||
                "The comparison service returned an error. Start a new comparison to try again."}
            </p>
            <button
              type="button"
              onClick={onReset}
              className="mt-6 inline-flex h-11 cursor-pointer items-center rounded-full primary-gradient px-6 text-[14px] font-semibold text-white"
            >
              New comparison
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return <CompareAnalyzingState originalName={fileA} revisedName={fileB} />;
  }

  // ── Documents view (3-pane layout) — default and only entry point ──────
  if (hasClauseData) {
    return (
      <DocumentsView
        result={result}
        fileA={fileA}
        fileB={fileB}
        mounted={mounted}
        onReset={onReset}
      />
    );
  }

  // ── Report view — fallback when clause data is absent ──────────────────
  return (
    <CompareReport
      result={result}
      fileA={fileA}
      fileB={fileB}
      mounted={mounted}
      activeView={activeView}
      setActiveView={setActiveView}
      inspect={inspect}
      setInspect={setInspect}
      detailRef={detailRef}
      notes={notes}
      pending={isLoading ? pending : null}
      composerProps={composerProps}
      onReset={onReset}
      historyOpen={historyOpen}
      onToggleHistory={onToggleHistory}
      onCloseHistory={onCloseHistory}
      historyEntries={historyEntries}
      activeHistoryId={activeHistoryId}
      onSelectHistory={onSelectHistory}
      onDeleteHistory={onDeleteHistory}
    />
  );
}

// ─── Documents view (new 3-pane layout) ──────────────────────────────────────

function DocumentsView({
  result,
  fileA,
  fileB,
  mounted,
  onReset,
}: {
  result: CompareResult;
  fileA: string;
  fileB: string;
  mounted: boolean;
  onReset: () => void;
}) {
  const [navState, setNavState] = useState<CompareNavState | null>(null);

  const riskTone = COMPARE_RISK_BADGE[result.executiveSummary.overallRisk] ?? COMPARE_RISK_BADGE.MEDIUM;
  const diffs = result.differences ?? [];
  const risks = result.risks ?? [];
  const materialCount = diffs.filter(
    (d) => d.classification !== "UNCHANGED" && d.classification !== "NEUTRAL_REPHRASE",
  ).length;
  const riskCount = risks.length;

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.25s ease" }}
    >
      {/* ── Header row ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#E4E4E7] bg-white px-4 py-2 sm:px-5">

        {/* Risk badge + counts */}
        <div className="flex items-center gap-2">
          <span className={`score-badge text-[10.5px] font-semibold ${riskTone.badge}`}>
            {riskTone.label} overall
          </span>
          <span className="hidden text-[11px] text-[#6B7280] sm:inline">
            {materialCount} material changes
          </span>
          <span className="hidden text-[#D1D5DB] sm:inline">·</span>
          <span className="hidden text-[11px] text-[#6B7280] sm:inline">
            {riskCount} risks
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Prev / Next finding navigation */}
        {navState && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={navState.handlePrev}
              disabled={navState.selectedIndex <= 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#374151] transition-colors hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous finding"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[52px] text-center text-[11px] text-[#6B7280]">
              {navState.selectedIndex >= 0
                ? `${navState.selectedIndex + 1} / ${navState.filteredLength}`
                : "—"}
            </span>
            <button
              type="button"
              onClick={navState.handleNext}
              disabled={
                navState.selectedIndex < 0 ||
                navState.selectedIndex >= navState.filteredLength - 1
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#374151] transition-colors hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next finding"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* New comparison */}
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-8 cursor-pointer items-center rounded-full border border-gray-200 bg-white px-4 text-[13px] font-medium text-dark-200 transition-colors hover:bg-light-blue-100"
        >
          New comparison
        </button>
      </div>

      {/* Full-height 3-pane view */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <CompareDocumentView
          result={result}
          fileA={fileA}
          fileB={fileB}
          onNavStateChange={setNavState}
        />
      </div>
    </div>
  );
}

// ─── Report view (existing tab layout, unchanged) ─────────────────────────────

function CompareReport({
  result,
  fileA,
  fileB,
  mounted,
  activeView,
  setActiveView,
  inspect,
  setInspect,
  detailRef,
  notes,
  pending,
  composerProps,
  onReset,
  historyOpen,
  onToggleHistory,
  onCloseHistory,
  historyEntries,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
}: {
  result: CompareResult;
  fileA: string;
  fileB: string;
  mounted: boolean;
  activeView: ResultsView;
  setActiveView: (v: ResultsView) => void;
  inspect: CompareInspectTarget | null;
  setInspect: (t: CompareInspectTarget | null) => void;
  detailRef: RefObject<HTMLDivElement | null>;
  notes: CompareNote[];
  pending: string | null;
  composerProps: Omit<ComposerProps, "placeholder">;
  onReset: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  historyEntries: CompareHistoryEntry[];
  activeHistoryId?: string | null;
  onSelectHistory: (entry: CompareHistoryEntry) => void;
  onDeleteHistory: (id: string) => void;
}) {
  const summary = result.executiveSummary;
  const riskTone = RISK_BADGE[summary.overallRisk] ?? RISK_BADGE.MEDIUM;
  const highRisks = result.risks.filter((r) => r.level === "HIGH").length;
  const medRisks = result.risks.filter((r) => r.level === "MEDIUM").length;
  const lowRisks = result.risks.filter((r) => r.level === "LOW").length;
  const diffs = result.differences.filter((d) => d.classification !== "UNCHANGED");
  const added = diffs.filter((d) => d.classification === "ADDED").length;
  const removed = diffs.filter((d) => d.classification === "REMOVED").length;
  const modified = diffs.length - added - removed;
  const matched = result.alignment.filter((a) => a.status === "matched").length;
  const onlyA = result.alignment.filter((a) => a.status === "removed").length;
  const onlyB = result.alignment.filter((a) => a.status === "added").length;

  const heroMetrics = [
    { label: "High findings", value: String(highRisks), valueCls: highRisks > 0 ? "text-badge-red-text" : "text-[#1a1a1a]" },
    { label: "Material changes", value: String(diffs.length), valueCls: "text-[#1a1a1a]" },
    { label: "Aligned clauses", value: String(matched), valueCls: "text-[#1a1a1a]" },
    { label: "Priorities", value: String(summary.negotiationPriorities.length), valueCls: "text-[#1a1a1a]" },
  ];

  const openWorkspace = (view: ResultsView, target: CompareInspectTarget) => {
    setActiveView(view);
    setInspect(target);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  return (
    <div
      className="dpa-results-bg flex-1 overflow-y-auto"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(8px)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
        {/* Report nav row */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <nav className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-dark-200" aria-label="Breadcrumb">
              <span>Legal Space</span>
              <span className="text-gray-300">/</span>
              <span>Compare</span>
              <span className="text-gray-300">/</span>
              <span className="inline-flex max-w-[320px] items-center gap-1.5 truncate text-[#1a1a1a]">
                <img src="/icons/info.svg" alt="" className="h-4 w-4 object-contain" />
                {shortName(fileA, 22)} vs {shortName(fileB, 22)}
              </span>
            </nav>
          </div>
          <CompareChatToolbar
            onNew={onReset}
            historyOpen={historyOpen}
            onToggleHistory={onToggleHistory}
            historyEntries={historyEntries}
            activeHistoryId={activeHistoryId}
            onSelectHistory={onSelectHistory}
            onDeleteHistory={onDeleteHistory}
            onCloseHistory={onCloseHistory}
          />
        </div>

        <section className="mb-8 rounded-[24px] bg-white p-6 sm:p-8" style={{ boxShadow: CARD_SHADOW }}>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
            Comparison report
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dark-200">
            Clause-level redline across risk, material changes, and alignment — structured for counsel review.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="score-badge max-w-[280px] bg-[#F7F8FB] text-[11px] font-medium text-dark-200">
              <span className="truncate">A · {shortName(fileA, 40)}</span>
            </span>
            <span className="score-badge max-w-[280px] bg-[#F7F8FB] text-[11px] font-medium text-dark-200">
              <span className="truncate">B · {shortName(fileB, 40)}</span>
            </span>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div>
              <span className={`score-badge text-[12px] font-medium ${riskTone.badge}`}>
                Overall {riskTone.label.toLowerCase()} risk
              </span>
              <p className="mt-3 text-[13px] leading-relaxed text-dark-200">
                {summary.overallAssessment}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {heroMetrics.map((m) => (
                <div key={m.label} className="rounded-2xl bg-[#F7F8FB] px-4 py-4 sm:px-5 sm:py-5">
                  <p className="mb-2 text-[12px] font-medium text-dark-200">{m.label}</p>
                  <p className={`text-[24px] font-semibold leading-none tracking-tight tabular-nums ${m.valueCls}`}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="segmented-control mb-6">
          {([
            ["summary", "Summary"],
            ["risks", "Risks"],
            ["changes", "Changes"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={`segmented-control-btn ${activeView === id ? "is-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeView === "summary" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SummaryList
              title="Key findings"
              icon="/icons/info.svg"
              items={summary.keyFindings}
              empty="No key findings were returned."
            />
            <SummaryList
              title="Critical redlines"
              icon="/icons/ats-bad.svg"
              items={summary.criticalRedlines}
              empty="No critical redlines identified."
              tone="bg-badge-red"
            />
            <SummaryList
              title="Missing protections"
              icon="/icons/ats-warning.svg"
              items={summary.missingProtections}
              empty="No missing protections flagged."
            />
            <SummaryList
              title="Negotiation priorities"
              icon="/icons/pin.svg"
              items={summary.negotiationPriorities}
              numbered
              empty="No negotiation priorities listed."
            />
            <div
              className="overflow-hidden rounded-2xl bg-white lg:col-span-2"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-center gap-3 bg-light-blue-200 px-5 py-3.5">
                <img src="/icons/check.svg" alt="" className="h-5 w-5" />
                <h3 className="text-[14px] font-semibold text-gray-900">Recommendation</h3>
              </div>
              <p className="px-5 py-4 text-[13px] leading-relaxed text-dark-200">
                {summary.recommendation}
              </p>
            </div>
          </div>
        )}

        {activeView === "risks" && (
          <div ref={detailRef}>
            <Workspace
              title="Risk register"
              subtitle="Select a finding to inspect rationale, severity, and linked clause pair."
              counts={[
                { label: "High", value: highRisks, cls: "bg-badge-red text-badge-red-text" },
                { label: "Medium", value: medRisks, cls: "bg-badge-yellow text-badge-yellow-text" },
                { label: "Low", value: lowRisks, cls: "bg-badge-green text-badge-green-text" },
              ]}
              empty={result.risks.length === 0}
              emptyMessage="No risk findings identified."
              inspector={
                <CompareFindingInspector
                  target={inspect?.kind === "risk" ? inspect : null}
                  emptyHint="Choose a finding to open the analysis panel."
                />
              }
            >
              {[...result.risks]
                .sort((a, b) => {
                  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
                  return order[a.level] - order[b.level];
                })
                .map((risk) => (
                  <CompareRiskRow
                    key={risk.id}
                    risk={risk}
                    selected={inspect?.kind === "risk" && inspect.item.id === risk.id}
                    onSelect={() => openWorkspace("risks", { kind: "risk", item: risk })}
                  />
                ))}
            </Workspace>
          </div>
        )}

        {activeView === "changes" && (
          <div ref={detailRef} className="space-y-5">
            <Workspace
              title="Material differences"
              subtitle="Added, removed, and rewritten clauses between the two agreements."
              counts={[
                { label: "Added", value: added, cls: "bg-badge-green text-badge-green-text" },
                { label: "Removed", value: removed, cls: "bg-badge-red text-badge-red-text" },
                { label: "Modified", value: modified, cls: "bg-badge-yellow text-badge-yellow-text" },
              ]}
              empty={diffs.length === 0}
              emptyMessage="No meaningful clause changes detected."
              inspector={
                <CompareFindingInspector
                  target={inspect?.kind === "diff" ? inspect : null}
                  emptyHint="Select a change to see original vs revised clause IDs."
                />
              }
            >
              {diffs.map((diff, i) => (
                <CompareDiffRow
                  key={`${diff.pairId}-${i}`}
                  diff={diff}
                  selected={
                    inspect?.kind === "diff" &&
                    inspect.item.pairId === diff.pairId &&
                    inspect.item.semanticSummary === diff.semanticSummary
                  }
                  onSelect={() => openWorkspace("changes", { kind: "diff", item: diff })}
                />
              ))}
            </Workspace>

            <Workspace
              title="Clause alignment"
              subtitle="How clauses were matched across the original and revised documents."
              counts={[
                { label: "Matched", value: matched, cls: "bg-badge-green text-badge-green-text" },
                { label: "Only in A", value: onlyA, cls: "bg-badge-red text-badge-red-text" },
                { label: "Only in B", value: onlyB, cls: "bg-light-blue-100 text-[#4F5BD9]" },
              ]}
              empty={result.alignment.length === 0}
              emptyMessage="No clause alignment data available."
              inspector={
                <CompareFindingInspector
                  target={inspect?.kind === "align" ? inspect : null}
                  emptyHint="Select an aligned pair to inspect match confidence."
                />
              }
            >
              {result.alignment.map((pair) => (
                <CompareAlignRow
                  key={pair.id}
                  pair={pair}
                  selected={inspect?.kind === "align" && inspect.item.id === pair.id}
                  onSelect={() => openWorkspace("changes", { kind: "align", item: pair })}
                />
              ))}
            </Workspace>
          </div>
        )}

        <CompareAskPanel
          notes={notes}
          pendingQuestion={pending}
          value={composerProps.value}
          onChange={composerProps.onChange}
          onSubmit={composerProps.onSubmit}
          isLoading={composerProps.isLoading}
        />
      </div>
    </div>
  );
}

// ─── Shared sub-components (report view) ─────────────────────────────────────

function Workspace({
  title,
  subtitle,
  counts,
  empty,
  emptyMessage,
  children,
  inspector,
}: {
  title: string;
  subtitle: string;
  counts: { label: string; value: number; cls: string }[];
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
  inspector: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white" style={{ boxShadow: CARD_SHADOW }}>
      <div className="flex items-start justify-between gap-4 bg-light-blue-200 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold tracking-tight text-gray-900">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-dark-200">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 bg-white px-5 py-4 sm:px-6">
        {counts.map((c) => (
          <div key={c.label} className={`rounded-2xl px-3 py-3 text-center ${c.cls}`}>
            <p className="text-[18px] font-bold leading-none tabular-nums">{c.value}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-[360px] flex-col bg-white xl:flex-row">
        <div className="min-w-0 flex-1 border-t border-light-blue-200 p-3 sm:p-4 xl:border-r xl:border-t-0">
          {empty ? (
            <div className="py-14 text-center">
              <p className="text-[13px] text-dark-200">{emptyMessage}</p>
            </div>
          ) : (
            <div className="space-y-1">{children}</div>
          )}
        </div>
        <div className="w-full shrink-0 xl:w-[400px]">{inspector}</div>
      </div>
    </section>
  );
}

function SummaryList({
  title,
  icon,
  items,
  empty,
  numbered,
  tone,
}: {
  title: string;
  icon: string;
  items: string[];
  empty: string;
  numbered?: boolean;
  tone?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white" style={{ boxShadow: CARD_SHADOW }}>
      <div className={`flex items-center gap-3 px-5 py-3.5 ${tone ?? "bg-light-blue-200"}`}>
        <img src={icon} alt="" className="h-5 w-5" />
        <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
        <span className="ml-auto text-[12px] font-semibold tabular-nums text-dark-200">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-dark-200">{empty}</p>
      ) : (
        <div className="divide-y divide-light-blue-200">
          {items.map((item, i) => (
            <div key={`${title}-${i}`} className="flex items-start gap-3 px-5 py-3.5">
              {numbered ? (
                <span className="mt-0.5 w-4 shrink-0 text-[12px] font-semibold tabular-nums text-[#4F5BD9]">
                  {i + 1}
                </span>
              ) : (
                <img src="/icons/warning.svg" alt="" className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p className="text-[13px] leading-relaxed text-dark-200">{item}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
