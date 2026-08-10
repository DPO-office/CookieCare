import type { Phase } from "./types.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { DraftState } from "../models/draft-state.js";
import {
  criticalFactSurfaced,
  isBudgetExceeded,
  isMaxTurnsReached,
  mustAskUser,
  shouldStayPausedOnAsk,
} from "./policy.js";

/**
 * Pure phase transition table from the PAC architecture spec.
 * Unit-testable with fixture states and zero LLM calls.
 */
export function nextPhaseAfterPlan(state: DraftState): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  return mustAskUser(state) ? "ASK" : "ACT";
}

export function nextPhaseAfterAsk(state: DraftState, userSubmittedAnswers: boolean): Phase | "STAY_PAUSED" {
  if (userSubmittedAnswers) return "PLAN";
  if (shouldStayPausedOnAsk(state)) return "STAY_PAUSED";
  return "STAY_PAUSED";
}

export function nextPhaseAfterAct(state: DraftState): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  return "CRITIQUE";
}

export function nextPhaseAfterCritique(state: DraftState, critique: CritiqueReport): Phase {
  if (isMaxTurnsReached(state) || isBudgetExceeded(state)) return "DONE";
  if (critique.isGreen) return "DONE";
  if (critique.skeletonMismatch) return "PLAN";
  if (criticalFactSurfaced(critique)) return "ASK";
  return "ACT";
}

export function resolveStoppedReason(
  state: DraftState,
  critique?: CritiqueReport | null
): NonNullable<DraftState["agent"]>["stoppedReason"] {
  if (isMaxTurnsReached(state)) return "max_turns";
  if (isBudgetExceeded(state)) return "budget_exceeded";
  if (state.agent?.phase === "ASK" || state.agent?.openQuestions?.length) {
    if (shouldStayPausedOnAsk(state) || state.agent?.phase === "ASK") {
      return "awaiting_user";
    }
  }
  if (critique?.isGreen) return "green";
  return "blocked";
}
