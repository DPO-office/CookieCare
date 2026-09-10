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

/** Max recall candidates used when semantic selection is unavailable. */
export function profileVerifyCandidateCap(state: AnalysisState): number {
  return getAnalysisProfile(state).verifyCandidateCap;
}

/** Max semantically selected passages verified for one requirement. */
export function profileSelectedVerifyCandidateCap(state: AnalysisState): number {
  return getAnalysisProfile(state).selectedVerifyCandidateCap;
}

/** Bounded package-level requirement concurrency. */
export function profileVerifyRequirementConcurrency(state: AnalysisState): number {
  return getAnalysisProfile(state).verifyRequirementConcurrency;
}

/** Deadline for one candidate verdict so a provider stall cannot block a package indefinitely. */
export function profileVerifyCandidateTimeoutMs(state: AnalysisState): number {
  return getAnalysisProfile(state).verifyCandidateTimeoutMs;
}

/** ACT-Phase 10 — whether Lite skips PLAN-authored "supporting"-priority requirements. */
export function profileSkipsSupportingPriority(state: AnalysisState): boolean {
  return getAnalysisProfile(state).verifySkipSupportingPriority;
}
