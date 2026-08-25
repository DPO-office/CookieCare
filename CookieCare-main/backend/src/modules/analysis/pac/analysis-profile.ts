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
  },
  critiqueUsesProChecklist: false,
  synthesisCeilingFactor: 1,
  /** Per-section synthesis hard cap (sections are generated independently). */
  synthesisHardCap: 3600,
  evidenceCharBudget: 2_000,
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
