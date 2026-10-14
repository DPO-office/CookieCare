import type { EthicsFinding } from "../types";
import { EthicsBadge } from "./EthicsBadge";

interface EthicsFindingRowProps {
  finding: EthicsFinding;
  selected?: boolean;
  onSelect?: (finding: EthicsFinding) => void;
}

export function EthicsFindingRow({ finding, selected = false, onSelect }: EthicsFindingRowProps) {
  const title = finding.title ?? finding.category;
  const riskTag =
    finding.status === "high-risk" || finding.severity === "critical" || finding.severity === "high"
      ? "High"
      : finding.status === "warning" || finding.severity === "medium"
        ? "Medium"
        : finding.status === "needs-improvement"
          ? "Review"
          : "Low";

  const riskCls =
    riskTag === "High"
      ? "bg-badge-red text-badge-red-text"
      : riskTag === "Medium" || riskTag === "Review"
        ? "bg-badge-yellow text-badge-yellow-text"
        : "bg-badge-green text-badge-green-text";

  const statusDot =
    finding.status === "passed" ? "bg-emerald-400" :
    finding.status === "needs-improvement" ? "bg-slate-400" :
    finding.status === "warning" ? "bg-amber-400" : "bg-rose-400";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(finding)}
      className={`group w-full cursor-pointer rounded-xl px-3.5 py-3 text-left transition-all duration-150 ${
        selected ? "gradient-hover shadow-sm" : "bg-transparent hover:bg-[#EEF2FF]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug text-[#1a1a1a]">{title}</p>
          {finding.title && finding.category && finding.title !== finding.category && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-dark-200/70">{finding.category}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`hidden score-badge text-[10px] font-semibold sm:inline-flex ${riskCls}`}>
            {riskTag}
          </span>
          <EthicsBadge status={finding.status} />
        </div>
      </div>
    </button>
  );
}
