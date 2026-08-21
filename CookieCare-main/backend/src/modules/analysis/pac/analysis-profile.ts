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
  synthesisHardCap: 2800,
};

const DEEP_PROFILE: AnalysisProfile = {
  thinkingMode: "deep",
  maxTurns: 2,
  enableDeepCritique: true,
  maxTier2Attempts: 1,
  maxReplans: 1,
  thinkingByTask: {
    [LLMTask.STRUCTURAL_JSON_LITE]: "low",
    [LLMTask.STRUCTURAL_JSON]: "medium",
    [LLMTask.REFINEMENT]: "medium",
    [LLMTask.CRITIQUE_CHECKLIST]: "high",
  },
  critiqueUsesProChecklist: true,
  synthesisCeilingFactor: 1.75,
  synthesisHardCap: 4800,
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
