import type { AnalysisState } from "../models/analysis-state.js";
import type { LLMTask } from "../../../llm/config/model-specs.js";
import type { GeminiThinkingLevel } from "../../../llm/config/model-specs.js";
import {
  resolveAnalysisProfile,
  thinkingLevelForTask,
  type AnalysisProfile,
} from "../pac/analysis-profile.js";

/** Ensure profile is always available once the run has started. */
export function getAnalysisProfile(state: AnalysisState): AnalysisProfile {
  if (state.analysisProfile) return state.analysisProfile;
  return resolveAnalysisProfile(state.request.thinkingMode);
}

export function profileThinkingLevel(
  state: AnalysisState,
  task: LLMTask
): GeminiThinkingLevel | undefined {
  return thinkingLevelForTask(getAnalysisProfile(state), task);
}

/** Per-item evidence quote budget (lite 2k / deep 8k). */
export function profileEvidenceCharBudget(state: AnalysisState): number {
  return getAnalysisProfile(state).evidenceCharBudget;
}

/** ACT-Phase 10 — max recall candidates VERIFY checks per requirement (lite 5 / deep 10). */
export function profileVerifyCandidateCap(state: AnalysisState): number {
  return getAnalysisProfile(state).verifyCandidateCap;
}

/** ACT-Phase 10 — whether Lite skips PLAN-authored "supporting"-priority requirements. */
export function profileSkipsSupportingPriority(state: AnalysisState): boolean {
  return getAnalysisProfile(state).verifySkipSupportingPriority;
}
