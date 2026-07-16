import React, { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { EthicsFinding } from "../types";
import { EthicsBadge } from "./EthicsBadge";

interface EthicsFindingCardProps {
  finding: EthicsFinding;
}

export function EthicsFindingCard({ finding }: EthicsFindingCardProps) {
  const [open, setOpen] = useState(false);

  const borderColor = {
    passed: "border-l-emerald-400",
    "needs-improvement": "border-l-gray-400",
    warning: "border-l-amber-400",
    "high-risk": "border-l-red-400",
  }[finding.status];

  const hoverBg = {
    passed: "hover:bg-emerald-50/30",
    "needs-improvement": "hover:bg-gray-50/60",
    warning: "hover:bg-amber-50/30",
    "high-risk": "hover:bg-red-50/30",
  }[finding.status];

  return (
    <div
      className={`bg-white border border-gray-200 rounded-[14px] shadow-xs border-l-[3px] ${borderColor} overflow-hidden transition-all duration-200 hover:shadow-sm`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors duration-150 cursor-pointer ${hoverBg}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900">
                {finding.title ?? finding.category}
              </span>
              {finding.title && finding.category && finding.title !== finding.category && (
                <span className="text-[10px] text-gray-400 font-medium">{finding.category}</span>
              )}
            </div>
            {!open && (
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1 pr-2">
                {finding.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <EthicsBadge status={finding.status} />
          <div
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150 ${
              open ? "bg-gray-100" : "bg-gray-50 hover:bg-gray-100"
            }`}
          >
            {open ? (
              <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          <div>
            <p className="section-label mb-2">Finding</p>
            <p className="text-[13px] text-gray-700 leading-relaxed">
              {finding.description}
            </p>
          </div>
          {finding.evidence && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="section-label mb-1.5">Evidence</p>
              <p className="text-[12px] text-gray-600 leading-relaxed italic">{finding.evidence}</p>
            </div>
          )}
          <div className="bg-gradient-to-br from-blue-50 to-gray-50/50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-blue-600" />
              </div>
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                AI Recommendation
              </p>
            </div>
            <p className="text-[13px] text-blue-900 leading-relaxed">
              {finding.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
