import type { ReactNode } from "react";
import { CATEGORY_LABELS, CHANGE_TYPE_STYLE, ALIGN_LABELS, RISK_BADGE } from "../constants";
import type {
  CompareRiskFinding,
  CompareClauseDifference,
  CompareAlignedPair,
} from "../../../randtrustAI/types";

function RowShell({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-xl px-3.5 py-3 text-left transition-all duration-150 cursor-pointer ${
        selected ? "gradient-hover shadow-sm" : "bg-transparent hover:bg-light-blue-100"
      }`}
    >
      {children}
    </button>
  );
}

export function CompareRiskRow({
  risk,
  selected,
  onSelect,
}: {
  risk: CompareRiskFinding;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = RISK_BADGE[risk.level] ?? RISK_BADGE.MEDIUM;
  return (
    <RowShell selected={selected} onClick={onSelect}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: tone.bar }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
            {risk.rationale}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-dark-200/70">
            {CATEGORY_LABELS[risk.category] ?? risk.category}
          </p>
        </div>
        <span className={`score-badge shrink-0 text-[10px] font-semibold ${tone.badge}`}>
          {tone.label}
        </span>
      </div>
    </RowShell>
  );
}

export function CompareDiffRow({
  diff,
  selected,
  onSelect,
}: {
  diff: CompareClauseDifference;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = CHANGE_TYPE_STYLE[diff.classification] ?? CHANGE_TYPE_STYLE.NEUTRAL_REPHRASE;
  return (
    <RowShell selected={selected} onClick={onSelect}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
            {diff.semanticSummary || `Clause ${diff.pairId}`}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-dark-200/70">
            {diff.clauseAId ?? "—"} → {diff.clauseBId ?? "—"}
          </p>
        </div>
        <span className={`score-badge shrink-0 text-[10px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
      </div>
    </RowShell>
  );
}

export function CompareAlignRow({
  pair,
  selected,
  onSelect,
}: {
  pair: CompareAlignedPair;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = ALIGN_LABELS[pair.status] ?? ALIGN_LABELS.matched;
  return (
    <RowShell selected={selected} onClick={onSelect}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
            {pair.alignmentReason || `${pair.clauseAId ?? "—"} → ${pair.clauseBId ?? "—"}`}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-dark-200/70">
            {pair.alignmentType} · {Math.round(pair.matchConfidence * 100)}% match
          </p>
        </div>
        <span className={`score-badge shrink-0 text-[10px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
      </div>
    </RowShell>
  );
}
