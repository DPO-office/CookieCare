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
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C4C4C4] mb-2 m-0">
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F4F5] text-[11px] font-medium text-[#52525B]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#18181B] animate-pulse" />
        Analyzing
      </span>
    );
  }
  if (count > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[11px] font-medium text-[#92400E]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
        {count} Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[11px] font-medium text-[#047857]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
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
    <aside className="w-full xl:w-[400px] shrink-0 border-l border-[#EBEBEB] bg-white flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F4F4F5] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F4F4F5] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#18181B]" />
            </div>
            <span className="text-[14px] font-semibold text-[#18181B]">AI negotiation</span>
          </div>
          <StatusPill evaluating={evaluating} count={agentMarkups.length} />
        </div>

        {agentMarkups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agentMarkups.map((m) => {
              const cfg = RISK_CONFIG[m.riskLevel];
              const isActive = selectedMarkup?.clauseId === m.clauseId;
              return (
                <button
                  key={m.clauseId}
                  type="button"
                  onClick={() => onSelectMarkup(m)}
                  className={[
                    "px-3 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer",
                    isActive
                      ? "bg-[#18181B] text-white border-[#18181B]"
                      : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-90`,
                  ].join(" ")}
                >
                  {m.clauseId}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {selectedMarkup ? (
          <>
            <div className="bg-[#FAFAFA] border border-[#F0F0F0] rounded-2xl p-4">
              <SectionLabel>Negotiation status</SectionLabel>
              <div className="flex items-center gap-2.5 flex-wrap">
                {(() => {
                  const cfg = RISK_CONFIG[selectedMarkup.riskLevel];
                  return (
                    <span
                      className={[
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                        cfg.bg,
                        cfg.text,
                        cfg.border,
                      ].join(" ")}
                    >
                      {RISK_ICONS[selectedMarkup.riskLevel]}
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="text-[12px] text-[#A1A1AA]">
                  Clause{" "}
                  <span className="font-semibold text-[#18181B]">{selectedMarkup.clauseId}</span>
                </span>
              </div>
            </div>

            <div>
              <SectionLabel>Original clause</SectionLabel>
              <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl px-4 py-3.5">
                <p className="text-[13px] text-[#991B1B] leading-relaxed line-through decoration-[#FCA5A5] m-0">
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
                    className="flex items-center gap-1 text-[11px] font-medium text-[#71717A] hover:text-[#18181B] transition border-none bg-transparent cursor-pointer"
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
                  className="w-full rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3 text-[13px] leading-relaxed text-[#18181B] resize-none outline-none focus:border-[#D4D4D8] focus:ring-2 focus:ring-[#18181B]/5 transition min-h-[100px]"
                />
              ) : (
                <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl px-4 py-3.5">
                  <p className="text-[13px] text-[#166534] leading-relaxed m-0">
                    {selectedMarkup.replacement}
                  </p>
                </div>
              )}
            </div>

            <div>
              <SectionLabel>Reasoning</SectionLabel>
              <div className="bg-white border border-[#EBEBEB] rounded-2xl px-4 py-3.5">
                <p className="text-[13px] text-[#52525B] leading-relaxed m-0">
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
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full border border-[#E4E4E7] bg-white text-[12px] font-medium text-[#52525B] hover:bg-[#FAFAFA] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  {draftingCompromise ? "Drafting…" : "Compromise"}
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerCompromise(true)}
                  disabled={draftingCompromise}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full border border-[#E4E4E7] bg-white text-[12px] font-medium text-[#52525B] hover:bg-[#FAFAFA] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  Playbook
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F4F4F5] flex items-center justify-center mb-4">
              <Scale className="w-5 h-5 text-[#A1A1AA]" />
            </div>
            <p className="text-[13px] font-semibold text-[#18181B] m-0">
              {agentMarkups.length === 0 && !evaluating
                ? "No clauses flagged"
                : "No clause selected"}
            </p>
            <p className="text-[12px] text-[#A1A1AA] mt-1.5 leading-relaxed max-w-[220px] m-0">
              {agentMarkups.length === 0 && !evaluating
                ? "The AI found no risk clauses, or evaluation hasn't run yet."
                : "Select a highlighted clause in the document to review AI suggestions."}
            </p>
            {agentMarkups.length === 0 && !evaluating && (
              <button
                type="button"
                onClick={onRerun}
                className="mt-5 inline-flex items-center gap-2 h-9 px-4 rounded-full border border-[#E4E4E7] bg-white text-[12px] font-medium text-[#52525B] hover:bg-[#FAFAFA] transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-run evaluation
              </button>
            )}
          </div>
        )}
      </div>

      {selectedMarkup && !isLocked && (
        <div className="shrink-0 border-t border-[#F0F0F0] bg-white px-5 py-4">
          <p className="text-[11px] text-[#A1A1AA] mb-3 truncate m-0">
            Reviewing{" "}
            <span className="font-semibold text-[#52525B]">{selectedMarkup.clauseId}</span>
            {" · "}
            {RISK_CONFIG[selectedMarkup.riskLevel].label}
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onAccept(selectedMarkup)}
              disabled={isAccepting}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-full bg-[#18181B] text-white text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
            >
              {isAccepting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {isAccepting ? "Applying…" : "Accept revision"}
            </button>

            <button
              type="button"
              onClick={() => onDismiss(selectedMarkup.clauseId)}
              disabled={isAccepting}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full border border-[#E4E4E7] bg-white text-[13px] font-medium text-[#52525B] hover:bg-[#FEF2F2] hover:text-[#DC2626] hover:border-[#FECACA] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
