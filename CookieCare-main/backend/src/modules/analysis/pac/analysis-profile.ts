import { LLMTask, type GeminiThinkingLevel } from "../../../llm/config/model-specs.js";

export type ThinkingMode = "lite" | "deep";

export type AnalysisProfile = {
  thinkingMode: ThinkingMode;
  maxTurns: number;
  enableDeepCritique: boolean;
  maxTier2Attempts: number;
  maxReplans: number;
  /** Per-task Gemini 3.x thinking overlays (Flash stays the model). */
  thinkingByTask: Partial<Record<LLMTask, GeminiThinkingLevel>>;
  critiqueUsesProChecklist: boolean;
  /**
   * Multiplier on ReportSpec-depth base synthesis ceiling.
   * Deep uses a higher factor because medium thinking shares the generation budget.
   */
  synthesisCeilingFactor: number;
  /** Absolute maxOutputTokens hard cap for synthesis (never blind 5k for every run). */
  synthesisHardCap: number;
  /** Per-capability quoted-evidence character budget for locate/evaluate. */
  evidenceCharBudget: number;
  /**
   * ACT-Phase 10 — max recall-oriented candidates VERIFY checks per
   * requirement. Kept identical for Lite and Deep (currently 10): shrinking
   * this for Lite was tried and reverted after it empirically missed the
   * correct clause on a real document (see LITE_PROFILE's comment) — the
   * existing candidate-ranking heuristic isn't reliable enough to cut this
   * safely yet. Lite's scope reduction comes from
   * `verifySkipSupportingPriority` instead.
   */
  verifyCandidateCap: number;
  /** Max LLM-selected passages verified per requirement after semantic selection succeeds. */
  selectedVerifyCandidateCap: number;
  /** Requirements verified concurrently inside one evidence package. */
  verifyRequirementConcurrency: number;
  /** Per-candidate VERIFY deadline; a timed-out candidate cannot fail the whole package. */
  verifyCandidateTimeoutMs: number;
  /** ACT-Phase 10 — skip PLAN-authored "supporting"-priority requirements under Lite; keep "required". */
  verifySkipSupportingPriority: boolean;
};

const LITE_PROFILE: AnalysisProfile = {
  thinkingMode: "lite",
  maxTurns: 1,
  enableDeepCritique: false,
  maxTier2Attempts: 0,
  maxReplans: 0,
  thinkingByTask: {
    [LLMTask.STRUCTURAL_JSON_LITE]: "minimal",
    [LLMTask.STRUCTURAL_JSON]: "low",
    [LLMTask.REFINEMENT]: "low",
    // Deliberately no CRITIQUE_CHECKLIST override here: research doc §10 is
    // explicit that VERIFY's own rigor must not differ between Lite and
    // Deep ("budget as scope, never as rigor" — a wrong Present is exactly
    // as much a liability in a 2-minute Lite run). Falls through to
    // model-specs.ts's "high" default, identical to Deep's explicit "high"
    // below. Lite saves time via candidate cap / requirement inclusion
    // (verifyCandidateCap, verifySkipSupportingPriority) — scope, not depth
    // of any individual check.
  },
  critiqueUsesProChecklist: false,
  synthesisCeilingFactor: 1,
  /** Per-section synthesis hard cap (sections are generated independently). */
  synthesisHardCap: 3600,
  evidenceCharBudget: 2_000,
  // ACT-Phase 10 — deliberately the SAME as Deep, not lower. Verified
  // empirically on a real NDA: the recall pool's existing generic ranking
  // heuristic placed the actual return/destroy clause at position 6 of 40,
  // so a cap of 5 silently missed it — a real "identical correctness"
  // violation (research doc §10: "budget as scope, never as rigor"), not
  // an acceptable Lite tradeoff. Lite's savings come from
  // verifySkipSupportingPriority alone; shrinking recall itself is not
  // safe until the ranking heuristic is proven reliable enough to cut.
  verifyCandidateCap: 10,
  // Lite is an interactive review: semantic selection narrows each requirement
  // to its two best passages. Lexical fallback retains the broader recall cap.
  selectedVerifyCandidateCap: 2,
  verifyRequirementConcurrency: 3,
  verifyCandidateTimeoutMs: 45_000,
  verifySkipSupportingPriority: true,
};

const DEEP_PROFILE: AnalysisProfile = {
  thinkingMode: "deep",
  maxTurns: 1,
  enableDeepCritique: false,
  maxTier2Attempts: 0,
  maxReplans: 0,
  thinkingByTask: {
    [LLMTask.STRUCTURAL_JSON_LITE]: "low",
    [LLMTask.STRUCTURAL_JSON]: "medium",
    [LLMTask.REFINEMENT]: "medium",
    [LLMTask.CRITIQUE_CHECKLIST]: "high",
  },
  critiqueUsesProChecklist: true,
  synthesisCeilingFactor: 1.75,
  /** Per-section synthesis hard cap (sections are generated independently). */
  synthesisHardCap: 6400,
  evidenceCharBudget: 8_000,
  verifyCandidateCap: 10,
  selectedVerifyCandidateCap: 4,
  verifyRequirementConcurrency: 2,
  verifyCandidateTimeoutMs: 90_000,
  verifySkipSupportingPriority: false,
};

/** API / UI default when the field is omitted. */
export const DEFAULT_THINKING_MODE: ThinkingMode = "lite";

export function resolveThinkingMode(raw: unknown): ThinkingMode {
  return raw === "deep" || raw === "lite" ? raw : DEFAULT_THINKING_MODE;
}

export function resolveAnalysisProfile(mode: ThinkingMode | unknown): AnalysisProfile {
  const thinkingMode = resolveThinkingMode(mode);
  return thinkingMode === "deep" ? { ...DEEP_PROFILE } : { ...LITE_PROFILE };
}

export function thinkingLevelForTask(
  profile: AnalysisProfile | undefined,
  task: LLMTask
): GeminiThinkingLevel | undefined {
  return profile?.thinkingByTask[task];
}
