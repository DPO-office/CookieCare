// ─── CompareResultCards ───────────────────────────────────────────────────────
// Structured compare data as interactive tabs below the executive summary.

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeftRight, Link2, ChevronDown, ChevronUp } from "lucide-react";
import type {
  CompareResult,
  CompareClauseDifference,
  CompareAlignedPair,
} from "../../../randtrustAI/types";

interface CompareResultCardsProps {
  result: CompareResult;
}

type TabId = "differences" | "clauses";

const DIFF_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ADDED: { label: "Added", color: "#15803D", bg: "#DCFCE7" },
  REMOVED: { label: "Removed", color: "#B91C1C", bg: "#FEE2E2" },
  MODIFIED_BROADER: { label: "Broadened", color: "#C2410C", bg: "#FFEDD5" },
  MODIFIED_NARROWER: { label: "Narrowed", color: "#C2410C", bg: "#FFEDD5" },
  NEUTRAL_REPHRASE: { label: "Rephrased", color: "#52525B", bg: "#F4F4F5" },
  UNCHANGED: { label: "Unchanged", color: "#A1A1AA", bg: "#F4F4F5" },
};

export function CompareResultCards({ result }: CompareResultCardsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("differences");

  const diffCount = result.differences.filter((d) => d.classification !== "UNCHANGED").length;
  const matchCount = result.alignment.filter((a) => a.status === "matched").length;

  const tabs: { id: TabId; label: string; icon: React.ElementType; badge?: string }[] = [
    {
      id: "differences",
      label: "Differences",
      icon: ArrowLeftRight,
      badge: diffCount > 0 ? String(diffCount) : undefined,
    },
    {
      id: "clauses",
      label: "Aligned Clauses",
      icon: Link2,
      badge: matchCount > 0 ? String(result.alignment.length) : undefined,
    },
  ];

  return (
    <div className="mt-5 rounded-2xl overflow-hidden border border-[#E4E4E7] bg-white shadow-sm">
      <div
        className="flex items-center gap-1 px-3 pt-3 pb-0 border-b border-[#F0F0F0] overflow-x-auto"
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium rounded-t-lg transition-colors duration-150 outline-none shrink-0 ${
                isActive
                  ? "text-[#18181B] bg-white border-b-2 border-[#18181B] -mb-px"
                  : "text-[#A1A1AA] hover:text-[#52525B]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive ? "bg-[#F4F4F5] text-[#52525B]" : "bg-[#FAFAFA] text-[#A1A1AA]"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4 bg-[#FAFAFA]" role="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "differences" && <DifferencesTab differences={result.differences} />}
            {activeTab === "clauses" && <ClausesTab alignment={result.alignment} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DifferencesTab({ differences }: { differences: CompareClauseDifference[] }) {
  const meaningful = differences.filter((d) => d.classification !== "UNCHANGED");

  if (meaningful.length === 0) {
    return <EmptyState message="No meaningful clause changes detected." />;
  }

  return (
    <div className="space-y-2.5">
      {meaningful.map((diff, i) => (
        <DiffCard key={`${diff.pairId}-${i}`} diff={diff} />
      ))}
    </div>
  );
}

function DiffCard({ diff }: { diff: CompareClauseDifference }) {
  const [expanded, setExpanded] = useState(false);
  const meta = DIFF_LABELS[diff.classification] ?? {
    label: diff.classification,
    color: "#52525B",
    bg: "#F4F4F5",
  };

  return (
    <div className="rounded-xl overflow-hidden border border-[#E4E4E7] bg-white">
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span
          className="flex-shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full mt-0.5"
          style={{ color: meta.color, background: meta.bg }}
        >
          {meta.label}
        </span>

        <p
          className={`flex-1 text-[13px] leading-[1.65] text-[#3F3F46] ${expanded ? "" : "line-clamp-2"}`}
        >
          {diff.semanticSummary || `Clause ${diff.pairId} — ${meta.label.toLowerCase()}`}
        </p>

        <div className="flex-shrink-0 text-[#A1A1AA]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && diff.semanticSummary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-[#F0F0F0]">
              <span className="text-[11px] text-[#A1A1AA] mt-3 block">
                Confidence: {Math.round(diff.confidence * 100)}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClausesTab({ alignment }: { alignment: CompareAlignedPair[] }) {
  if (alignment.length === 0) {
    return <EmptyState message="No clause alignment data available." />;
  }

  const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
    matched: { color: "#15803D", bg: "#DCFCE7" },
    added: { color: "#1D4ED8", bg: "#DBEAFE" },
    removed: { color: "#B91C1C", bg: "#FEE2E2" },
    restructured: { color: "#C2410C", bg: "#FFEDD5" },
  };

  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
      {alignment.map((pair, i) => {
        const style = STATUS_STYLES[pair.status] ?? { color: "#52525B", bg: "#F4F4F5" };
        return (
          <div
            key={pair.id ?? i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-[#EBEBEB]"
          >
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: style.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-[#3F3F46] truncate leading-relaxed">
                {pair.alignmentReason || `${pair.clauseAId ?? "—"} → ${pair.clauseBId ?? "—"}`}
              </p>
            </div>
            <span
              className="text-[10px] flex-shrink-0 capitalize px-2 py-0.5 rounded-full font-medium"
              style={{ color: style.color, background: style.bg }}
            >
              {pair.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-[13px] text-center py-8 text-[#A1A1AA]">{message}</p>
  );
}
