import React from "react";
import {
  Sparkles, Scale, RefreshCw, Edit3, ShieldAlert, AlertTriangle,
  ShieldCheck, BookOpen, Check, X,
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

export default function NegotiationPanel({
  agentMarkups, selectedMarkup, evaluating, isLocked,
  acceptingMarkupId, editingReplacement, draftingCompromise,
  onSelectMarkup, onAccept, onDismiss, onToggleEdit,
  onUpdateReplacement, onTriggerCompromise, onRerun,
}: NegotiationPanelProps) {
  return (
    <div className="xl:w-[380px] shrink-0 border-l border-[#E5E7EB] bg-white flex flex-col">

      {/* Panel header */}
      <div className="px-6 py-5 border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#111827]" />
            <span className="text-sm font-semibold text-[#111827]">AI Negotiation</span>
          </div>
          <div className="flex items-center gap-1.5">
            {evaluating ? (
              <span className="badge badge-neutral animate-pulse">Analyzing…</span>
            ) : agentMarkups.length > 0 ? (
              <span className="badge badge-warning">{agentMarkups.length} Active</span>
            ) : (
              <span className="badge badge-success">All Clear</span>
            )}
          </div>
        </div>

        {agentMarkups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {agentMarkups.map((m) => {
              const cfg = RISK_CONFIG[m.riskLevel];
              const isActive = selectedMarkup?.clauseId === m.clauseId;
              return (
                <button
                  key={m.clauseId}
                  onClick={() => onSelectMarkup(m)}
                  className={`px-2.5 py-1 rounded-md text-[0.6875rem] font-semibold border transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#111827] text-white border-[#111827]"
                      : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`
                  }`}
                >
                  {m.clauseId}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {selectedMarkup ? (
          <>
            <div>
              <p className="section-label mb-2">Negotiation Status</p>
              <div className="flex items-center gap-2">
                {(() => {
                  const cfg = RISK_CONFIG[selectedMarkup.riskLevel];
                  return (
                    <span className={`badge ${cfg.bg} ${cfg.text} ${cfg.border} border flex items-center gap-1`}>
                      {RISK_ICONS[selectedMarkup.riskLevel]}
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="text-xs text-[#6B7280]">
                  Clause <span className="font-semibold text-[#111827]">{selectedMarkup.clauseId}</span>
                </span>
              </div>
            </div>

            <div>
              <p className="section-label mb-2">Selected Clause</p>
              <div className="bg-red-50 border border-red-200 rounded-[8px] px-4 py-3">
                <p className="text-[0.8125rem] text-red-800 leading-relaxed line-through decoration-red-400">
                  {selectedMarkup.original}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="section-label">Suggested Revision</p>
                {!isLocked && (
                  <button
                    onClick={onToggleEdit}
                    className="flex items-center gap-1 text-[0.6875rem] font-medium text-[#6B7280] hover:text-[#111827] transition cursor-pointer"
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
                  className="input-base text-[0.8125rem] leading-relaxed min-h-[96px] resize-none"
                />
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-[8px] px-4 py-3">
                  <p className="text-[0.8125rem] text-emerald-800 leading-relaxed">{selectedMarkup.replacement}</p>
                </div>
              )}
            </div>

            <div>
              <p className="section-label mb-2">Reasoning</p>
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] px-4 py-3">
                <p className="text-[0.8125rem] text-[#374151] leading-relaxed">{selectedMarkup.reasoning}</p>
              </div>
            </div>

            {!isLocked && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onTriggerCompromise(false)}
                  disabled={draftingCompromise}
                  className="btn-secondary text-xs justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {draftingCompromise ? "Drafting…" : "Draft Compromise"}
                </button>
                <button
                  onClick={() => onTriggerCompromise(true)}
                  disabled={draftingCompromise}
                  className="btn-secondary text-xs justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Enforce Playbook
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
              <Scale className="w-5 h-5 text-[#9CA3AF]" />
            </div>
            <p className="text-sm font-medium text-[#374151]">
              {agentMarkups.length === 0 && !evaluating ? "No clauses flagged" : "No clause selected"}
            </p>
            <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
              {agentMarkups.length === 0 && !evaluating
                ? "The AI found no risk clauses, or evaluation hasn't run yet."
                : "Select a highlighted clause to review AI suggestions."}
            </p>
            {agentMarkups.length === 0 && !evaluating && (
              <button onClick={onRerun} className="btn-secondary mt-4 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
                Re-run Evaluation
              </button>
            )}
          </div>
        )}
      </div>

      {selectedMarkup && !isLocked && (
        <div className="px-6 py-4 border-t border-[#E5E7EB] flex items-center gap-3">
          <button
            onClick={() => onAccept(selectedMarkup)}
            disabled={acceptingMarkupId === selectedMarkup.clauseId}
            className="btn-primary flex-1 justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            {acceptingMarkupId === selectedMarkup.clauseId ? "Applying…" : "Accept"}
          </button>
          <button
            onClick={() => onDismiss(selectedMarkup.clauseId)}
            className="btn-secondary px-4 justify-center text-sm"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
