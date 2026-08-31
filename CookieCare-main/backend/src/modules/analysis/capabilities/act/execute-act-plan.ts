import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit, AnalysisToolName } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { segmentDocument, resolveSpan } from "../../segmentation/segment-document.js";
import { topologicalBatches } from "../../utils/topo-batches.js";
import { classifyDocument } from "./classify-document.js";
import { extractClauses } from "./extract-clauses.js";
import { checkExpectedClauses } from "./check-expected-clauses.js";
import { flagRisk } from "./flag-risk.js";
import { checkAgainstRule } from "./check-against-rule.js";
import { renderOutput } from "./render-output.js";
import { evaluateMatrixRow } from "./evaluate-matrix-row.js";
import { webAssistedReference } from "./web-assisted-reference.js";
import { extractPlaybookPositions } from "./extract-playbook-positions.js";
import { extractSharedEvidence } from "./extract-shared-evidence.js";
import { evaluatePackage } from "./evaluate-package.js";
import { inventoryProvisions } from "./inventory-provisions.js";
import { deriveRisk } from "./derive-risk.js";
import { aggregateRequirements } from "./aggregate-requirements.js";
import { insufficient } from "./act-utils.js";
import { pacLog, pacWarn } from "../../utils/pac-log.js";
import {
  logActGraphInspect,
  logActInspect,
  logActSegmentationInspect,
  logActStepInspect,
} from "./act-inspect-log.js";
import { actStageForTool } from "./act-stage.js";

const SILENT_SUCCESS_NOTES: Partial<Record<AnalysisToolName, string>> = {
  classify_document: "classification only, no finding by design",
  check_expected_clauses: "expected clause present, no gap to report",
  extract_playbook_positions: "no playbook positions extracted",
  extract_shared_evidence: "shared evidence cached, no finding by design",
  inventory_provisions: "no inventory records extracted",
  aggregate_requirements: "requirement assessments built, no finding by design",
  derive_risk: "no mechanically-implied risk to derive",
};

/**
 * Tools that only emit findings and never mutate shared workspace state, so
 * independent units in the same dependency batch can run concurrently.
 */
const PARALLEL_SAFE_TOOLS = new Set<AnalysisToolName>([
  "check_against_rule",
  "evaluate_matrix_row",
  "flag_risk",
  "check_expected_clauses",
  // Grouped package evaluation only emits findings; independent packages in the
  // same dependency batch can run concurrently.
  "evaluate_package",
]);

const ACT_CONCURRENCY = Math.max(
  1,
  Number(process.env.ANALYSIS_ACT_CONCURRENCY || 8)
);

async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

const TOOL_PROGRESS_LABELS: Partial<Record<AnalysisToolName, string>> = {
  classify_document: "Reading…",
  extract_clauses: "Extracting clauses…",
  check_expected_clauses: "Checking coverage…",
  flag_risk: "Assessing risk…",
  check_against_rule: "Checking the playbook…",
  evaluate_matrix_row: "Evaluating…",
  extract_playbook_positions: "Reading the playbook…",
  web_assisted_reference: "Searching the web…",
  extract_shared_evidence: "Gathering evidence…",
  inventory_provisions: "Inventorying provisions…",
  evaluate_package: "Evaluating…",
  derive_risk: "Assessing risk…",
  aggregate_requirements: "Summarizing…",
  render_output: "Writing the report…",
};

function emitActProgress(
  state: AnalysisState,
  percent: number,
  message: string,
  last: { message: string }
) {
  if (!message || last.message === message) return;
  last.message = message;
  void state.onProgress?.(percent, message);
}

/**
 * ACT orchestrator — executes skill-scoped work-unit graph in dependency batches.
 */
