import React from "react";
import type { DimensionResult } from "../utils/categorizeFindings";

interface DPADimensionCardProps {
  result: DimensionResult;
  selected: boolean;
  onSelect: () => void;
  index: number;
}

const STATUS_STYLES = {
  strong: {
    badge: "bg-badge-green text-badge-green-text",
    bar: "#3D9B8F",
    icon: "/icons/check.svg",
  },
  partial: {
    badge: "bg-badge-yellow text-badge-yellow-text",
    bar: "#C9843A",
    icon: "/icons/warning.svg",
  },
  critical: {
    badge: "bg-badge-red text-badge-red-text",
    bar: "#B54A45",
    icon: "/icons/cross.svg",
  },
} as const;

export function DPADimensionCard({ result, selected, onSelect, index }: DPADimensionCardProps) {
  const { dimension, score, status, statusLabel, findings, warningCount, missingCount } = result;
  const Icon = dimension.icon;
  const styles = STATUS_STYLES[status];
  const issueCount = warningCount + missingCount;
  const findingsLabel =
    findings.length === 0
      ? "No findings"
      : `${findings.length} finding${findings.length === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex h-full min-h-[228px] flex-col rounded-[22px] bg-white p-5 text-left transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-px"
      style={{
        transitionDelay: `${index * 12}ms`,
        boxShadow: selected
          ? "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.14)"
          : "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className={`score-badge text-[11px] font-medium ${styles.badge}`}>
          <img src={styles.icon} alt="" className="h-3 w-3" />
          {statusLabel}
        </span>
      </div>

      <h3 className="mb-1.5 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
        {dimension.title}
      </h3>
      <p className="line-clamp-2 flex-1 text-[13px] leading-[1.55] text-dark-200">
        {dimension.description}
      </p>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
            Score
          </span>
          <span className="text-[13px] font-semibold tabular-nums text-[#1a1a1a]">
            {score}
            <span className="font-medium text-[#98A2B3]">/100</span>
          </span>
        </div>
        <div className="h-[5px] overflow-hidden rounded-full bg-[#F2F4F7]">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(score, 3)}%`,
              background: styles.bar,
            }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 pt-1">
        <span className="text-[12px] text-dark-200">
          {issueCount > 0 && findings.length > 0 ? `${issueCount} to review` : findingsLabel}
        </span>
        <span
          className={`text-[12px] font-medium ${
            selected ? "text-[#4F5BD9]" : "text-[#98A2B3] group-hover:text-[#4F5BD9]"
          }`}
        >
          {selected ? "Open" : "Inspect"}
        </span>
      </div>
    </button>
  );
}
