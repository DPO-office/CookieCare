import { useState } from "react";
import type { VendorFinding } from "../types";
import { FindingBadge } from "./FindingBadge";

interface FindingCardProps {
  finding: VendorFinding;
}

const SNIPPET = {
  passed: "bg-badge-green text-badge-green-text",
  warning: "bg-badge-yellow text-badge-yellow-text",
  missing: "bg-badge-red text-badge-red-text",
  "high-risk": "bg-badge-red text-badge-red-text",
} as const;

export function FindingCard({ finding }: FindingCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-[18px] bg-white"
      style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              {finding.category}
            </span>
            {finding.tag && (
              <span className="score-badge bg-[#F7F8FB] text-[10px] font-medium text-dark-200">
                {finding.tag}
              </span>
            )}
          </div>
          {!open && (
            <p className="mt-1 line-clamp-1 pr-2 text-[13px] text-dark-200">{finding.description}</p>
          )}
        </div>
        <FindingBadge status={finding.status} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-[#F2F4F7] px-5 py-4">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
              Finding
            </p>
            <div className={`rounded-2xl p-3.5 text-[13px] leading-relaxed ${SNIPPET[finding.status]}`}>
              {finding.description}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
              Suggested remediation
            </p>
            <p className="rounded-2xl bg-[#F7F8FB] p-3.5 text-[13px] leading-relaxed text-[#1a1a1a]">
              {finding.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