export async function executeActPlan(state: AnalysisState): Promise<AnalysisState> {
  const plan = state.plan;
  if (!plan) return state;

  const targeted = state.fixPlan?.targetedOnly === true;
  let units = plan.workUnits.map((u) => ({ ...u }));

  if (targeted && state.fixPlan?.items.length) {
    const fixByUnit = new Map(
      state.fixPlan.items.map((item) => [item.workUnitId, item])
    );
    units = units.map((u) => {
      const fix = fixByUnit.get(u.workUnitId);
      if (!fix) return u;
      const input = { ...u.input };
      if (fix.previousAttemptFeedback) {
        input.previousAttemptFeedback = fix.previousAttemptFeedback;
      }
      if (fix.requirementId) {
        const prior = Array.isArray(input.retryRequirementIds)
          ? (input.retryRequirementIds as string[])
          : [];
        input.retryRequirementIds = [...new Set([...prior, fix.requirementId])];
      }
      if (fix.retrySectionIds?.length) {
        const prior = Array.isArray(input.retrySectionIds)
          ? (input.retrySectionIds as string[])
          : [];
        input.retrySectionIds = [...new Set([...prior, ...fix.retrySectionIds])];
      }
      return { ...u, input };
    });
    // A targeted retry can change the findings that the user should see.
    // Always regenerate the final output after the retried units complete.
    units = units.map((u) =>
      u.tool === "render_output" ? { ...u, status: "flagged" as const } : u
    );
  }

  const runnable = targeted
    ? units.filter((u) => u.status === "flagged" || u.status === "pending")
    : units.filter((u) => u.status !== "done" && u.status !== "failed");

  state = ensureSegmented(state);
  const lastProgress = { message: "" };
  if (!targeted) {
    emitActProgress(state, 40, "Analyzing…", lastProgress);
  }

  const batches = topologicalBatches(runnable, Math.max(8, ACT_CONCURRENCY));
  let findings = [...state.findings];
  const totalUnits = Math.max(runnable.length, 1);
  let finishedUnits = 0;

  const actPercent = () => 40 + Math.round((finishedUnits / totalUnits) * 45);

  if (targeted) {
    const redoUnitIds = new Set(
      units
        .filter((unit) => unit.status === "flagged" && unit.tool !== "render_output")
        .map((unit) => unit.workUnitId)
    );
    if (redoUnitIds.size > 0) {
      findings = findings.filter(
        (finding) =>
          !finding.workUnitId ||
          !redoUnitIds.has(finding.workUnitId) ||
          finding.status === "not_covered"
      );
    }
  }

  const actStarted = Date.now();
  const packageEvalCount = runnable.filter(
    (u) => u.tool === "evaluate_package"
  ).length;
  pacLog("ACT graph", {
    mode: targeted ? "targeted-redo" : "full",
    runnable: runnable.length,
    batches: batches.length,
    total: units.length,
    groupedEvals: packageEvalCount,
  });
  logActSegmentationInspect(state);
  logActGraphInspect(state, runnable);
  let stepCounter = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStart = Date.now();
    const parallel = batch.filter((u) => PARALLEL_SAFE_TOOLS.has(u.tool));
    const serial = batch.filter((u) => !PARALLEL_SAFE_TOOLS.has(u.tool));

    if (parallel.length > 1) {
      const parallelLabel =
        TOOL_PROGRESS_LABELS[parallel[0].tool] ?? "Evaluating…";
      emitActProgress(state, actPercent(), parallelLabel, lastProgress);
      const base = findings;
      const baseIds = new Set(base.map((f) => f.findingId));
      const batchPriorState = state;
      const outcomes = await runConcurrent(parallel, ACT_CONCURRENCY, async (unit) => {
        const started = Date.now();
        const waitMs = started - batchStart;
        pacLog(`ACT ▶ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
          id: unit.workUnitId,
          batch: batchIndex,
          concurrent: true,
          wait_ms: waitMs,
        });
        try {
          const result = await runTool(state, unit, base);
          const emitted = result.findings.filter((f) => !baseIds.has(f.findingId));
          const ms = Date.now() - started;
          pacLog(`ACT ✓ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
            id: unit.workUnitId,
            ms,
            findings: emitted.length,
            tokens: state.agent?.tokensUsed,
            batch: batchIndex,
            concurrent: true,
            wait_ms: waitMs,
          });
          return {
            unit,
            emitted,
            failed: false as const,
            ms,
            toolState: result.state,
          };
        } catch (err) {
          const ms = Date.now() - started;
          pacWarn(`ACT ✗ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
            id: unit.workUnitId,
            ms,
            err: err instanceof Error ? err.message : String(err),
          });
          return {
            unit,
            emitted: [] as Finding[],
            failed: true as const,
            note: err instanceof Error ? err.message : String(err),
            ms,
            toolState: state,
          };
        }
      });

      for (const outcome of outcomes) {
        findings = [...findings, ...outcome.emitted];
        // Parallel tools share a frozen pre-batch state; merge only package-local
        // evidence expansions so concurrent evaluate_package runs don't clobber.
        if (!outcome.failed && outcome.toolState.sharedEvidence) {
          state = {
            ...state,
            sharedEvidence: {
              ...(state.sharedEvidence ?? {}),
              ...outcome.toolState.sharedEvidence,
            },
          };
        }
        stepCounter += 1;
        logActStepInspect({
          unit: outcome.unit,
          state: outcome.toolState,
          priorState: batchPriorState,
          emitted: outcome.emitted,
          ms: outcome.ms,
          stepIndex: stepCounter,
          stepTotal: runnable.length,
          failed: outcome.failed,
          error: outcome.failed ? outcome.note : undefined,
        });
        units = units.map((u) =>
          u.workUnitId === outcome.unit.workUnitId
            ? outcome.failed
              ? {
                  ...u,
                  status: "failed" as const,
                  completionNote: outcome.note,
                }
              : {
                  ...u,
                  status: "done" as const,
                  findingsEmitted: outcome.emitted.length,
                  completionNote:
                    outcome.emitted.length === 0
                      ? SILENT_SUCCESS_NOTES[outcome.unit.tool] ??
                        "completed with no findings"
                      : u.completionNote,
                }
            : u
        );
      }
      finishedUnits += parallel.length;
    } else {
      serial.push(...parallel);
    }

    for (const unit of serial) {
      emitActProgress(
        state,
        actPercent(),
        TOOL_PROGRESS_LABELS[unit.tool] ?? "Analyzing…",
        lastProgress
      );
      const priorFindings = findings;
      const priorState = state;
      const started = Date.now();
      const waitMs = started - batchStart;
      pacLog(`ACT ▶ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
        id: unit.workUnitId,
        batch: batchIndex,
        concurrent: false,
        wait_ms: waitMs,
      });
      try {
        const result = await runTool(state, unit, findings);
        state = result.state;
        findings = result.findings;
        const emittedFindings = findings.slice(priorFindings.length);
        const emitted = emittedFindings.length;
        units = units.map((u) =>
          u.workUnitId === unit.workUnitId
            ? {
                ...u,
                status: "done" as const,
                findingsEmitted: emitted,
                completionNote:
                  emitted === 0
                    ? SILENT_SUCCESS_NOTES[unit.tool] ?? "completed with no findings"
                    : u.completionNote,
              }
            : u
        );
        const ms = Date.now() - started;
        pacLog(`ACT ✓ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
          id: unit.workUnitId,
          ms,
          findings: emitted,
          tokens: state.agent?.tokensUsed,
          batch: batchIndex,
          concurrent: false,
          wait_ms: waitMs,
        });
        stepCounter += 1;
        logActStepInspect({
          unit,
          state,
          priorState,
          emitted: emittedFindings,
          ms,
          stepIndex: stepCounter,
          stepTotal: runnable.length,
        });
      } catch (err) {
        const ms = Date.now() - started;
        pacWarn(`ACT ✗ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
          id: unit.workUnitId,
          ms,
          err: err instanceof Error ? err.message : String(err),
        });
        stepCounter += 1;
        logActStepInspect({
          unit,
          state,
          priorState,
          emitted: [],
          ms,
          stepIndex: stepCounter,
          stepTotal: runnable.length,
          failed: true,
          error: err instanceof Error ? err.message : String(err),
        });
        units = units.map((u) =>
          u.workUnitId === unit.workUnitId
            ? {
                ...u,
                status: "failed" as const,
                findingsEmitted: 0,
                completionNote: err instanceof Error ? err.message : String(err),
              }
            : u
        );
      }
      finishedUnits += 1;
    }
  }

  pacLog("ACT done", {
    ms: Date.now() - actStarted,
    groupedEvals: packageEvalCount,
    requirements: state.requirementAssessments?.length ?? 0,
    findings: findings.length,
  });

  const finalState = {
    ...state,
    findings,
    plan: { ...plan, workUnits: units },
    fixPlan: null,
    repairContext: null,
  };
  logActInspect(finalState);
  return finalState;
}

