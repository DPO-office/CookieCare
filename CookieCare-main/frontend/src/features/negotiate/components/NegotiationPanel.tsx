import React, { useState, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
  Zap,
  ArrowUp,
  AlertCircle,
} from "lucide-react";
import { AgentMarkup, NegotiationStrategy, StrategyDraftResult } from "../types";
import { RISK_CONFIG } from "../constants";

interface NegotiationPanelProps {
  agentMarkups: AgentMarkup[];
  selectedMarkup: AgentMarkup | null;
  evaluating: boolean;
  isLocked: boolean;
  acceptingMarkupId: string | null;
  editingReplacement: boolean;
  draftingCompromise: boolean;
  negotiationStrategy: NegotiationStrategy | null;
  strategyDraftResult: StrategyDraftResult | null;
  userInstruction: string;
  /** authToken kept in signature for potential future use — not used here */
  authToken: string;
  onSelectMarkup: (m: AgentMarkup) => void;
  onAccept: (m: AgentMarkup) => void;
  onDismiss: (clauseId: string) => void;
  onToggleEdit: () => void;
  onUpdateReplacement: (val: string) => void;
  /** Draft from a specific strategy tier */
  onDraftFromStrategy: (tier: "preferred" | "balanced" | "fallback") => void;
  onUserInstructionChange: (val: string) => void;
  onRerun: () => void;
  /**
   * Playbook selected at the entry screen. Read-only in the workspace —
   * displayed as a pill so the user can see which playbook is active.
   */
  selectedPlaybook: { id: string; name: string } | null;
  /**
   * @deprecated kept so the NegotiateHub call-site compiles; never called here.
   */
  onSelectedPlaybookChange: (p: { id: string; name: string } | null) => void;
  /** True when a manual text selection is pending. */
  hasManualSelection?: boolean;
  /** The raw selected text string shown as a preview. */
  manualSelectionText?: string;
  /** Clears the manual selection and overlay. */
  onClearManualSelection?: () => void;
  /** Inline error from the hook (replaces blocking alert()). Null when no error. */
  negotiateError?: string | null;
  /** Clears the inline error. */
  onClearNegotiateError?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_ICONS: Record<string, React.ReactNode> = {
  RED:    <ShieldAlert className="w-3 h-3" />,
  YELLOW: <AlertTriangle className="w-3 h-3" />,
  GREEN:  <ShieldCheck className="w-3 h-3" />,
};

const TIER_META = {
  preferred: {
    label: "Preferred",
    activeClass:   "bg-[#4F5BD9] text-white border-[#4F5BD9]",
    inactiveClass: "bg-white text-[#4F5BD9] border-[#C7D0F8] hover:border-[#4F5BD9] hover:bg-[#EEF2FF]",
    dot: "bg-[#4F5BD9]",
  },
  balanced: {
    label: "Balanced",
    activeClass:   "bg-[#667085] text-white border-[#667085]",
    inactiveClass: "bg-white text-[#667085] border-[#D0D5DD] hover:border-[#667085] hover:bg-[#F7F8FB]",
    dot: "bg-[#667085]",
  },
  fallback: {
    label: "Fallback",
    activeClass:   "bg-[#98A2B3] text-white border-[#98A2B3]",
    inactiveClass: "bg-white text-[#98A2B3] border-[#E4E7EC] hover:border-[#98A2B3] hover:bg-[#F9FAFB]",
    dot: "bg-[#98A2B3]",
  },
} as const;

type Tier = keyof typeof TIER_META;
const TIERS: Tier[] = ["preferred", "balanced", "fallback"];

// ── Small shared components ───────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
      {children}
    </p>
  );
}

function StatusPill({ evaluating, count }: { evaluating: boolean; count: number }) {
  if (evaluating)
    return (
      <span className="score-badge bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4F5BD9]" />
        Analyzing
      </span>
    );
  if (count > 0)
    return (
      <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
        <span className="h-1.5 w-1.5 rounded-full bg-[#C9843A]" />
        {count} finding{count !== 1 ? "s" : ""}
      </span>
    );
  return (
    <span className="score-badge bg-badge-green text-[11px] font-medium text-badge-green-text">
      <span className="h-1.5 w-1.5 rounded-full bg-[#3D9B8F]" />
      All clear
    </span>
  );
}

