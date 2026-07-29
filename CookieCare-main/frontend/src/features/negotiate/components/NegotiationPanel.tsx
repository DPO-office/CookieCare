import React from "react";
import {
  Sparkles, Scale, RefreshCw, Edit3, ShieldAlert, AlertTriangle,
  ShieldCheck, BookOpen, Check, X, Loader2,
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
  RED:    <ShieldAlert   className="w-3.5 h-3.5" />,
  YELLOW: <AlertTriangle className="w-3.5 h-3.5" />,
  GREEN:  <ShieldCheck   className="w-3.5 h-3.5" />,
};

/* ── Tiny section label ─────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
      {children}
    </p>
  );
}

export default function NegotiationPanel({
  agentMarkups, selectedMarkup, evaluating, isLocked,
  acceptingMarkupId, editingReplacement, draftingCompromise,
  onSelectMarkup, onAccept, onDismiss, onToggleEdit,
  onUpdateReplacement, onTriggerCompromise, onRerun,
}: NegotiationPanelProps) {

  const isAccepting = acceptingMarkupId === selectedMarkup?.clauseId;

  return (
    <div className="xl:w-[400px] shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">

      {/* ── Panel header ──────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "#1D6FD8" }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold text-gray-900">AI Negotiation</span>
          </div>

          {/* Status pill */}
          {evaluating ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-semibold text-blue-700">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Analyzing…
            </span>
          ) : agentMarkups.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {agentMarkups.length} Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              All Clear
            </span>
          )}
        </div>

        {/* Clause selector chips */}
        {agentMarkups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agentMarkups.map((m) => {
              const cfg = RISK_CONFIG[m.riskLevel];
              const isActive = selectedMarkup?.clauseId === m.clauseId;
              return (
                <button
                  key={m.clauseId}
                  onClick={() => onSelectMarkup(m)}
                  className={[
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all",
                    isActive
                      ? "text-white border-transparent"
                      : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`,
                  ].join(" ")}
                  style={isActive ? { background: "#1D6FD8", borderColor: "#1D6FD8" } : {}}
                >
                  {m.clauseId}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {selectedMarkup ? (
          <>
            {/* Card: Negotiation Status */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <SectionLabel>Negotiation Status</SectionLabel>
              <div className="flex items-center gap-2.5">
                {(() => {
                  const cfg = RISK_CONFIG[selectedMarkup.riskLevel];
                  return (
                    <span className={[
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border",
                      cfg.bg, cfg.text, cfg.border,
                    ].join(" ")}>
                      {RISK_ICONS[selectedMarkup.riskLevel]}
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="text-[12px] text-gray-500">
                  Clause{" "}
                  <span className="font-semibold text-gray-900">{selectedMarkup.clauseId}</span>
                </span>
              </div>
            </div>

            {/* Card: Original Clause */}
            <div>
              <SectionLabel>Original Clause</SectionLabel>
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
                <p className="text-[12.5px] text-red-800 leading-relaxed line-through decoration-red-400 decoration-1">
                  {selectedMarkup.original}
                </p>
              </div>
            </div>

            {/* Card: Suggested Revision */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Suggested Revision</SectionLabel>
                {!isLocked && (
                  <button
                    onClick={onToggleEdit}
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 transition"
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
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[12.5px] leading-relaxed text-gray-900 resize-none outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition min-h-[100px]"
                />
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5">
                  <p className="text-[12.5px] text-emerald-800 leading-relaxed">
                    {selectedMarkup.replacement}
                  </p>
                </div>
              )}
            </div>

            {/* Card: Reasoning */}
            <div>
              <SectionLabel>Reasoning</SectionLabel>
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
                <p className="text-[12.5px] text-gray-600 leading-relaxed">
                  {selectedMarkup.reasoning}
                </p>
              </div>
            </div>

            {/* Compromise actions */}
            {!isLocked && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => onTriggerCompromise(false)}
                  disabled={draftingCompromise}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5 text-gray-500" />
                  {draftingCompromise ? "Drafting…" : "Compromise"}
                </button>
                <button
                  onClick={() => onTriggerCompromise(true)}
                  disabled={draftingCompromise}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                  Playbook
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Empty state ───────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Scale className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-[13px] font-semibold text-gray-700">
              {agentMarkups.length === 0 && !evaluating
                ? "No clauses flagged"
                : "No clause selected"}
            </p>
            <p className="text-[12px] text-gray-400 mt-1.5 leading-relaxed max-w-[220px]">
              {agentMarkups.length === 0 && !evaluating
                ? "The AI found no risk clauses, or evaluation hasn't run yet."
                : "Select a highlighted clause in the document to review AI suggestions."}
            </p>
            {agentMarkups.length === 0 && !evaluating && (
              <button
                onClick={onRerun}
                className="mt-5 inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-run Evaluation
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky action footer — Accept / Reject ────────────── */}
      {selectedMarkup && !isLocked && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
          {/* Context line */}
          <p className="text-[11px] text-gray-400 mb-3 truncate">
            Reviewing{" "}
            <span className="font-semibold text-gray-700">{selectedMarkup.clauseId}</span>
            {" — "}
            {RISK_CONFIG[selectedMarkup.riskLevel].label}
          </p>

          <div className="flex items-center gap-2.5">
            {/* Accept — primary */}
            <button
              onClick={() => onAccept(selectedMarkup)}
              disabled={isAccepting}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-xl text-white text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#1D6FD8" }}
            >
              {isAccepting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Check className="w-4 h-4" />}
              {isAccepting ? "Applying…" : "Accept Revision"}
            </button>

            {/* Reject — secondary */}
            <button
              onClick={() => onDismiss(selectedMarkup.clauseId)}
              disabled={isAccepting}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


