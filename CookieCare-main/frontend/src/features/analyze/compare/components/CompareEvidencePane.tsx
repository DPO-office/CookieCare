/**
 * CompareEvidencePane
 *
 * Right panel of the Compare workspace.
 * For a selected FindingViewModel, shows:
 *   - Section + clause title
 *   - Severity / change type badges
 *   - What Changed (semanticSummary)
 *   - Why It Matters (risk.rationale)
 *   - Source Evidence: Document A vs Document B clause text with inline diff
 *   - Detection lineage
 *   - Confidence
 *   - Alignment trust signal
 *   - Finding navigation (prev / next)
 */

import { useState, useEffect, useMemo } from "react";
import {
  Shield, Sparkles, Equal, AlertTriangle, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Info,
} from "lucide-react";
import { RISK_BADGE, CHANGE_TYPE_STYLE, CATEGORY_LABELS } from "../constants";
import type { FindingViewModel } from "../utils/normalizeFindings";
import type { ClauseRecord } from "../utils/normalizeFindings";
import { computeInlineDiff } from "../utils/diffHighlight";

interface CompareEvidencePaneProps {
  finding: FindingViewModel | null;
  findingIndex: number;
  totalFindings: number;
  onPrev: () => void;
  onNext: () => void;
  clausesA: ClauseRecord[] | null;
  clausesB: ClauseRecord[] | null;
  clausesLoading: boolean;
  clausesError: string | null;
  fileA: string;
  fileB: string;
}

// ─── Detection lineage ────────────────────────────────────────────────────────

const RULE_LABELS: Record<string, string> = {
  LIABILITY_CAP_REMOVED: "Liability cap removed",
  LIABILITY_CAP_REDUCED: "Liability cap reduced",
  UNLIMITED_LIABILITY: "Unlimited liability introduced",
  CONSEQUENTIAL_DAMAGES_REMOVED: "Consequential damages waiver removed",
  INDEMNIFICATION_REMOVED: "Indemnification removed",
  INDEMNIFICATION_SCOPE_EXPANDED: "Indemnification scope expanded",
  IP_OWNERSHIP_CHANGED: "IP ownership changed",
  IP_LICENCE_CHANGED: "IP licence changed",
  CONFIDENTIALITY_REMOVED: "Confidentiality removed",
  CONFIDENTIALITY_NARROWED: "Confidentiality narrowed",
  GOVERNING_LAW_CHANGED: "Governing law changed",
  DATA_PROTECTION_CHANGED: "Data protection terms changed",
  AUDIT_RIGHTS_UNLIMITED: "Unlimited audit rights",
  AUDIT_RIGHTS_REMOVED: "Audit rights removed",
  PAYMENT_TERMS_CHANGED: "Payment terms changed",
  TERMINATION_CONVENIENCE_REMOVED: "Termination for convenience removed",
  TERMINATION_NOTICE_SHORTENED: "Termination notice shortened",
};

function DetectionBadge({
  source,
  detectionMethod,
  triggeredRule,
}: {
  source?: "deterministic" | "llm";
  detectionMethod?: string;
  triggeredRule?: string;
}) {
  if (detectionMethod === "identical") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
        <Equal className="h-3 w-3" aria-hidden />
        Identical text
      </span>
    );
  }
  if (source === "deterministic" || detectionMethod === "similarity") {
    const ruleLabel = triggeredRule ? (RULE_LABELS[triggeredRule] ?? triggeredRule.toLowerCase().replace(/_/g, " ")) : null;
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#374151]">
        <Shield className="h-3 w-3 text-[#2175D9]" aria-hidden />
        <span className="font-medium">Rule match</span>
        {ruleLabel && <span className="text-[#6B7280]">· {ruleLabel}</span>}
      </span>
    );
  }
  if (detectionMethod === "fallback") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
        <Info className="h-3 w-3" aria-hidden />
        Fallback detection
      </span>
    );
  }
  // Default: LLM
  return (
    <span className="flex items-center gap-1 text-[11px] text-[#374151]">
      <Sparkles className="h-3 w-3 text-[#7C3AED]" aria-hidden />
      <span className="font-medium">AI semantic analysis</span>
    </span>
  );
}

// ─── Confidence label ─────────────────────────────────────────────────────────

function ConfidenceLabel({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const label = pct >= 85 ? "High confidence" : pct >= 65 ? "Moderate confidence" : "Needs review";
  const color = pct >= 85 ? "text-[#065F46]" : pct >= 65 ? "text-[#92400E]" : "text-[#991B1B]";
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      {label} · {pct}%
    </span>
  );
}

// ─── Inline diff renderer ─────────────────────────────────────────────────────

function InlineDiffText({ text, doc }: { text: string; doc: "A" | "B" }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-[#374151]">
      {text}
    </p>
  );
}

