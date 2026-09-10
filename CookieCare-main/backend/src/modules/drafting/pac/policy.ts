import type { DraftState } from "../models/draft-state.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { WorkUnit } from "../models/draft-plan.js";
import type { FixItem } from "../models/critique-report.js";

/** Pure policy helpers — no LLM. */

export function mustAskUser(state: DraftState): boolean {
  const missing = state.plan?.missingFacts ?? [];
  return missing.some((f) => f.severity === "critical");
}

export function criticalFactSurfaced(critique: CritiqueReport): boolean {
  return critique.criticalFactSurfaced === true;
}

export function markForRedraft(
  workUnits: WorkUnit[],
  fixPlan: FixItem[],
  opts?: { planChange?: boolean }
): WorkUnit[] {
  const targets = new Set(fixPlan.map((f) => f.workUnitId).filter(Boolean));
  // Never flip more than the flagged units unless plan_change is set.
  if (opts?.planChange) {
    return workUnits.map((u) =>
      targets.has(u.id) || u.status === "pending"
        ? { ...u, status: "flagged" as const }
        : u
    );
  }
  return workUnits.map((u) =>
    targets.has(u.id) ? { ...u, status: "flagged" as const } : u
  );
}

export function isBudgetExceeded(state: DraftState): boolean {
  const agent = state.agent;
  if (!agent) return false;
  return agent.tokensUsed >= agent.tokenBudget;
}

export function isMaxTurnsReached(state: DraftState): boolean {
  const agent = state.agent;
  if (!agent) return false;
  return agent.turn >= agent.maxTurns;
}

export function shouldStayPausedOnAsk(state: DraftState): boolean {
  const agent = state.agent;
  if (!agent) return false;
  return agent.askRounds >= agent.maxAskRounds && agent.openQuestions.length > 0;
}
