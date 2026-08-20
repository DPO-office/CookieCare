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
  const alignmentReplan = critique.release?.alignment.issues.some(
    (issue) => issue.action === "replan"
  );
  const priorReplans = critique.metrics?.replanCount ?? 0;
  // Only replan when we still have a concrete reason AND haven't already
  // burned a replan on the same structural pattern. Otherwise let the release
  // gate ship a `release_with_limitations` instead of thrashing.
  const shouldReplan =
    (critique.skeletonMismatch || alignmentReplan) && priorReplans < 1;
  if (shouldReplan) return "PLAN";
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

  const verdict = critique?.release?.verdict;
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