function DiffPane({
  label,
  doc,
  clauseText,
  spans,
  side,
}: {
  label: string;
  doc: string;
  clauseText: string | null;
  spans: import("../utils/diffHighlight").DiffSpan[] | null;
  side: "A" | "B";
}) {
  // Neutral pane — Original/Modified are communicated by label, not background color
  const docLabel = side === "A" ? "Original" : "Modified";

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-[#E5E7EB] overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#F3F4F6] bg-[#F9FAFB]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#374151]">
            {docLabel}
          </span>
        </div>
        <span className="truncate text-[10px] text-[#9CA3AF] max-w-[140px]" title={doc}>
          {doc.length > 22 ? `${doc.slice(0, 22)}…` : doc}
        </span>
      </div>

      <div className="px-3 py-3">
        {clauseText === null ? (
          <p className="text-[12px] italic text-[#9CA3AF]">
            {side === "A" ? "Clause not present in baseline." : "Clause not present in compared document."}
          </p>
        ) : spans ? (
          <p className="text-[12.5px] leading-relaxed text-[#374151]">
            {spans.map((span, i) => {
              if (span.type === "equal") return <span key={i}>{span.text}</span>;
              if (span.type === "removed") {
                return (
                  <mark
                    key={i}
                    className="rounded-sm bg-[#FEE2E2] text-[#991B1B] px-0.5"
                    style={{ textDecoration: "line-through", textDecorationColor: "#B54A45" }}
                  >
                    {span.text}
                  </mark>
                );
              }
              // added
              return (
                <mark
                  key={i}
                  className="rounded-sm bg-[#D1FAE5] text-[#065F46] px-0.5"
                >
                  {span.text}
                </mark>
              );
            })}
          </p>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-[#374151]">{clauseText}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompareEvidencePane({
  finding,
  findingIndex,
  totalFindings,
  onPrev,
  onNext,
  clausesA,
  clausesB,
  clausesLoading,
  clausesError,
  fileA,
  fileB,
}: CompareEvidencePaneProps) {
  if (!finding) {
    return <EvidenceEmpty />;
  }

  const isRisk = finding.kind === "risk";
  const risk = isRisk ? finding.risk : null;
  const diff = finding.diff;
  const pair = finding.pair;

  // Clause lookup
  const clauseAId = diff?.clauseAId ?? pair?.clauseAId ?? null;
  const clauseBId = diff?.clauseBId ?? pair?.clauseBId ?? null;

  const byId = useMemo(() => {
    const map = new Map<string, ClauseRecord>();
    for (const c of clausesA ?? []) map.set(c.id, c);
    for (const c of clausesB ?? []) map.set(c.id, c);
    return map;
  }, [clausesA, clausesB]);

  const clauseA = clauseAId ? byId.get(clauseAId) ?? null : null;
  const clauseB = clauseBId ? byId.get(clauseBId) ?? null : null;

  // Inline diff — only computed when both texts are available
  const { aSpans, bSpans } = useMemo(() => {
    if (!clauseA?.text || !clauseB?.text) return { aSpans: null, bSpans: null };
    return computeInlineDiff(clauseA.text, clauseB.text);
  }, [clauseA?.text, clauseB?.text]);

  const tone = risk ? (RISK_BADGE[risk.level] ?? RISK_BADGE.MEDIUM) : null;
  const diffMeta = diff
    ? (CHANGE_TYPE_STYLE[diff.classification] ?? CHANGE_TYPE_STYLE.NEUTRAL_REPHRASE)
    : null;

  const directionSymbol =
    diff?.classification === "MODIFIED_BROADER" ? "↑ Broadened"
    : diff?.classification === "MODIFIED_NARROWER" ? "↓ Narrowed"
    : null;

  const isWeakAlignment = (pair?.matchConfidence ?? 1) < 0.7 && pair?.alignmentType !== "exact";

  // Clause title display
  const clauseTitle = finding.clauseTitle ?? (risk ? (CATEGORY_LABELS[risk.category] ?? risk.category) : "Clause change");
  const sectionLabel = finding.sectionLabel;

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin bg-white">
      {/* ── Navigation ── */}
      <div className="flex items-center justify-between border-b border-[#F0F0F2] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={findingIndex <= 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#374151] disabled:opacity-30 hover:bg-[#F3F4F6] disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#2175D9]"
            aria-label="Previous finding"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-medium text-[#6B7280]">
            Finding {findingIndex + 1} of {totalFindings}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={findingIndex >= totalFindings - 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white text-[#374151] disabled:opacity-30 hover:bg-[#F3F4F6] disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#2175D9]"
            aria-label="Next finding"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Detection + confidence */}
        <div className="flex items-center gap-3">
          <DetectionBadge
            source={risk?.source}
            detectionMethod={diff?.detectionMethod}
            triggeredRule={risk?.triggeredRule}
          />
          {(risk?.confidence ?? diff?.confidence) != null && (
            <ConfidenceLabel confidence={risk?.confidence ?? diff!.confidence} />
          )}
        </div>
      </div>

      {/* ── Finding header ── */}
      <div className="border-b border-[#F0F0F2] px-4 py-4">
        {sectionLabel && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            {sectionLabel}
          </p>
        )}
        <h2 className="text-[16px] font-semibold leading-tight tracking-tight text-[#111827]">
          {clauseTitle}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tone && (
            <span className={`score-badge text-[10px] font-semibold ${tone.badge}`}>
              {tone.label}
            </span>
          )}
          {diffMeta && diff?.classification !== "UNCHANGED" && diff?.classification !== "NEUTRAL_REPHRASE" && (
            <span className={`score-badge text-[10px] font-medium ${diffMeta.badge}`}>
              {directionSymbol ?? diffMeta.label}
            </span>
          )}
          {risk && (
            <span className="score-badge text-[10px] font-medium bg-[#F3F4F6] text-[#374151]">
              {CATEGORY_LABELS[risk.category] ?? risk.category}
            </span>
          )}
        </div>

        {/* Weak alignment warning */}
        {isWeakAlignment && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D97706]" aria-hidden />
            <div>
              <p className="text-[11.5px] font-semibold text-[#92400E]">Weak clause match</p>
              {pair?.alignmentReason && (
                <p className="mt-0.5 text-[11px] text-[#92400E]/80">{pair.alignmentReason}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 space-y-0 divide-y divide-[#F0F0F2]">
        {/* What Changed */}
        {(diff?.semanticSummary || diff?.classification === "ADDED" || diff?.classification === "REMOVED") && (
          <section className="px-4 py-4" aria-labelledby="what-changed">
            <p id="what-changed" className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              What changed
            </p>
            <p className="text-[13px] leading-relaxed text-[#374151]">
              {diff.semanticSummary ||
                (diff.classification === "ADDED" ? "This clause was added in the compared document — it does not exist in the baseline." :
                 diff.classification === "REMOVED" ? "This clause was present in the baseline but was removed in the compared document." :
                 "")}
            </p>
          </section>
        )}

        {/* Why It Matters */}
        {risk?.rationale && (
          <section className="px-4 py-4" aria-labelledby="why-matters">
            <p id="why-matters" className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Why it matters
            </p>
            <div className={`rounded-xl p-3.5 text-[13px] leading-relaxed ${tone?.badge ?? "bg-[#F3F4F6] text-[#374151]"}`}>
              {risk.rationale}
            </div>
          </section>
        )}

        {/* No-risk note */}
        {finding.kind === "no-risk" && (
          <section className="px-4 py-4">
            <div className="flex items-start gap-2 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] px-3 py-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
              <p className="text-[12.5px] text-[#6B7280]">
                A change was detected here but the risk engine did not flag a specific risk.
                Review the source evidence below to assess significance.
              </p>
            </div>
          </section>
        )}

        {/* Source Evidence */}
        <section className="px-4 py-4" aria-labelledby="source-evidence">
          <p id="source-evidence" className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Source evidence
          </p>

          {clausesLoading ? (
            <EvidenceLoading />
          ) : clausesError ? (
            <EvidenceError message={clausesError} />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <DiffPane
                label="Document A"
                doc={fileA}
                clauseText={clauseA?.text ?? null}
                spans={clauseA?.text ? aSpans : null}
                side="A"
              />
              <DiffPane
                label="Document B"
                doc={fileB}
                clauseText={clauseB?.text ?? null}
                spans={clauseB?.text ? bSpans : null}
                side="B"
              />
            </div>
          )}

          {/* Diff legend */}
          {!clausesLoading && !clausesError && clauseA?.text && clauseB?.text && (
            <div className="mt-2 flex items-center gap-4 text-[11px] text-[#6B7280]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#FEE2E2]" />
                Removed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#D1FAE5]" />
                Added
              </span>
            </div>
          )}
        </section>

        {/* Alignment detail (if alignment confidence is notable) */}
        {pair && pair.alignmentReason && !isWeakAlignment && (
          <section className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1.5">
              Alignment
            </p>
            <p className="text-[12px] text-[#6B7280]">
              {pair.alignmentReason}
              <span className="ml-2 text-[#9CA3AF]">
                · {pair.alignmentType} · {Math.round(pair.matchConfidence * 100)}%
              </span>
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Sub-states ───────────────────────────────────────────────────────────────

function EvidenceEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center bg-white">
      <div className="h-10 w-10 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3">
        <Info className="h-5 w-5 text-[#9CA3AF]" />
      </div>
      <p className="text-[13px] font-semibold text-[#374151]">Select a finding</p>
      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#6B7280]">
        Choose a finding from the list to see the source evidence and analysis.
      </p>
    </div>
  );
}

function EvidenceLoading() {
  return (
    <div className="flex h-[160px] items-center justify-center gap-2 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7]">
      <Loader2 className="h-4 w-4 animate-spin text-[#9CA3AF]" />
      <span className="text-[12.5px] text-[#6B7280]">Loading clause text…</span>
    </div>
  );
}

function EvidenceError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3.5">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626]" />
      <div>
        <p className="text-[12.5px] font-semibold text-[#991B1B]">Could not load clause text</p>
        <p className="mt-0.5 text-[12px] text-[#991B1B]/80">{message}</p>
      </div>
    </div>
  );
}
