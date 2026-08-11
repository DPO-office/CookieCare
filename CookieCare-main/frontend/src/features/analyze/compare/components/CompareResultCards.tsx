// ─── CompareResultCards ───────────────────────────────────────────────────────
// Structured compare data as interactive tabs below the executive summary.

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, ArrowLeftRight, Link2, ChevronDown, ChevronUp } from "lucide-react";
import type {
  CompareResult,
  CompareRiskFinding,
  CompareClauseDifference,
  CompareAlignedPair,
  RiskLevel,
} from "../../../randtrustAI/types";

interface CompareResultCardsProps {
  result: CompareResult;
}

type TabId = "risks" | "differences" | "clauses";

const RISK_COLORS: Record<
  RiskLevel,
  { bg: string; border: string; label: string; body: string; dot: string; badge: string }
> = {
  HIGH: {
    bg: "#FEF2F2",
    border: "#FECACA",
    label: "#B91C1C",
    body: "#3F3F46",
    dot: "#EF4444",
    badge: "#FEE2E2",
  },
  MEDIUM: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    label: "#B45309",
    body: "#3F3F46",
    dot: "#EAB308",
    badge: "#FEF3C7",
  },
  LOW: {
    bg: "#F0FDF4",
    border: "#BBF7D0",
    label: "#15803D",
    body: "#3F3F46",
    dot: "#22C55E",
    badge: "#DCFCE7",
  },
};

const DIFF_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ADDED: { label: "Added", color: "#15803D", bg: "#DCFCE7" },
  REMOVED: { label: "Removed", color: "#B91C1C", bg: "#FEE2E2" },
  MODIFIED_BROADER: { label: "Broadened", color: "#C2410C", bg: "#FFEDD5" },
  MODIFIED_NARROWER: { label: "Narrowed", color: "#C2410C", bg: "#FFEDD5" },
  NEUTRAL_REPHRASE: { label: "Rephrased", color: "#52525B", bg: "#F4F4F5" },
  UNCHANGED: { label: "Unchanged", color: "#A1A1AA", bg: "#F4F4F5" },
};

const CATEGORY_LABELS: Record<string, string> = {
  liability: "Liability",
  indemnity: "Indemnity",
  ip: "IP",
  termination: "Termination",
  data_protection: "Data Protection",
  payment: "Payment",
  confidentiality: "Confidentiality",
  governing_law: "Governing Law",
  audit_rights: "Audit Rights",
  other: "Other",
};

export function CompareResultCards({ result }: CompareResultCardsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("risks");

  const highRisks = result.risks.filter((r) => r.level === "HIGH").length;
  const medRisks = result.risks.filter((r) => r.level === "MEDIUM").length;
  const diffCount = result.differences.filter((d) => d.classification !== "UNCHANGED").length;
  const matchCount = result.alignment.filter((a) => a.status === "matched").length;

  const tabs: { id: TabId; label: string; icon: React.ElementType; badge?: string }[] = [
    {
      id: "risks",
      label: "Risks",
      icon: AlertTriangle,
      badge: result.risks.length > 0 ? String(result.risks.length) : undefined,
    },
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

        {activeTab === "risks" && highRisks > 0 && (
          <div className="ml-auto flex items-center gap-2 pr-2 pb-2 shrink-0">
            <StatPill label="High" count={highRisks} color="#DC2626" bg="#FEE2E2" />
            {medRisks > 0 && (
              <StatPill label="Medium" count={medRisks} color="#B45309" bg="#FEF3C7" />
            )}
          </div>
        )}
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
            {activeTab === "risks" && <RisksTab risks={result.risks} />}
            {activeTab === "differences" && <DifferencesTab differences={result.differences} />}
            {activeTab === "clauses" && <ClausesTab alignment={result.alignment} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function RisksTab({ risks }: { risks: CompareRiskFinding[] }) {
  if (risks.length === 0) {
    return <EmptyState message="No risk findings identified." />;
  }

  const sorted = [...risks].sort((a, b) => {
    const order: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.level] - order[b.level];
  });

  return (
    <div className="space-y-2.5">
      {sorted.map((risk) => (
        <RiskCard key={risk.id} risk={risk} />
      ))}
    </div>
  );
}

function RiskCard({ risk }: { risk: CompareRiskFinding }) {
  const [expanded, setExpanded] = useState(false);
  const colors = RISK_COLORS[risk.level];

  return (
    <motion.div
      layout
      className="rounded-xl overflow-hidden border"
      style={{ background: colors.bg, borderColor: colors.border }}
    >
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex-shrink-0 mt-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: colors.dot }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[11px] font-bold tracking-wide" style={{ color: colors.label }}>
              {risk.level}
            </span>
            <span
              className="text-[10.5px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: colors.badge, color: colors.label }}
            >
              {CATEGORY_LABELS[risk.category] ?? risk.category}
            </span>
          </div>
          <p
            className={`text-[13px] leading-[1.65] ${expanded ? "" : "line-clamp-3"}`}
            style={{ color: colors.body }}
          >
            {risk.rationale}
          </p>
        </div>

        <div className="flex-shrink-0 mt-0.5 text-[#A1A1AA]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-black/5">
              <div className="flex items-center gap-4 mt-3">
                <span className="text-[11px] text-[#A1A1AA]">
                  Confidence: {Math.round(risk.confidence * 100)}%
                </span>
                <span className="text-[11px] text-[#A1A1AA] capitalize">
                  Source: {risk.source}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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

function StatPill({
  label,
  count,
  color,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}
    >
      {count} {label}
    </span>
  );
}
