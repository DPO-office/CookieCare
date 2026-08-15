import React from "react";
import {
  Sparkles,
  Scale,
  RefreshCw,
  Edit3,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  BookOpen,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { AgentMarkup } from "../types";
import { RISK_CONFIG } from "../constants";

interface NegotiationPanelProps {
  agentMarkups: AgentMarkup[];
  selectedMarkup: AgentMarkup | null;
  evaluating: boolean;
  isLocked: boolean;
  acceptingMarkupId: string | null;
  editingReplacement: boolean;
  draftingCompromise: boolean;
  onSelectMarkup: (m: AgentMarkup) => void;
  onAccept: (m: AgentMarkup) => void;
  onDismiss: (clauseId: string) => void;
  onToggleEdit: () => void;
  onUpdateReplacement: (val: string) => void;
  onTriggerCompromise: (playbookPreferred: boolean) => void;
  onRerun: () => void;
}

const RISK_ICONS: Record<string, React.ReactNode> = {
  RED: <ShieldAlert className="w-3.5 h-3.5" />,
  YELLOW: <AlertTriangle className="w-3.5 h-3.5" />,
  GREEN: <ShieldCheck className="w-3.5 h-3.5" />,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
      {children}
    </p>
  );
}

function StatusPill({
  evaluating,
  count,
}: {
  evaluating: boolean;
  count: number;
}) {
  if (evaluating) {
    return (
      <span className="score-badge bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4F5BD9]" />
        Analyzing
      </span>
    );
  }
  if (count > 0) {
    return (
      <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
        <span className="h-1.5 w-1.5 rounded-full bg-[#C9843A]" />
        {count} Active
      </span>
    );
  }
  return (
    <span className="score-badge bg-badge-green text-[11px] font-medium text-badge-green-text">
      <span className="h-1.5 w-1.5 rounded-full bg-[#3D9B8F]" />
      All clear
    </span>
  );
}