// ── Tier pills (compact row, used when no strategy is available) ──────────────

function TierPills({
  selectedTier,
  onSelect,
}: {
  selectedTier: Tier;
  onSelect: (t: Tier) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {TIERS.map((tier) => {
        const cfg = TIER_META[tier];
        const isActive = selectedTier === tier;
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onSelect(tier)}
            className={`flex-1 cursor-pointer rounded-full border py-1 text-[10.5px] font-semibold transition-all ${
              isActive ? cfg.activeClass : cfg.inactiveClass
            }`}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function NegotiationPanel({
  agentMarkups,
  selectedMarkup,
  evaluating,
  isLocked,
  acceptingMarkupId,
  editingReplacement,
  draftingCompromise,
  negotiationStrategy,
  strategyDraftResult,
  userInstruction,
  onSelectMarkup,
  onAccept,
  onDismiss,
  onToggleEdit,
  onUpdateReplacement,
  onDraftFromStrategy,
  onUserInstructionChange,
  onRerun,
  selectedPlaybook,
  hasManualSelection = false,
  manualSelectionText = "",
  onClearManualSelection,
  negotiateError = null,
  onClearNegotiateError,
}: NegotiationPanelProps) {
  const isAccepting = acceptingMarkupId === selectedMarkup?.clauseId;
  const [selectedTier, setSelectedTier] = useState<Tier>("preferred");

  /** True when selectedMarkup is a synthetic manual-draft markup. */
  const isManualDraft = !!selectedMarkup?.clauseId.startsWith("manual-");

  // Reset tier when switching findings
  useEffect(() => { setSelectedTier("preferred"); }, [selectedMarkup?.clauseId]);

  // Findings nav
  const currentIdx = selectedMarkup
    ? agentMarkups.findIndex((m) => m.clauseId === selectedMarkup.clauseId)
    : -1;
  const goTo = (idx: number) => {
    const m = agentMarkups[idx];
    if (m) onSelectMarkup(m);
  };

  // hasDraft: a proposal exists AND it belongs to the currently selected tier.
  // When the user switches tiers this becomes false, preventing a stale Accept.
  const hasDraft = !!strategyDraftResult && strategyDraftResult.draftMeta.tier === selectedTier;

  // Show legacy AI suggestion only when there is no strategy at all yet
  const showAiSuggestion = !hasDraft && !negotiationStrategy && !!selectedMarkup?.replacement;

  // #8: Accept is only safe when:
  //   - there IS a draft and it matches the current tier (hasDraft), OR
  //   - there is NO strategyDraftResult at all (legacy AI suggestion path or
  //     the user accepted a pre-loaded AI replacement directly)
  // This prevents silently accepting a stale tier-A proposal while tier-B is shown.
  const acceptBlocked = !!strategyDraftResult && !hasDraft;

  // HIGH-1 FIX: Block Accept when the user has an active manual selection but
  // selectedMarkup is still pointing at an AI finding (not a manual draft).
  // In this state the panel shows "Manual Revision" mode, but Accept would
  // silently modify the AI finding's clause instead of the user's selected text.
  // Disable Accept with a clear tooltip until the conflict is resolved.
  const acceptBlockedByManualConflict = hasManualSelection && !!selectedMarkup && !isManualDraft;

  // Labels for Accept/Reject adapt to manual vs AI context (#11)
  const acceptLabel  = isManualDraft ? "Accept Revision" : "Accept";
  const rejectLabel  = isManualDraft ? "Reject Revision" : "Reject";

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[24px] bg-white font-sans w-full"
      style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
    >
      {/* ── Header ── */}
      <div className="shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                Negotiate
              </span>
              {selectedPlaybook && (
                <p className="m-0 mt-0.5 flex items-center gap-1 text-[10.5px] text-[#667085]">
                  <BookOpen className="h-2.5 w-2.5 shrink-0 text-[#4F5BD9]" />
                  <span className="truncate max-w-[140px]">{selectedPlaybook.name}</span>
                </p>
              )}
            </div>
          </div>
          <StatusPill evaluating={evaluating} count={agentMarkups.length} />
        </div>

        {/* Compact findings nav — hide the nav counter for manual drafts since
            they are synthetic entries not part of the AI findings list */}
        {agentMarkups.length > 0 && selectedMarkup && !isManualDraft && (
          <div className="mt-3 flex items-center justify-between rounded-[12px] bg-[#F7F8FB] px-3 py-1.5">
            <button
              type="button"
              onClick={() => goTo(currentIdx - 1)}
              disabled={currentIdx <= 0}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#667085] transition hover:bg-[#EEF2FF] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2">
              {(() => {
                const rc =
                  selectedMarkup.riskLevel === "RED"   ? "bg-badge-red text-badge-red-text"
                  : selectedMarkup.riskLevel === "YELLOW" ? "bg-badge-yellow text-badge-yellow-text"
                  : "bg-badge-green text-badge-green-text";
                return (
                  <span className={`score-badge text-[10.5px] font-medium ${rc}`}>
                    {RISK_ICONS[selectedMarkup.riskLevel]}
                    {RISK_CONFIG[selectedMarkup.riskLevel].label}
                  </span>
                );
              })()}
              <span className="text-[11px] text-[#98A2B3]">
                {currentIdx + 1} <span className="text-[#C0C9D4]">/</span> {agentMarkups.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => goTo(currentIdx + 1)}
              disabled={currentIdx >= agentMarkups.length - 1}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#667085] transition hover:bg-[#EEF2FF] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="negotiate-scroll scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 pb-4 space-y-3.5">
        {selectedMarkup ? (
          <>
            {/* Priority banner — manual selection takes precedence over AI finding */}
            {hasManualSelection && !isManualDraft && (
              <div className="flex items-start gap-2 rounded-[12px] bg-[#F0F4FF] border border-[#C7D0F8] px-3.5 py-2.5">
                <span className="mt-0.5 text-[#4F5BD9] text-[13px] leading-none shrink-0">✦</span>
                <p className="m-0 text-[11.5px] leading-relaxed text-[#4F5BD9]">
                  Your instruction will revise the <strong>selected text</strong>, not the AI finding shown below.
                </p>
              </div>
            )}

            {/* Finding card — show for AI findings; manual drafts show their own content */}
            {!isManualDraft && (
              <div className="rounded-[16px] bg-[#F7F8FB] px-4 py-3">
                <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                  Why this matters
                </p>
                <p className="m-0 text-[12px] leading-relaxed text-[#344054]">
                  {selectedMarkup.reasoning}
                </p>
                <div className="mt-2.5 rounded-[10px] bg-[#FEF2F2] px-3 py-2">
                  <p className="m-0 text-[11.5px] leading-relaxed text-[#B91C1C] line-through decoration-[#FECACA]">
                    {selectedMarkup.original}
                  </p>
                </div>
              </div>
            )}

            {/* For manual drafts show the selected text as context */}
            {isManualDraft && (
              <div className="rounded-[16px] bg-[#F7F8FB] px-4 py-3">
                <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                  Selected text
                </p>
                <div className="rounded-[10px] bg-[#F1F5F9] px-3 py-2">
                  <p className="m-0 text-[11.5px] leading-relaxed text-[#475569] italic">
                    "{selectedMarkup.original}"
                  </p>
                </div>
              </div>
            )}

            {/* ── PRE-DRAFT view ── */}
            {!hasDraft && (
              <>
                {/* Legacy AI suggestion — only shown when no strategy available */}
                {showAiSuggestion && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>AI suggestion</Label>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={onToggleEdit}
                          className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-[10.5px] font-medium text-[#667085] transition hover:text-[#4F5BD9]"
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
                        className="min-h-[80px] w-full resize-none rounded-[14px] border-none bg-[#F7F8FB] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#1a1a1a] outline-none focus:shadow-[0_0_0_3px_rgba(79,91,217,0.14)]"
                      />
                    ) : (
                      <div className="rounded-[14px] bg-badge-green px-3.5 py-3">
                        <p className="m-0 text-[12px] leading-relaxed text-badge-green-text">
                          {selectedMarkup.replacement}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Draft button */}
                {!isLocked && (
                  <>
                    <button
                      type="button"
                      onClick={() => onDraftFromStrategy(selectedTier)}
                      disabled={draftingCompromise || (hasManualSelection && !userInstruction.trim())}
                      className="inline-flex w-full h-10 cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-[#EEF2FF] px-4 text-[12.5px] font-semibold text-[#4F5BD9] transition hover:bg-[#e4e9ff] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {draftingCompromise ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Drafting…
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5" />
                          {isManualDraft ? "Re-draft revision" : `Draft ${TIER_META[selectedTier].label} proposal`}
                        </>
                      )}
                    </button>
                    {hasManualSelection && !userInstruction.trim() && !draftingCompromise && (
                      <p className="m-0 text-center text-[11px] text-[#98A2B3]">
                        Add an instruction below to draft a revision.
                      </p>
                    )}
                  </>
                )}

                {/* Strategy section — hidden for manual drafts (#9) */}
                {!isManualDraft && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Strategy</Label>
                      {negotiationStrategy?.basisSource === "playbook" && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[#4F5BD9]">
                          <BookOpen className="w-2.5 h-2.5" />
                          Playbook-backed
                        </span>
                      )}
                    </div>

                    {negotiationStrategy ? (
                      <div className="flex flex-col gap-1.5">
                        {TIERS.map((tier) => {
                          const cfg = TIER_META[tier];
                          const pos = negotiationStrategy[tier];
                          const isActive = selectedTier === tier;
                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => setSelectedTier(tier)}
                              className={`w-full cursor-pointer rounded-[12px] border px-3 py-2.5 text-left transition-all ${
                                isActive ? cfg.activeClass : cfg.inactiveClass
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-white opacity-80" : cfg.dot}`} />
                                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]">
                                  {cfg.label}
                                </span>
                                {pos.source === "playbook" && (
                                  <span className={`ml-auto text-[10px] font-medium ${isActive ? "opacity-70" : "text-[#98A2B3]"}`}>
                                    Playbook
                                  </span>
                                )}
                              </div>
                              <p className={`m-0 text-[12px] leading-snug ${isActive ? "text-white" : "text-[#344054]"}`}>
                                {pos.position}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[12px] border border-dashed border-[#E4E7EC] bg-[#F9FAFB] px-4 py-3 text-center">
                        {draftingCompromise ? (
                          <div className="flex items-center justify-center gap-2 text-[11.5px] text-[#667085]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#4F5BD9]" />
                            Building strategy…
                          </div>
                        ) : (
                          <p className="m-0 text-[11.5px] text-[#98A2B3]">
                            Strategy will appear after drafting.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── POST-DRAFT view ── */}
            {hasDraft && strategyDraftResult && (
              <>
                {/* Proposed revision */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>{isManualDraft ? "User-directed revision" : "Proposed revision"}</Label>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={onToggleEdit}
                        className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-[10.5px] font-medium text-[#667085] transition hover:text-[#4F5BD9]"
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
                      className="min-h-[100px] w-full resize-none rounded-[14px] border-none bg-[#F7F8FB] px-3.5 py-3 text-[12px] leading-relaxed text-[#1a1a1a] outline-none focus:shadow-[0_0_0_3px_rgba(79,91,217,0.14)]"
                    />
                  ) : (
                    <div className="rounded-[14px] bg-badge-green px-3.5 py-3">
                      <p className="m-0 text-[12px] leading-relaxed text-badge-green-text">
                        {selectedMarkup.replacement}
                      </p>
                    </div>
                  )}

                  {/* Provenance line (#10) */}
                  <p className="m-0 mt-1.5 text-[10.5px] leading-snug text-[#98A2B3]">
                    {isManualDraft
                      ? "User-directed"
                      : strategyDraftResult.draftMeta.source === "playbook"
                        ? "Playbook-backed"
                        : "AI-suggested"}
                    {typeof strategyDraftResult.draftMeta.confidence === "number" &&
                      ` · ${Math.round(strategyDraftResult.draftMeta.confidence * 100)}% confidence`}
                    {!isManualDraft && strategyDraftResult.draftMeta.rationale &&
                      ` · ${strategyDraftResult.draftMeta.rationale}`}
                  </p>
                </div>

                {/* Strategy tier selector — hidden for manual drafts (#9) */}
                {!isManualDraft && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Strategy</Label>
                      {negotiationStrategy?.basisSource === "playbook" && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[#4F5BD9]">
                          <BookOpen className="w-2.5 h-2.5" />
                          Playbook-backed
                        </span>
                      )}
                    </div>
                    {negotiationStrategy ? (
                      <div className="flex flex-col gap-1.5">
                        {TIERS.map((tier) => {
                          const cfg = TIER_META[tier];
                          const pos = negotiationStrategy[tier];
                          const isActive = selectedTier === tier;
                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => setSelectedTier(tier)}
                              className={`w-full cursor-pointer rounded-[12px] border px-3 py-2.5 text-left transition-all ${
                                isActive ? cfg.activeClass : cfg.inactiveClass
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-white opacity-80" : cfg.dot}`} />
                                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]">
                                  {cfg.label}
                                </span>
                                {pos.source === "playbook" && (
                                  <span className={`ml-auto text-[10px] font-medium ${isActive ? "opacity-70" : "text-[#98A2B3]"}`}>
                                    Playbook
                                  </span>
                                )}
                              </div>
                              <p className={`m-0 text-[12px] leading-snug ${isActive ? "text-white" : "text-[#344054]"}`}>
                                {pos.position}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <TierPills selectedTier={selectedTier} onSelect={setSelectedTier} />
                    )}
                  </div>
                )}

                {/* Re-draft button */}
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => onDraftFromStrategy(selectedTier)}
                    disabled={draftingCompromise}
                    className="inline-flex w-full h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#E4E7EC] bg-white px-4 text-[11.5px] font-medium text-[#667085] transition hover:border-[#4F5BD9] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {draftingCompromise ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {draftingCompromise
                      ? "Drafting…"
                      : isManualDraft
                        ? "Re-draft revision"
                        : `Re-draft as ${TIER_META[selectedTier].label.toLowerCase()}`}
                  </button>
                )}
              </>
            )}

            {/* #8: Stale-tier notice — shown when a draft exists for a DIFFERENT
                tier than the currently selected one. Accept is blocked. */}
            {acceptBlocked && !isManualDraft && (
              <div className="flex items-center gap-2 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#B45309]" />
                <p className="m-0 text-[11.5px] text-[#92400E]">
                  Draft belongs to the <strong>{strategyDraftResult?.draftMeta.tier}</strong> tier.
                  Draft this tier or switch back to accept.
                </p>
              </div>
            )}
          </>
        ) : hasManualSelection ? (
          /* Manual selection active, no AI finding selected — #22 guided flow */
          <div className="flex flex-col gap-3 py-6 px-1">
            {/* Mode badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0F4FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4F5BD9]">
                <Edit3 className="h-3 w-3" aria-hidden="true" />
                Manual Revision
              </span>
            </div>
            {/* Guided copy */}
            <p className="m-0 text-[12px] leading-relaxed text-[#344054]">
              You selected text to revise. Tell AI what you'd like changed, then press <strong>Draft</strong>.
            </p>
            {/* Step indicators — lightweight, text-only */}
            <ol className="m-0 p-0 list-none flex flex-col gap-1.5">
              {[
                { done: true,  label: "Select text in the document" },
                { done: false, label: "Add an instruction below" },
                { done: false, label: "Draft · Review · Accept or Reject" },
              ].map((step, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      step.done
                        ? "bg-[#4F5BD9] text-white"
                        : "bg-[#F2F4F7] text-[#98A2B3]"
                    }`}
                    aria-hidden="true"
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span className={`text-[11.5px] ${step.done ? "text-[#667085] line-through decoration-[#CBD5E1]" : "text-[#344054]"}`}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <Scale className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <p className="m-0 text-[13px] font-semibold text-[#1a1a1a]">
              {agentMarkups.length === 0 && !evaluating ? "No clauses flagged" : "No clause selected"}
            </p>
            <p className="m-0 mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-[#667085]">
              {agentMarkups.length === 0 && !evaluating
                ? "The AI found no risk clauses, or evaluation has not run yet."
                : "Select a highlighted clause in the document to begin."}
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

      {/* ── Footer ── */}
      {(selectedMarkup || hasManualSelection) && !isLocked && (
        <div className="shrink-0 bg-white" style={{ borderTop: "1px solid #F2F4F7" }}>

          {/* Inline error banner (#16) */}
          {negotiateError && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
              <p className="m-0 flex-1 text-[11.5px] leading-snug text-[#DC2626]">{negotiateError}</p>
              <button
                type="button"
                onClick={onClearNegotiateError}
                aria-label="Dismiss error"
                className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#DC2626] opacity-60 transition hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Accept / Reject row — only when an AI finding is active */}
          {selectedMarkup && (
            <div className="flex items-center gap-2.5 px-5 pt-3.5 pb-2.5">
              {/* HIGH-1 FIX: Accept is blocked when manual selection is active
                  but selectedMarkup is a non-manual AI finding. The user has
                  selected text for manual revision; accepting the AI finding
                  here would modify the wrong clause silently. */}
              {/* #8: Accept is also blocked when a stale-tier draft exists */}
              <button
                type="button"
                onClick={() => onAccept(selectedMarkup)}
                disabled={isAccepting || acceptBlocked || acceptBlockedByManualConflict}
                className="primary-gradient inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border-none text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  acceptBlockedByManualConflict
                    ? "Clear manual selection or draft the manual revision first."
                    : acceptBlocked
                    ? `Switch to the ${strategyDraftResult?.draftMeta.tier} tier or draft this tier first`
                    : undefined
                }
              >
                {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isAccepting ? "Applying…" : acceptLabel}
              </button>
              <button
                type="button"
                onClick={() => onDismiss(selectedMarkup.clauseId)}
                disabled={isAccepting}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-[#F7F8FB] px-5 text-[13px] font-medium text-[#667085] transition hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                {rejectLabel}
              </button>
            </div>
          )}

          {/* HIGH-1 FIX: Inline conflict notice when manual selection is active
              but an AI finding is selected. Shown below the Accept/Reject row
              so the user understands why Accept is disabled without guessing. */}
          {acceptBlockedByManualConflict && (
            <div className="mx-5 mb-2 flex items-start gap-2 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B45309]" />
              <p className="m-0 text-[11.5px] leading-snug text-[#92400E]">
                Clear the manual selection{" "}
                <button
                  type="button"
                  onClick={onClearManualSelection}
                  className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[#B45309] underline transition hover:text-[#92400E]"
                >
                  ×
                </button>{" "}
                or <strong>Draft</strong> the manual revision first.
              </p>
            </div>
          )}

          {/* Instruction bar */}
          <div className="px-4 pb-4">
            {/* Manual-selection indicator + × clear (#12) */}
            {hasManualSelection && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1.5">
                  {/* Mode badge — communicates intentional Manual Revision state (#22) */}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0F4FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4F5BD9]">
                    <Edit3 className="h-2.5 w-2.5" aria-hidden="true" />
                    Manual Revision
                  </span>
                  {/* #12: larger tap target, explicit aria-label */}
                  <button
                    type="button"
                    onClick={onClearManualSelection}
                    aria-label="Clear text selection"
                    title="Clear selection"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition hover:bg-[#F1F5F9] hover:text-[#64748b]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {manualSelectionText && (
                  <div className="rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 mb-2">
                    <p className="m-0 mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                      Selected text
                    </p>
                    <p
                      className="m-0 text-[11.5px] leading-relaxed text-[#475569] italic"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      "{manualSelectionText}"
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-[16px] border border-[#E4E7EC] bg-[#F7F8FB] px-3 py-2.5 transition focus-within:border-[#4F5BD9] focus-within:shadow-[0_0_0_3px_rgba(79,91,217,0.10)]">
              <textarea
                value={userInstruction}
                onChange={(e) => onUserInstructionChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !draftingCompromise &&
                      !(hasManualSelection && !userInstruction.trim())) {
                    e.preventDefault();
                    onDraftFromStrategy(selectedTier);
                  }
                }}
                placeholder={
                  hasManualSelection
                    ? "Describe what you want changed, e.g. 'make this mutual'…"
                    : "Add an instruction and re-draft…"
                }
                rows={1}
                className="flex-1 resize-none border-none bg-transparent text-[12px] leading-relaxed text-[#1a1a1a] placeholder-[#C0C9D4] outline-none"
                style={{ maxHeight: "72px", overflowY: "auto" }}
              />
              <button
                type="button"
                onClick={() => onDraftFromStrategy(selectedTier)}
                disabled={draftingCompromise || !userInstruction.trim()}
                title="Draft with this instruction"
                aria-label="Draft with this instruction"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-[#4F5BD9] text-white transition hover:bg-[#3a46b0] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {draftingCompromise
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <ArrowUp className="h-3.5 w-3.5" />
                }
              </button>
            </div>
            <p className="m-0 mt-1 text-[10px] text-[#C0C9D4] text-center">
              Enter to draft · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
