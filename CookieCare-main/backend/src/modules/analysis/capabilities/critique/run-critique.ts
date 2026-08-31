import type { AnalysisState, RepairContext } from "../../models/analysis-state.js";
import type {
  CritiqueMetrics,
  CritiqueReport,
  FixItem,
} from "../../models/critique-report.js";
import { dedupeFixes } from "../../shared/dedupe.js";
import { pacLog } from "../../utils/pac-log.js";
import { resolveWorkUnits } from "./resolve-work-unit.js";
import { runCritiqueLite } from "./run-critique-lite.js";
import { runDeepCritique } from "./run-deep-critique.js";
import { composeReleaseDecision } from "./release-decision.js";
import {
  alignmentNeedsReplan,
  alignmentNeedsTargetedRedo,
} from "./alignment.js";
import {
  logCritiqueFinalInspect,
  logCritiqueLiteInspect,
} from "./critique-inspect-log.js";
import { getAnalysisProfile } from "../../utils/profile-thinking.js";
import { repairContextFromAlignment } from "../../skills/runtime/graph/apply-package-shape-repair.js";

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
  logCritiqueLiteInspect(lite);

  const targetedRedoCount = targetedRedoCountForRun(state);
  const profile = getAnalysisProfile(state);
  const mayRunDeepCritique =
    profile.enableDeepCritique &&
    profile.critiqueUsesProChecklist &&
    targetedRedoCount === 0;
  const targets = mayRunDeepCritique ? lite.deepCritiqueTargets : [];
  pacLog("deepCritiqueRequired", {
    value: targets.length > 0,
    targets: targets.length,
    thinkingMode: profile.thinkingMode,
    skippedByProfile: !profile.enableDeepCritique || undefined,
    skippedAfterRedo: targetedRedoCount > 0 || undefined,
    reasons:
      targets.length > 0
        ? [...new Set(targets.map((t) => t.reason))].join(",")
        : undefined,
  });

  let deepCritiqueMs = 0;
  let deep = {
    results: [],
    issues: [],
    fixPlan: [],
    llmCalls: 0,
  } as Awaited<ReturnType<typeof runDeepCritique>>;
  if (targets.length > 0) {
    void state.onProgress?.(92, "Verifying key findings…");
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

  // Full PLAN only for true structural / global alignment replan — never for
  // recoverable targeted_redo (package shape) or synthesis truncation.
  const needsFullReplan =
    lite.skeletonMismatch ||
    resolved.skeletonMismatch ||
    alignmentNeedsReplan(lite.alignment);
  const skeletonMismatch = needsFullReplan;
  const executionComplete = lite.executionComplete;
  const structurallyValid = lite.structurallyValid && !skeletonMismatch;

  const alignmentTargeted = alignmentNeedsTargetedRedo(lite.alignment);
  const alignmentFixes = alignmentTargeted
    ? buildAlignmentTargetedFixes(resolvedState, lite.alignment.issues)
    : [];

  let finalFixPlan: FixItem[] = needsFullReplan
    ? []
    : dedupeFixes([...resolved.fixPlan, ...alignmentFixes]);

  // Truncation with missing sections: ensure wu-render stays on the fix plan
  // even when other units look terminal.
  if (
    !needsFullReplan &&
    resolvedState.synthesisMeta?.truncated &&
    finalFixPlan.every((f) => f.workUnitId !== "wu-render")
  ) {
    const renderFail = allResults.find(
      (r) =>
        (r.itemId === "report-output:contract" ||
          r.itemId === "outline-analysis:contract") &&
        (r.status === "fail" || r.status === "missing")
    );
    if (renderFail || !resolvedState.renderedOutput?.includes("Conclusion")) {
      finalFixPlan = dedupeFixes([
        ...finalFixPlan,
        {
          workUnitId: "wu-render",
          instruction:
            "Prior synthesis truncated; raise ceiling and complete missing ReportSpec sections",
          sourceItemId: "report-output:truncated",
          previousAttemptFeedback: `prior synthesis truncated at maxOutputTokens=${resolvedState.synthesisMeta.maxOutputTokens}`,
        },
      ]);
    }
  }

  const repairContext = needsFullReplan
    ? null
    : resolveRepairContext(resolvedState, lite.alignment.issues, finalFixPlan);

  const release = composeReleaseDecision({
    state: resolvedState,
    coverage: lite.requirementCoverage,
    alignment: lite.alignment,
    placeholder: lite.placeholderReport,
    structurallyValid,
    executionComplete,
    fixPlan: finalFixPlan,
    skeletonMismatch,
    deepResults: deep.results,
  });
  const metrics = buildMetrics(
    state,
    critiqueLiteMs,
    deepCritiqueMs,
    targets.length,
    deep.llmCalls,
    targetedRedoCount
  );

  const report: CritiqueReport = {
    isGreen:
      release.verdict === "release" &&
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
    release,
  };

  pacLog("targetedRetry", {
    count: finalFixPlan.length > 0 ? targetedRedoCount + 1 : targetedRedoCount,
    repairKind: repairContext?.kind,
    fullReplan: needsFullReplan,
    alignmentTargeted,
  });

  logCritiqueFinalInspect(resolvedState, report);

  return {
    ...resolvedState,
    critique: report,
    repairContext,
    metadata: {
      ...resolvedState.metadata,
      critiqueMetrics: metrics,
    },
  };
}

