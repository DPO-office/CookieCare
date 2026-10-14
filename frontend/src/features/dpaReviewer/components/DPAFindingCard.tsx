import React from "react";
import { Finding } from "../types";
import { DPAStatusBadge } from "./DPAStatusBadge";

interface DPAFindingCardProps {
  finding: Finding;
  selected?: boolean;
  onSelect?: (finding: Finding) => void;
}

export function DPAFindingCard({ finding, selected = false, onSelect }: DPAFindingCardProps) {
  const article = finding.article ?? finding.articleReference;
  const riskTag =
    finding.severity === "high" ? "High" :
    finding.severity === "medium" ? "Medium" :
    finding.severity === "low" ? "Low" :
    finding.status === "missing" ? "Compulsory" :
    finding.status === "warning" ? "Warning" : "Low";

  const riskCls =
    riskTag === "High"
      ? "bg-badge-red text-badge-red-text"
      : riskTag === "Medium" || riskTag === "Warning" || riskTag === "Compulsory"
        ? "bg-badge-yellow text-badge-yellow-text"
        : "bg-badge-green text-badge-green-text";

  const statusDot =
    finding.status === "compliant" ? "bg-emerald-400" :
    finding.status === "warning" ? "bg-amber-400" : "bg-rose-400";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(finding)}
      className={`group w-full rounded-xl px-3.5 py-3 text-left transition-all duration-150 cursor-pointer
        ${selected
          ? "gradient-hover shadow-sm"
          : "bg-transparent hover:bg-light-blue-100"
        }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot}`} aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug text-gray-900">
            {finding.clause}
          </p>
          {article && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-dark-200/70">
              {article}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`hidden score-badge text-[10px] font-semibold sm:inline-flex ${riskCls}`}>
            {riskTag}
          </span>
          <DPAStatusBadge status={finding.status} />
        </div>
      </div>
    </button>
  );
}
