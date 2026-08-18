import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CritiqueMetrics,
  CritiqueReport,
  FixItem,
} from "../../models/critique-report.js";
import { pacLog } from "../../utils/pac-log.js";
import { resolveWorkUnits } from "./resolve-work-unit.js";
import { runCritiqueLite } from "./run-critique-lite.js";
import { runDeepCritique } from "./run-deep-critique.js";

/**
 * Two-level CRITIQUE:
 * 1. deterministic Critique Lite on every run;
 * 2. targeted semantic verification only for suspicious/material targets.
 */
export async function runCritique(state: AnalysisState): Promise<AnalysisState> {
  const iteration = (state.critique?.iteration ?? 0) + 1;
  const liteStarted = Date.now();
  pacLog("CRITIQUE-LITE start", {
    findings: state.findings.length,
    units: state.plan?.workUnits.length ?? 0,
    iter: iteration,
  });

  const lite = runCritiqueLite(state);
  const critiqueLiteMs = Date.now() - liteStarted;
  pacLog("CRITIQUE-LITE done", {
    ms: critiqueLiteMs,
    executionComplete: lite.executionComplete,
    structurallyValid: lite.structurallyValid,
    issues: lite.structuralIssues.length,
  });

  // After a targeted redo, Critique Lite is the final validation pass by
  // default. Do not recursively launch another semantic loop for the same run.
  const targetedRedoCount = targetedRedoCountForRun(state);
  const mayRunDeepCritique =
    targetedRedoCount === 0 && lite.structurallyValid;
  const targets = mayRunDeepCritique ? lite.deepCritiqueTargets : [];
  pacLog("deepCritiqueRequired", {
    value: targets.length > 0,
    targets: targets.length,
    skippedAfterRedo: !mayRunDeepCritique || undefined,
  });

  let deepCritiqueMs = 0;
  let deep = {
    results: [],
    issues: [],
    fixPlan: [],
    llmCalls: 0,
  } as Awaited<ReturnType<typeof runDeepCritique>>;
  if (targets.length > 0) {
    const deepStarted = Date.now();
    pacLog("DEEP-CRITIQUE start", { targets: targets.length });
    deep = await runDeepCritique(state, targets);
    deepCritiqueMs = Date.now() - deepStarted;
    pacLog("DEEP-CRITIQUE done", {
      ms: deepCritiqueMs,
      targets: targets.length,
      fixes: deep.fixPlan.length,
    });
  }

  const uncertainty = applyUncertainResults(state, targets, deep.results);
  const rawFixPlan = dedupeFixes([
    ...lite.fixPlan,
    ...deep.fixPlan,
    ...uncertainty.fixPlan,
  ]);
  const allResults = [...lite.results, ...deep.issues];
  const { state: resolvedState, resolved } = await resolveWorkUnits(
    uncertainty.state,
    allResults,
    rawFixPlan
  );
  const skeletonMismatch =
    lite.skeletonMismatch || resolved.skeletonMismatch;
  const executionComplete = lite.executionComplete;
  const structurallyValid =
    lite.structurallyValid && !skeletonMismatch;
  const finalFixPlan =
    resolved.allUnitsTerminal || skeletonMismatch
      ? []
      : dedupeFixes(resolved.fixPlan);
  const metrics = buildMetrics(
    state,
    critiqueLiteMs,
    deepCritiqueMs,
    targets.length,
    deep.llmCalls,
    targetedRedoCount
  );

  const report: CritiqueReport = {
    // Compatibility only: this means execution/structure are complete, not
    // that every legal conclusion is semantically perfect.
    isGreen:
      executionComplete &&
      structurallyValid &&
      finalFixPlan.length === 0,
    iteration,
    results: allResults,
    executionComplete,
    structurallyValid,
    structuralIssues: lite.structuralIssues,
    deepCritiqueRequired: targets.length > 0,
    deepCritiqueTargets: targets,
    deepCritiqueResults: deep.results,
    fixPlan: finalFixPlan,
    skeletonMismatch,
    criticalFactSurfaced: lite.criticalFactSurfaced,
    outcomes: resolved.outcomes,
    allUnitsTerminal: resolved.allUnitsTerminal,
    metrics,
  };

  pacLog("targetedRetry", {
    count: finalFixPlan.length > 0 ? targetedRedoCount + 1 : targetedRedoCount,
  });

  return {
    ...resolvedState,
    critique: report,
    metadata: {
      ...resolvedState.metadata,
      critiqueMetrics: metrics,
    },
  };
}

