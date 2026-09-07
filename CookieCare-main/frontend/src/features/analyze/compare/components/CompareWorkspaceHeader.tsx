/**
 * CompareWorkspaceHeader
 *
 * Top section of the Compare Results workspace.
 * Shows: breadcrumb, doc A → doc B, action buttons, severity summary,
 * clause counts, and negotiation priorities CTA.
 */

import { useState } from "react";
import { FileText, ArrowRight, Download, ChevronDown, ChevronUp } from "lucide-react";
import { CompareChatToolbar } from "./CompareChatToolbar";
import type { CompareHistoryEntry } from "../utils/compareHistory";
import type { NormalizedCompareData } from "../utils/normalizeFindings";
import { RISK_BADGE } from "../constants";

interface CompareWorkspaceHeaderProps {
  fileA: string;
  fileB: string;
  normalizedData: NormalizedCompareData;
  overallRisk: "LOW" | "MEDIUM" | "HIGH";
  overallAssessment: string;
  recommendation: string;
  negotiationPriorities: string[];
  onReset: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  historyEntries: CompareHistoryEntry[];
  activeHistoryId?: string | null;
  onSelectHistory: (entry: CompareHistoryEntry) => void;
  onDeleteHistory: (id: string) => void;
}

function shortName(name: string, max = 38) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function CompareWorkspaceHeader({
  fileA,
  fileB,
  normalizedData,
  overallRisk,
  overallAssessment,
  recommendation,
  negotiationPriorities,
  onReset,
  historyOpen,
  onToggleHistory,
  onCloseHistory,
  historyEntries,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
}: CompareWorkspaceHeaderProps) {
  const [prioritiesOpen, setPrioritiesOpen] = useState(false);
  const { counts } = normalizedData;
  const riskTone = RISK_BADGE[overallRisk] ?? RISK_BADGE.MEDIUM;

  const totalFindings = counts.total.length;
  const totalChanges = counts.affectedClauses;
  const totalClauses = counts.totalClauses;
  const unchangedCount = counts.unchanged;

  // Severity bar widths — proportional to counts
  const barTotal = counts.high + counts.medium + counts.low + counts.noRisk;

  return (
    <div className="bg-white border-b border-[#E4E4E7]">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6 border-b border-[#F0F0F2]">
        {/* Breadcrumb */}
        <nav className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[#6B7280]" aria-label="Breadcrumb">
          <span>Comparisons</span>
          <span className="text-[#D1D5DB]">/</span>
          <span className="truncate text-[#111827] max-w-[260px]">
            {shortName(fileA, 18)} vs {shortName(fileB, 18)}
          </span>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
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
      </div>

      {/* ── Document comparison row ── */}
      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: doc A → B */}
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <DocChip label="Baseline" filename={fileA} side="A" />
            <ArrowRight className="h-4 w-4 shrink-0 text-[#9CA3AF] hidden sm:block" aria-hidden />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF] sm:hidden self-center" aria-hidden />
            <DocChip label="Compared" filename={fileB} side="B" />
          </div>

          {/* Right: negotiation priorities CTA */}
          {negotiationPriorities.length > 0 && (
            <button
              type="button"
              onClick={() => setPrioritiesOpen((v) => !v)}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#F9FAFB] px-3 py-2 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:border-[#D1D5DB] focus-visible:ring-2 focus-visible:ring-[#2175D9] focus-visible:ring-offset-1"
              aria-expanded={prioritiesOpen}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2175D9] text-[10px] font-bold text-white">
                {negotiationPriorities.length}
              </span>
              <span>Negotiation actions</span>
              {prioritiesOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-[#6B7280]" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" />
              )}
            </button>
          )}
        </div>

        {/* Negotiation priorities dropdown */}
        {prioritiesOpen && negotiationPriorities.length > 0 && (
          <div className="mt-3 rounded-xl border border-[#E4E4E7] bg-[#F9FAFB] p-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Negotiation priorities
            </p>
            <ol className="space-y-2">
              {negotiationPriorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[#2175D9]/10 text-[10px] font-bold text-[#2175D9]">
                    {i + 1}
                  </span>
                  <span className="leading-snug">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* ── Summary bar ── */}
      <div className="border-t border-[#F0F0F2] px-5 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Overall risk badge */}
          <span className={`score-badge text-[11px] font-semibold ${riskTone.badge}`}>
            Overall {riskTone.label} risk
          </span>

          {/* Severity counts */}
          <div className="flex items-center gap-3 text-[13px]">
            <SeverityCount level="HIGH" count={counts.high} />
            <span className="text-[#D1D5DB]">·</span>
            <SeverityCount level="MEDIUM" count={counts.medium} />
            <span className="text-[#D1D5DB]">·</span>
            <SeverityCount level="LOW" count={counts.low} />
            {counts.noRisk > 0 && (
              <>
                <span className="text-[#D1D5DB]">·</span>
                <span className="text-[13px] font-medium text-[#6B7280]">
                  {counts.noRisk} unscored
                </span>
              </>
            )}
          </div>

          {/* Clause counts */}
          <div className="flex items-center gap-1.5 text-[12px] text-[#6B7280]">
            <span className="font-semibold text-[#374151]">{totalChanges}</span>
            <span>of</span>
            <span className="font-semibold text-[#374151]">{totalClauses}</span>
            <span>clauses affected</span>
            {unchangedCount > 0 && (
              <span className="text-[#9CA3AF]">· {unchangedCount} unchanged</span>
            )}
          </div>
        </div>

        {/* Severity breakdown bar */}
        {barTotal > 0 && (
          <div className="mt-3 flex h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-[#F3F4F6]">
            {counts.high > 0 && (
              <div
                className="h-full bg-[#B54A45]"
                style={{ width: `${(counts.high / barTotal) * 100}%` }}
                title={`${counts.high} HIGH`}
              />
            )}
            {counts.medium > 0 && (
              <div
                className="h-full bg-[#C9843A]"
                style={{ width: `${(counts.medium / barTotal) * 100}%` }}
                title={`${counts.medium} MEDIUM`}
              />
            )}
            {counts.low > 0 && (
              <div
                className="h-full bg-[#3D9B8F]"
                style={{ width: `${(counts.low / barTotal) * 100}%` }}
                title={`${counts.low} LOW`}
              />
            )}
            {counts.noRisk > 0 && (
              <div
                className="h-full bg-[#D1D5DB]"
                style={{ width: `${(counts.noRisk / barTotal) * 100}%` }}
                title={`${counts.noRisk} unscored`}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Assessment + recommendation (collapsed by default for space) ── */}
      {overallAssessment && (
        <div className="border-t border-[#F0F0F2] bg-[#F9FAFB] px-5 py-3 sm:px-6">
          <p className="text-[12.5px] leading-relaxed text-[#374151] line-clamp-2">
            {overallAssessment}
          </p>
          {recommendation && (
            <p className="mt-1 text-[12px] font-medium text-[#6B7280]">
              <span className="font-semibold text-[#374151]">Recommendation: </span>
              {recommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DocChip({ label, filename, side }: { label: string; filename: string; side: "A" | "B" }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" aria-hidden />
        <span className="truncate text-[13px] font-medium text-[#111827] max-w-[200px] sm:max-w-[240px]">
          {filename}
        </span>
      </div>
    </div>
  );
}

function SeverityCount({ level, count }: { level: "HIGH" | "MEDIUM" | "LOW"; count: number }) {
  const tone = RISK_BADGE[level];
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: tone.bar }}
        aria-hidden
      />
      <span className={`font-semibold ${count > 0 ? "text-[#111827]" : "text-[#9CA3AF]"}`}>
        {count}
      </span>
      <span className="text-[#6B7280]">{tone.label}</span>
    </span>
  );
}