function ensureSegmented(state: AnalysisState): AnalysisState {
  const roles = state.request.documentRoles ?? {};
  const docs = state.request.documentIds.map((docId) => {
    const existing = state.workspace.documents.find((d) => d.docId === docId);
    if (existing?.segments.length) {
      const role = roles[docId];
      if (role && existing.role !== role && existing.role !== "reference") {
        return {
          ...existing,
          role: role === "reference" ? ("reference" as const) : ("target" as const),
        };
      }
      return existing;
    }
    const text = state.request.documentTexts[docId] ?? existing?.fullText ?? "";
    const roleHint = roles[docId];
    return segmentDocument(docId, text, {
      title: state.request.documentTitles?.[docId],
      role:
        roleHint === "reference"
          ? "reference"
          : roleHint === "target"
            ? "target"
            : existing?.role && existing.role !== "unknown"
              ? existing.role
              : "primary",
    });
  });
  return {
    ...state,
    workspace: { ...state.workspace, documents: docs },
    agent: state.agent ? { ...state.agent, docCount: docs.length } : state.agent,
  };
}

async function runTool(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  switch (unit.tool) {
    case "classify_document":
      return { state: await classifyDocument(state, unit), findings };
    case "extract_clauses":
      return extractClauses(state, unit, findings);
    case "check_expected_clauses":
      return checkExpectedClauses(state, unit, findings);
    case "flag_risk":
      return flagRisk(state, unit, findings);
    case "check_against_rule":
      return checkAgainstRule(state, unit, findings);
    case "evaluate_matrix_row":
      return evaluateMatrixRow(state, unit, findings);
    case "extract_playbook_positions":
      return extractPlaybookPositions(state, unit, findings);
    case "web_assisted_reference":
      return webAssistedReference(state, unit, findings);
    case "extract_shared_evidence":
      return extractSharedEvidence(state, unit, findings);
    case "inventory_provisions":
      return inventoryProvisions(state, unit, findings);
    case "evaluate_package":
      return evaluatePackage(state, unit, findings);
    case "derive_risk":
      return deriveRisk(state, unit, findings);
    case "aggregate_requirements":
      return aggregateRequirements(state, unit, findings);
    case "render_output": {
      const next = await renderOutput(state, findings, unit);
      return { state: next, findings: next.findings };
    }
    default: {
      const _exhaustive: never = unit.tool;
      throw new Error(`Unhandled ACT tool: ${String(_exhaustive)}`);
    }
  }
}

/** Exported for critique verification. */
export function getSpanFromState(
  state: AnalysisState,
  locator: Finding["evidence"][0]["locator"]
): string | null {
  const doc = state.workspace.documents.find((d) => d.docId === locator.docId);
  if (!doc) return null;
  return resolveSpan(doc, locator);
}