export default function NegotiationPanel({
  agentMarkups,
  selectedMarkup,
  evaluating,
  isLocked,
  acceptingMarkupId,
  editingReplacement,
  draftingCompromise,
  onSelectMarkup,
  onAccept,
  onDismiss,
  onToggleEdit,
  onUpdateReplacement,
  onTriggerCompromise,
  onRerun,
}: NegotiationPanelProps) {
  const isAccepting = acceptingMarkupId === selectedMarkup?.clauseId;

  return (
    <aside
      className="flex h-full w-[360px] min-h-0 shrink-0 flex-col overflow-hidden rounded-[24px] bg-white font-sans"
      style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
    >
      <div className="shrink-0 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
              AI negotiation
            </span>
          </div>
          <StatusPill evaluating={evaluating} count={agentMarkups.length} />
        </div>

        {agentMarkups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agentMarkups.map((m) => {
              const isActive = selectedMarkup?.clauseId === m.clauseId;
              return (
                <button
                  key={m.clauseId}
                  type="button"
                  onClick={() => onSelectMarkup(m)}
                  className={`cursor-pointer rounded-full border-none px-3 py-1 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "bg-[#111827] text-white"
                      : "bg-[#F7F8FB] text-[#667085] hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                  }`}
                >
                  {m.clauseId}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="negotiate-scroll scrollbar-hide flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {selectedMarkup ? (
          <>
            <div className="rounded-[18px] bg-[#F7F8FB] p-4">
              <SectionLabel>Negotiation status</SectionLabel>
              <div className="flex flex-wrap items-center gap-2.5">
                {(() => {
                  const cfg = RISK_CONFIG[selectedMarkup.riskLevel];
                  const riskBadge =
                    selectedMarkup.riskLevel === "RED"
                      ? "bg-badge-red text-badge-red-text"
                      : selectedMarkup.riskLevel === "YELLOW"
                        ? "bg-badge-yellow text-badge-yellow-text"
                        : "bg-badge-green text-badge-green-text";
                  return (
                    <span className={`score-badge text-[11px] font-medium ${riskBadge}`}>
                      {RISK_ICONS[selectedMarkup.riskLevel]}
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="text-[12px] text-[#98A2B3]">
                  Clause{" "}
                  <span className="font-semibold text-[#1a1a1a]">{selectedMarkup.clauseId}</span>
                </span>
              </div>
            </div>

            <div>
              <SectionLabel>Original clause</SectionLabel>
              <div className="rounded-[18px] bg-badge-red px-4 py-3.5">
                <p className="m-0 text-[13px] leading-relaxed text-badge-red-text line-through decoration-[#FECACA]">
                  {selectedMarkup.original}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Suggested revision</SectionLabel>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={onToggleEdit}
                    className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-[11px] font-medium text-[#667085] transition hover:text-[#4F5BD9]"
                  >
                    <Edit3 className="w-3 h-3" />
                    {editingReplacement ? "Done" : "Edit"}
                  </button>
                )}
              </div>
              {editingReplacement ? (
                <textarea
                  value={selectedMarkup.replacement}
                  onChange={(e) => onUpdateReplacement(e.target.value)}
                  className="min-h-[100px] w-full resize-none rounded-[18px] border-none bg-[#F7F8FB] px-4 py-3 text-[13px] leading-relaxed text-[#1a1a1a] outline-none focus:shadow-[0_0_0_3px_rgba(79,91,217,0.14)]"
                />
              ) : (
                <div className="rounded-[18px] bg-badge-green px-4 py-3.5">
                  <p className="m-0 text-[13px] leading-relaxed text-badge-green-text">
                    {selectedMarkup.replacement}
                  </p>
                </div>
              )}
            </div>

            <div>
              <SectionLabel>Reasoning</SectionLabel>
              <div className="rounded-[18px] bg-[#F7F8FB] px-4 py-3.5">
                <p className="m-0 text-[13px] leading-relaxed text-[#667085]">
                  {selectedMarkup.reasoning}
                </p>
              </div>
            </div>

            {!isLocked && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onTriggerCompromise(false)}
                  disabled={draftingCompromise}
                  className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-[#EEF2FF] px-3 text-[12px] font-medium text-[#4F5BD9] transition hover:bg-[#e4e9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {draftingCompromise ? "Drafting…" : "Compromise"}
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerCompromise(true)}
                  disabled={draftingCompromise}
                  className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-[#EEF2FF] px-3 text-[12px] font-medium text-[#4F5BD9] transition hover:bg-[#e4e9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Playbook
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <Scale className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <p className="m-0 text-[13px] font-semibold text-[#1a1a1a]">
              {agentMarkups.length === 0 && !evaluating
                ? "No clauses flagged"
                : "No clause selected"}
            </p>
            <p className="m-0 mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-[#667085]">
              {agentMarkups.length === 0 && !evaluating
                ? "The AI found no risk clauses, or evaluation hasn't run yet."
                : "Select a highlighted clause in the document to review AI suggestions."}
            </p>
            {agentMarkups.length === 0 && !evaluating && (
              <button
                type="button"
                onClick={onRerun}
                className="mt-5 inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-none bg-[#EEF2FF] px-4 text-[12px] font-medium text-[#4F5BD9] transition hover:bg-[#e4e9ff]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-run evaluation
              </button>
            )}
          </div>
        )}
      </div>

      {selectedMarkup && !isLocked && (
        <div className="shrink-0 bg-white px-5 py-4">
          <p className="m-0 mb-3 truncate text-[11px] text-[#98A2B3]">
            Reviewing{" "}
            <span className="font-semibold text-[#667085]">{selectedMarkup.clauseId}</span>
            {" · "}
            {RISK_CONFIG[selectedMarkup.riskLevel].label}
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onAccept(selectedMarkup)}
              disabled={isAccepting}
              className="primary-gradient inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border-none text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAccepting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isAccepting ? "Applying…" : "Accept revision"}
            </button>

            <button
              type="button"
              onClick={() => onDismiss(selectedMarkup.clauseId)}
              disabled={isAccepting}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-[#F7F8FB] px-5 text-[13px] font-medium text-[#667085] transition hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