function applyUncertainResults(
  state: AnalysisState,
  targets: CritiqueReport["deepCritiqueTargets"],
  results: NonNullable<CritiqueReport["deepCritiqueResults"]>
): { state: AnalysisState; fixPlan: FixItem[] } {
  if (!targets?.length || results.length === 0) {
    return { state, fixPlan: [] };
  }
  const uncertainIds = new Set(
    results
      .filter((result) => result.recommendedAction === "mark_uncertain")
      .map((result) => result.targetId)
  );
  if (uncertainIds.size === 0) return { state, fixPlan: [] };

  const requirementIds = new Set<string>();
  const findingIds = new Set<string>();
  for (const target of targets) {
    const id =
      target.requirementId ??
      target.findingId ??
      `${target.workUnitId}:${target.reason}`;
    if (!uncertainIds.has(id)) continue;
    if (target.requirementId) requirementIds.add(target.requirementId);
    if (target.findingId) findingIds.add(target.findingId);
  }
  const findings = state.findings.map((finding) =>
    (finding.requirementId && requirementIds.has(finding.requirementId)) ||
    findingIds.has(finding.findingId)
      ? {
          ...finding,
          status: "insufficient_evidence" as const,
          terminalStatus: "retries_exhausted" as const,
        }
      : finding
  );
  const aggregate = state.plan?.workUnits.find(
    (unit) => unit.tool === "aggregate_requirements"
  );
  const render = state.plan?.workUnits.find(
    (unit) => unit.tool === "render_output"
  );
  const retryUnit = aggregate ?? render;
  const fixPlan = retryUnit
    ? [
        {
          workUnitId: retryUnit.workUnitId,
          instruction:
            "Rebuild the report with targeted Deep Critique uncertainty",
          sourceItemId: "deep:mark-uncertain",
        },
      ]
    : [];
  return { state: { ...state, findings }, fixPlan };
}

function targetedRedoCountForRun(state: AnalysisState): number {
  const prior = state.critique?.metrics?.targetedRedoCount;
  if (typeof prior === "number") return prior;
  return Object.values(state.workUnitOutcomes ?? {}).reduce(
    (count, outcome) => Math.max(count, outcome.attempts.length),
    0
  );
}

function buildMetrics(
  state: AnalysisState,
  critiqueLiteMs: number,
  deepCritiqueMs: number,
  targetCount: number,
  critiqueLLMCalls: number,
  currentRedoCount: number
): CritiqueMetrics {
  const prior = state.critique?.metrics;
  return {
    critiqueLiteMs,
    deepCritiqueMs,
    deepCritiqueTriggered: targetCount > 0,
    deepCritiqueTargets: targetCount,
    targetedRedoCount:
      currentRedoCount + (state.fixPlan?.targetedOnly ? 1 : 0),
    replanCount: Math.max(
      prior?.replanCount ?? 0,
      state.replanAttemptedThisRun ? 1 : 0
    ),
    askCount:
      prior?.askCount ??
      (state.agent?.askRounds ?? 0),
    critiqueLLMCalls: (prior?.critiqueLLMCalls ?? 0) + critiqueLLMCalls,
  };
}

function dedupeFixes(fixes: FixItem[]): FixItem[] {
  const seen = new Set<string>();
  return fixes.filter((fix) => {
    const key = `${fix.workUnitId}:${fix.sourceItemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
