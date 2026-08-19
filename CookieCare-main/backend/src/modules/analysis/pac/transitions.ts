import type { Phase } from "./types.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { AnalysisState } from "../models/analysis-state.js";
import {
  criticalFactSurfaced,
  isBudgetExceeded,
  isMaxTurnsReached,
  isOutOfScope,
  mustAskUser,
  shouldStayPausedOnAsk,
} from "./policy.js";

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
  if (state.plan?.skipCritique) return "DONE";
  return "CRITIQUE";
}

export function nextPhaseAfterCritique(
  state: AnalysisState,
  critique: CritiqueReport
): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  if (critique.skeletonMismatch) return "PLAN";
  if (criticalFactSurfaced(critique)) return "ASK";
  if (critique.fixPlan.length > 0) return "ACT";
  return "DONE";
}

export function resolveStoppedReason(
  state: AnalysisState,
  critique?: CritiqueReport | null
): NonNullable<AnalysisState["agent"]>["stoppedReason"] {
  if (isOutOfScope(state)) return "out_of_scope";
  if (isMaxTurnsReached(state)) return "max_turns";
  if (isBudgetExceeded(state)) return "budget_exceeded";
  if (state.agent?.phase === "ASK" || state.agent?.openQuestions?.length) {
    if (shouldStayPausedOnAsk(state) || state.agent?.phase === "ASK") {
      return "awaiting_user";
    }
  }
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
