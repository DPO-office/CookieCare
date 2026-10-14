import type { AnalysisState } from "../models/analysis-state.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { AnalysisWorkUnit } from "../models/analysis-plan.js";
import type { FixItem } from "../models/critique-report.js";

/** Pure policy helpers — no LLM. */

export function mustAskUser(state: AnalysisState): boolean {
  const missing = state.plan?.missingClarifications ?? [];
  return missing.some((f) => f.severity === "critical");
}

export function isOutOfScope(state: AnalysisState): boolean {
  return state.intent?.operation === "out_of_scope" || Boolean(state.declineMessage);
}

export function criticalFactSurfaced(critique: CritiqueReport): boolean {
  return critique.criticalFactSurfaced === true;
}

export function markForRedo(
  workUnits: AnalysisWorkUnit[],
  fixPlan: FixItem[]
): AnalysisWorkUnit[] {
  const targets = new Set(fixPlan.map((f) => f.workUnitId));
  return workUnits.map((u) =>
    targets.has(u.workUnitId) ? { ...u, status: "flagged" as const } : u
  );
}

export function isBudgetExceeded(state: AnalysisState): boolean {
  const agent = state.agent;
  if (!agent) return false;
  return (
    agent.tokensUsed >= agent.tokenBudget ||
    agent.docCount > agent.maxDocs ||
    agent.extractionUnitsUsed > agent.maxExtractionUnits
  );
}

export function isMaxTurnsReached(state: AnalysisState): boolean {
  const agent = state.agent;
  if (!agent) return false;
  return agent.turn >= agent.maxTurns;
}

export function shouldStayPausedOnAsk(state: AnalysisState): boolean {
  const agent = state.agent;
  if (!agent) return false;
  return agent.askRounds >= agent.maxAskRounds && agent.openQuestions.length > 0;
}