function buildAlignmentTargetedFixes(
  state: AnalysisState,
  issues: Array<{
    action: string;
    requirementId?: string;
    packageId?: string;
    detail: string;
  }>
): FixItem[] {
  const targeted = issues.filter((i) => i.action === "targeted_redo");
  if (targeted.length === 0) return [];

  const fixes: FixItem[] = [];
  const workUnits = state.plan?.workUnits ?? [];
  const packageIds = new Set(
    targeted.map((i) => i.packageId).filter((id): id is string => Boolean(id))
  );
  const requirementIds = new Set(
    targeted.map((i) => i.requirementId).filter((id): id is string => Boolean(id))
  );

  for (const unit of workUnits) {
    const unitPkg = String(unit.input.packageId ?? "");
    const hitsPackage = unitPkg && packageIds.has(unitPkg);
    const hitsReq = (unit.requirementIds ?? []).some((id) =>
      requirementIds.has(id)
    );
    if (
      hitsPackage ||
      hitsReq ||
      unit.tool === "aggregate_requirements" ||
      unit.tool === "render_output" ||
      unit.tool === "derive_risk"
    ) {
      if (
        unit.tool === "evaluate_package" ||
        unit.tool === "inventory_provisions" ||
        unit.tool === "extract_shared_evidence" ||
        unit.tool === "aggregate_requirements" ||
        unit.tool === "derive_risk" ||
        unit.tool === "render_output"
      ) {
        fixes.push({
          workUnitId: unit.workUnitId,
          instruction: `Targeted redo: ${targeted[0]?.detail ?? "package shape"}`,
          sourceItemId: "alignment:targeted_redo",
          requirementId: unit.requirementIds?.[0] ?? targeted[0]?.requirementId,
          previousAttemptFeedback: targeted.map((t) => t.detail).join("; "),
        });
      }
    }
  }

  // Placeholder so transitions can open ACT even before package units exist;
  // applyPackageShapeRepair will replace the fix plan with injected unit ids.
  if (fixes.length === 0) {
    const render = workUnits.find((u) => u.tool === "render_output");
    fixes.push({
      workUnitId: render?.workUnitId ?? "wu-render",
      instruction: "Targeted package-shape repair then re-render",
      sourceItemId: "alignment:targeted_redo",
      requirementId: targeted[0]?.requirementId,
      previousAttemptFeedback: targeted.map((t) => t.detail).join("; "),
    });
  }

  return dedupeFixes(fixes);
}

function resolveRepairContext(
  state: AnalysisState,
  alignmentIssues: Array<{
    action: string;
    requirementId?: string;
    packageId?: string;
    detail: string;
  }>,
  fixPlan: FixItem[]
): RepairContext | null {
  const fromAlignment = repairContextFromAlignment(state, alignmentIssues);
  if (fromAlignment) return fromAlignment;

  const renderOnly =
    fixPlan.length > 0 &&
    fixPlan.every((f) => f.workUnitId === "wu-render") &&
    Boolean(state.synthesisMeta?.truncated);
  if (renderOnly) {
    return {
      analysisId: state.request.sessionId,
      kind: "synthesis",
      affectedRequirementIds: [],
      affectedPackageIds: [],
      critiqueIssueDetails: [
        `prior synthesis truncated at maxOutputTokens=${state.synthesisMeta?.maxOutputTokens}`,
      ],
      preserveFindingsOutsideAffected: true,
    };
  }

  if (
    fixPlan.length > 0 &&
    fixPlan.every((f) => f.workUnitId === "wu-render")
  ) {
    return {
      analysisId: state.request.sessionId,
      kind: "synthesis",
      affectedRequirementIds: [],
      affectedPackageIds: [],
      critiqueIssueDetails: fixPlan.map((f) => f.instruction),
      preserveFindingsOutsideAffected: true,
    };
  }

  return null;
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
