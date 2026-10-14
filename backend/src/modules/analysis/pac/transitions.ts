import type { Phase } from "./types.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { AnalysisState } from "../models/analysis-state.js";
import {
  isBudgetExceeded,
  isMaxTurnsReached,
  isOutOfScope,
  mustAskUser,
  shouldStayPausedOnAsk,
} from "./policy.js";

/**
 * Critique redo loops are retired. Deep mode uses AUDIT instead of CRITIQUE.
 */
export const CRITIQUE_PAUSED = true;

/**
 * Pure phase transition table. Unit-testable with fixture states and zero LLM calls.
 */
export function nextPhaseAfterPlan(state: AnalysisState): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  if (isOutOfScope(state)) return "DONE";
  return mustAskUser(state) ? "ASK" : "ACT";
}

export function nextPhaseAfterAsk(
  state: AnalysisState,
  userSubmittedAnswers: boolean
): Phase | "STAY_PAUSED" {
  if (userSubmittedAnswers) return "PLAN";
  if (shouldStayPausedOnAsk(state)) return "STAY_PAUSED";
  return "STAY_PAUSED";
}

export function nextPhaseAfterAct(state: AnalysisState): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  if (state.analysisProfile?.thinkingMode === "deep") return "AUDIT";
  return "DONE";
}

export function nextPhaseAfterAudit(_state: AnalysisState): Phase {
  return "DONE";
}

export function nextPhaseAfterCritique(
  state: AnalysisState,
  _critique: CritiqueReport
): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  return "DONE";
}

export function resolveStoppedReason(
  state: AnalysisState,
  critique?: CritiqueReport | null
): NonNullable<AnalysisState["agent"]>["stoppedReason"] {
  if (isOutOfScope(state)) return "out_of_scope";

  // A completed release decision is the authoritative terminal outcome. The
  // controller's single allowed turn is normally consumed by a successful run,
  // so checking maxTurns first would mislabel healthy releases as exhausted.
  const verdict = critique?.release?.verdict;
  const executionComplete =
    critique?.executionComplete ?? critique?.allUnitsTerminal ?? false;
  if (executionComplete && verdict === "release") return "green";
  if (executionComplete && verdict === "release_with_limitations") {
    return "green_partial";
  }
  if (executionComplete && verdict === "withhold") return "blocked";

  if (isMaxTurnsReached(state)) return "max_turns";
  if (isBudgetExceeded(state)) return "budget_exceeded";
  if (state.agent?.phase === "ASK" || state.agent?.openQuestions?.length) {
    if (shouldStayPausedOnAsk(state) || state.agent?.phase === "ASK") {
      return "awaiting_user";
    }
  }

  if (verdict === "release") return "green";
  if (verdict === "release_with_limitations") return "green_partial";
  if (verdict === "withhold") return "blocked";

  if (
    (critique?.executionComplete ?? critique?.allUnitsTerminal ?? critique?.isGreen) &&
    (critique?.structurallyValid ?? critique?.isGreen) &&
    critique.fixPlan.length === 0
  ) {
    return "green";
  }
  if (critique?.isGreen) return "green";
  return "blocked";
}
