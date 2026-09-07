import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit, AnalysisToolName } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { normalizeFindingSemantics } from "../../shared/finding-semantics.js";
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
import { mergeBranchOutputs } from "../reporting/merge-branch-outputs.js";
import { insufficient } from "./act-utils.js";
import { pacLog, pacWarn } from "../../utils/pac-log.js";
import {
  logActGraphInspect,
  logActInspect,
  logActSegmentationInspect,
  logActStepInspect,
} from "./act-inspect-log.js";
import { actStageForTool, type ActStage } from "./act-stage.js";
import {
  beginComplianceRun,
  finalizeComplianceRun,
  markAssessed,
  markRendered,
  markRetrieved,
  markVerified,
  recordElementRegistry,
  recordIngestMarkers,
  recordIngestTables,
  recordPhase3Investigation,
  recordLlmAssistedInvestigation,
  recordLlmBundleVerification,
  recordLlmVerifyCanonicalSwap,
  recordLockValidation,
  recordPhase7Render,
  recordPhase4Verification,
  recordPhase5Assessment,
  recordRetrievalFallback,
  recordPlannedRequirements,
  recordReferenceIndex,
  recordRequestResolutions,
  recordRequirementRegistry,
  recordSourceMarkers,
  recordStageDuration,
  recordStructuralNodes,
  getComplianceRenderedReport,
  complianceSkipLiveVerifyEnabled,
} from "./compliance-observability.js";

const SILENT_SUCCESS_NOTES: Partial<Record<AnalysisToolName, string>> = {
  classify_document: "classification only, no finding by design",
  check_expected_clauses: "expected clause present, no gap to report",
  extract_playbook_positions: "no playbook positions extracted",
  extract_shared_evidence: "shared evidence cached, no finding by design",
  inventory_provisions: "no inventory records extracted",
  aggregate_requirements: "requirement assessments built, no finding by design",
  derive_risk: "no mechanically-implied risk to derive",
  merge_branch_outputs: "branch reports merged deterministically",
};

/**
 * Legacy live VERIFY spine — skipped once Phase 4-7 locked rows exist (see
 * `skipLiveVerify` below, gated on `complianceSkipLiveVerifyEnabled()` AND
 * `state.intent?.operation === "compliance_check"` AND at least one accepted
 * lock). Each tool here is confirmed unused by the new pipeline for that
 * exact case:
 *   - evaluate_package / extract_shared_evidence / inventory_provisions /
 *     evaluate_matrix_row / check_expected_clauses / check_against_rule /
 *     flag_risk / derive_risk / web_assisted_reference: superseded by
 *     Phase 3-7's own retrieval + verification + lock.
 *   - aggregate_requirements: its only output (`requirementAssessments`) is
 *     unconditionally overwritten by `applyLockedComplianceToState` at the
 *     top of `renderOutput` whenever locked rows exist (the exact condition
 *     that gates this skip) — running it first is pure waste.
 *
 * `extract_clauses` / `classify_document` are deliberately NOT here: other
 * report schemas reachable from `compliance_check` (e.g. `rights_matrix_memo`
 * via `renderRightsMatrixMemo` → `numericSlaContrastParagraph`) still read
 * `doc.clauses`, and `classify_document` seeds doc metadata used everywhere.
 */
const LIVE_COMPLIANCE_VERIFY_TOOLS = new Set<AnalysisToolName>([
  "evaluate_package",
  "extract_shared_evidence",
  "inventory_provisions",
  "evaluate_matrix_row",
  "check_expected_clauses",
  "check_against_rule",
  "flag_risk",
  "derive_risk",
  "web_assisted_reference",
  "aggregate_requirements",
]);

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
  if (plan.branches?.length) {
    state = {
      ...state,
      branchReports: {},
      branchDiagnostics: Object.fromEntries(
        plan.branches.map((branch) => [
          branch.facetId,
          { status: "pending" as const, startedAtMs: actStarted, modelCalls: 0 },
        ])
      ),
    };
  }
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

  // PHASE 0 observability — start the compliance-run tracker and capture the
  // plan + source markers before any work-unit runs. Behaviour is unchanged.
  beginComplianceRun(state);
  recordSourceMarkers(state);
  // PHASE 1A ingest telemetry — one `compliance.ingest.table` per detected
  // DOCX table, one `compliance.ingest.table_row` per row, and one
  // `compliance.ingest.marker` per Phase 1A marker (rawPresent vs
  // normalizedPresent). Detection reads the persisted plaintext only.
  recordIngestTables(state);
  recordIngestMarkers(state);
  // PHASE 8 — every side-channel stage below is timed and folded into
  // `compliance.run.timing.stages` (plan §Phase 8: "Every run records
  // stage-level and end-to-end latency"), so a reviewer can see where the
  // side-channel's own cost lands without instrumenting each stage by hand.
  const complianceStage = <T>(stage: string, fn: () => T): T => {
    const t0 = Date.now();
    try {
      return fn();
    } finally {
      recordStageDuration(state, `compliance.${stage}`, Date.now() - t0);
    }
  };
  const complianceStageAsync = async <T>(
    stage: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      recordStageDuration(state, `compliance.${stage}`, Date.now() - t0);
    }
  };

  // PHASE 1B — build the canonical structural-node graph and emit summary /
  // node / orphan events. Side-channel only; segmentation still drives ACT.
  // PHASE 8 — content-addressed cache inside recordStructuralNodes means a
  // repeat run on the same document version is near-free here.
  complianceStage("structure", () => recordStructuralNodes(state));
  // PHASE 1C — definition + internal-reference indexes over those nodes.
  complianceStage("reference_index", () => recordReferenceIndex(state));
  // PHASE 2A/2B — requirement-registry resolution + request/proposition
  // resolution over the request↔native bindings the planner already computed.
  complianceStage("requirement_registry", () => recordRequirementRegistry(state));
  complianceStage("request_resolution", () => recordRequestResolutions(state));
  // PHASE 3A/3B/3C — batched multi-query retrieval, deterministic structural
  // expansion, and evidence bundle with scope partitions. Pure side-channel:
  // nothing here feeds VERIFY yet (Phase 4 will consume the bundles).
  complianceStage("investigate", () => recordPhase3Investigation(state));
  // GENERIC LLM-ASSISTED INVESTIGATION — feature-flagged
  // (LLM_ASSISTED_INVESTIGATION=1), regime-agnostic replacement for the
  // deterministic Phase 3A-C retrieval above. No-ops unless the flag is set.
  // Only swaps into the bundle Phase 4 consumes when
  // LLM_ASSISTED_INVESTIGATION_CANONICAL=1 is ALSO set — otherwise it runs
  // purely for `compliance.investigation.compare` side-by-side logging.
  await complianceStageAsync("llm_investigation", () => recordLlmAssistedInvestigation(state));
  // PHASE 4A — publish the versioned element-schema registry once per run.
  complianceStage("element_registry", () => recordElementRegistry(state));
  // PHASE 4B — deterministic side-channel matrix over Phase 3C bundles.
  // Live VERIFY prompt remains unchanged (§Phase 4A stop gate: legal review
  // must sign off on element schemas before touching verify prompts).
  complianceStage("verify", () => recordPhase4Verification(state));
  // Bounded LLM-assisted retrieval fallback — up to two rounds per requirement
  // when the initial matrix has not_located/ambiguous/unresolved-dep elements
  // or would coarsely read Partial/Gap. Additive side-channel: fills gaps in
  // the requirement-specific bundle with candidates from the full document.
  // Live retrieval / VERIFY / rendering untouched. PHASE 8 — bounded
  // concurrency + a wall-clock stage budget live inside recordRetrievalFallback
  // (ANALYSIS_COMPLIANCE_SIDE_CHANNEL_CONCURRENCY / _BUDGET_MS); requirements
  // that don't fit the budget are skipped explicitly, never truncated.
  await complianceStageAsync("fallback", () => recordRetrievalFallback(state));
  // LLM-backed bundle verifier — one JSON call per requirement, judges
  // whether the bundle items support each authored element. Deterministic
  // post-validation still enforces element completeness, cite existence,
  // exact-quote substrings, and scope compatibility. Additive to the
  // deterministic matrix; nothing consumes it yet — Phase 5 keeps its
  // current input until a reviewer nominates the LLM matrix as canonical.
  // Same PHASE 8 bounded-concurrency + budget guard as the fallback stage.
  await complianceStageAsync("llm_verify", () => recordLlmBundleVerification(state));
  // Canonical swap — when LLM_VERIFY_CANONICAL=1, replaces each requirement's
  // deterministic keyword-gated matrix with the validated LLM verdict in
  // place; otherwise the deterministic matrix stands untouched. When the AI
  // path didn't validate for a requirement, the ENTIRE requirement (not just
  // its supported/contradicted elements) is marked incomplete rather than
  // trusting any deterministic state — see recordLlmVerifyCanonicalSwap for
  // why a bare per-state guard is insufficient.
  complianceStage("verify_canonical", () => recordLlmVerifyCanonicalSwap(state));
  // PHASE 5A + 5B — status calculation + factual explanation over the matrix.
  // Side-channel; live rendering / assessment unchanged (§Phase 5 stop gate).
  complianceStage("assess", () => recordPhase5Assessment(state));
  // PHASE 6 — lock validation. Gates each assessment against 12 correctness
  // rules; a rejected assessment is NOT promoted to a legal status. Emits
  // per-attempt / accepted / rejected / summary events. Nothing consumes the
  // locked set yet (Phase 7 will).
  complianceStage("lock", () => recordLockValidation(state));
  // Planned-requirement capture must happen BEFORE render so the render stage
  // can compare "what was planned and schema-resolved" against "what actually
  // reached a locked row" and flag any coverage gap in the rendered report
  // itself, not only in a log line.
  const plannedRequirementIds = collectPlannedRequirementIds(runnable);
  recordPlannedRequirements(state, plannedRequirementIds);
  // PHASE 7 — locked-only rendering. Projects accepted LockedAssessments into
  // matrix rows + bottom-line synthesis. When ANALYSIS_COMPLIANCE_LIVE_RENDER
  // is enabled (default), renderOutput replaces live VERIFY assessments with
  // these locked rows (chat is locked-only).
  complianceStage("render", () => recordPhase7Render(state));

  const lockedRowsReady =
    (getComplianceRenderedReport(state)?.rows.length ?? 0) > 0;
  const skipLiveVerify =
    complianceSkipLiveVerifyEnabled() &&
    state.intent?.operation === "compliance_check" &&
    lockedRowsReady;
  if (skipLiveVerify) {
    pacLog("ACT skip live VERIFY", {
      reason: "locked_phase4_7_ready",
      lockedRows: getComplianceRenderedReport(state)?.rows.length ?? 0,
      skippedTools: [...LIVE_COMPLIANCE_VERIFY_TOOLS],
    });
  }

  let stepCounter = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex].filter(
      (u) => !(skipLiveVerify && LIVE_COMPLIANCE_VERIFY_TOOLS.has(u.tool))
    );
    if (batch.length === 0) {
      finishedUnits += batches[batchIndex].length;
      continue;
    }
    const skippedInBatch = batches[batchIndex].length - batch.length;
    if (skippedInBatch > 0) finishedUnits += skippedInBatch;
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
        const tokensBefore = state.agent?.tokensUsed ?? 0;
        const waitMs = started - batchStart;
        pacLog(`ACT ▶ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
          id: unit.workUnitId,
          batch: batchIndex,
          concurrent: true,
          wait_ms: waitMs,
        });
        try {
          const ceilingReason = branchCeilingReason(state, unit, started);
          if (ceilingReason) throw new Error(ceilingReason);
          const result = await runTool(state, unit, base);
          const emitted = stampFacetOnFindings(
            normalizeFindingSemantics(
              result.findings.filter((f) => !baseIds.has(f.findingId)),
              state
            ),
            unit
          );
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
            tokenDelta: Math.max(0, (result.state.agent?.tokensUsed ?? tokensBefore) - tokensBefore),
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
            tokenDelta: 0,
            toolState: state,
          };
        }
      });

      for (const outcome of outcomes) {
        findings = [...findings, ...outcome.emitted];
        recordUnitLifecycle(state, outcome.unit, outcome.emitted, outcome.ms);
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
        state = recordBranchOutcome(
          state,
          outcome.unit,
          outcome.ms,
          outcome.failed ? outcome.note : undefined,
          outcome.emitted,
          outcome.tokenDelta
        );
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
      const tokensBefore = state.agent?.tokensUsed ?? 0;
      const waitMs = started - batchStart;
      pacLog(`ACT ▶ [${actStageForTool(unit.tool)}] ${unit.tool}`, {
        id: unit.workUnitId,
        batch: batchIndex,
        concurrent: false,
        wait_ms: waitMs,
      });
      try {
        const ceilingReason = branchCeilingReason(state, unit, started);
        if (ceilingReason) throw new Error(ceilingReason);
        const result = await runTool(state, unit, findings);
        state = result.state;
        findings = stampFacetOnFindings(
          normalizeFindingSemantics(result.findings, state),
          unit
        );
        const emittedFindings = findings.slice(priorFindings.length);
        const emitted = emittedFindings.length;
        recordUnitLifecycle(state, unit, emittedFindings, Date.now() - started);
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
        state = recordBranchOutcome(
          state,
          unit,
          ms,
          undefined,
          emittedFindings,
          Math.max(0, (state.agent?.tokensUsed ?? tokensBefore) - tokensBefore)
        );
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
        state = recordBranchOutcome(
          state,
          unit,
          ms,
          err instanceof Error ? err.message : String(err),
          [],
          0
        );
      }
      finishedUnits += 1;
    }
  }

  const normalizedFindings = normalizeFindingSemantics(findings, state);
  pacLog("ACT finding channels", {
    compliance: normalizedFindings.filter((f) => f.polarity === "compliance_met").length,
    risks: normalizedFindings.filter((f) => f.polarity === "risk_present").length,
    controls: normalizedFindings.filter((f) => f.polarity === "control_present").length,
    neutral: normalizedFindings.filter((f) => f.polarity === "neutral_fact").length,
  });
  pacLog("ACT done", {
    ms: Date.now() - actStarted,
    groupedEvals: packageEvalCount,
    requirements: state.requirementAssessments?.length ?? 0,
    findings: normalizedFindings.length,
  });

  const finalState = {
    ...state,
    findings: normalizedFindings,
    plan: { ...plan, workUnits: units },
    fixPlan: null,
    repairContext: null,
  };
  logActInspect(finalState);

  // PHASE 0 observability — reconcile planned vs terminal (assessed/rendered)
  // requirements and emit stage-total timing. Behaviour is unchanged.
  const terminalRequirementIds = collectTerminalRequirementIds(finalState);
  const duplicateRequirementIds = collectDuplicateRequirementIds(finalState);
  finalizeComplianceRun(finalState, {
    terminalRequirementIds,
    duplicateRequirementIds,
    totalMs: Date.now() - actStarted,
  });

  return finalState;
}

function collectPlannedRequirementIds(units: AnalysisWorkUnit[]): string[] {
  const ids = new Set<string>();
  for (const unit of units) {
    for (const id of unit.requirementIds ?? []) ids.add(id);
    const inputIds = unit.input?.requirementIds;
    if (Array.isArray(inputIds)) {
      for (const id of inputIds) if (typeof id === "string") ids.add(id);
    }
  }
  return [...ids];
}

function requirementIdsForUnit(
  unit: AnalysisWorkUnit,
  emitted: Finding[]
): string[] {
  const ids = new Set<string>();
  for (const id of unit.requirementIds ?? []) ids.add(id);
  const inputIds = unit.input?.requirementIds;
  if (Array.isArray(inputIds)) {
    for (const id of inputIds) if (typeof id === "string") ids.add(id);
  }
  for (const finding of emitted) {
    if (finding.requirementId) ids.add(finding.requirementId);
    for (const id of finding.requestRequirementIds ?? []) ids.add(id);
  }
  return [...ids];
}

function recordUnitLifecycle(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  emitted: Finding[],
  elapsedMs: number
): void {
  const stage: ActStage = actStageForTool(unit.tool);
  recordStageDuration(state, stageKey(stage), elapsedMs);
  const ids = requirementIdsForUnit(unit, emitted);
  if (ids.length === 0 && stage !== "RENDER") return;
  switch (stage) {
    case "INVESTIGATE":
    case "SETUP":
      markRetrieved(state, ids);
      break;
    case "VERIFY":
      // The VERIFY stage in this codebase both retrieves per-requirement
      // candidates AND runs the entailment call, so mark both to stay honest.
      markRetrieved(state, ids);
      markVerified(state, ids);
      break;
    case "LOCK":
      markAssessed(state, ids);
      break;
    case "RENDER":
      markRendered(state, ids.length > 0 ? ids : allKnownRequirementIds(state));
      break;
  }
}

function stageKey(stage: ActStage): string {
  switch (stage) {
    case "INVESTIGATE":
    case "SETUP":
      return "retrieve";
    case "VERIFY":
      return "verify";
    case "LOCK":
      return "assess";
    case "RENDER":
      return "render";
  }
}

function allKnownRequirementIds(state: AnalysisState): string[] {
  const ids = new Set<string>();
  for (const a of state.requirementAssessments ?? []) ids.add(a.requirementId);
  for (const f of state.findings ?? []) if (f.requirementId) ids.add(f.requirementId);
  return [...ids];
}

function collectTerminalRequirementIds(state: AnalysisState): string[] {
  const ids = new Set<string>();
  for (const a of state.requirementAssessments ?? []) ids.add(a.requirementId);
  return [...ids];
}

function collectDuplicateRequirementIds(state: AnalysisState): string[] {
  const seen = new Map<string, number>();
  for (const a of state.requirementAssessments ?? []) {
    seen.set(a.requirementId, (seen.get(a.requirementId) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
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
    case "merge_branch_outputs":
      return mergeBranchOutputs(state, unit, findings);
    default: {
      const _exhaustive: never = unit.tool;
      throw new Error(`Unhandled ACT tool: ${String(_exhaustive)}`);
    }
  }
}

function stampFacetOnFindings(
  findings: Finding[],
  unit: AnalysisWorkUnit
): Finding[] {
  if (!unit.facetId) return findings;
  return findings.map((finding) =>
    finding.facetId || finding.workUnitId !== unit.workUnitId
      ? finding
      : { ...finding, facetId: unit.facetId }
  );
}

function branchCeilingReason(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  now: number
): string | undefined {
  if (!unit.facetId || unit.tool === "render_output" || unit.tool === "merge_branch_outputs") {
    return undefined;
  }
  const branch = state.plan?.branches?.find((item) => item.facetId === unit.facetId);
  const startedAt = state.branchDiagnostics?.[unit.facetId]?.startedAtMs;
  if (!branch || !startedAt) return undefined;
  if (now - startedAt < branch.timeBudget.hardCeilingMs) return undefined;
  return `Branch hard ceiling reached after ${Math.round(branch.timeBudget.hardCeilingMs / 1000)} seconds.`;
}

function recordBranchOutcome(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  elapsedMs: number,
  error: string | undefined,
  emitted: Finding[],
  tokenDelta = 0
): AnalysisState {
  if (!unit.facetId) return state;
  const prior = state.branchDiagnostics?.[unit.facetId] ?? { status: "pending" as const };
  const modelCall = [
    "evaluate_package",
    "check_against_rule",
    "evaluate_matrix_row",
    "flag_risk",
    "render_output",
    "web_assisted_reference",
  ].includes(unit.tool)
    ? 1
    : 0;
  const failedLayer: "ACT" | "LOCK" | "RENDER" | "MERGE" =
    unit.tool === "aggregate_requirements"
      ? "LOCK"
      : unit.tool === "render_output"
        ? "RENDER"
        : unit.tool === "merge_branch_outputs"
          ? "MERGE"
          : "ACT";
  const evidenceCount = new Set(
    emitted.flatMap((finding) =>
      finding.evidence.map(
        (span) => `${span.locator.docId}:${span.locator.charRange[0]}:${span.locator.charRange[1]}`
      )
    )
  ).size;
  const next = {
    ...prior,
    status: error ? ("incomplete" as const) : prior.status,
    elapsedMs: (prior.elapsedMs ?? 0) + elapsedMs,
    modelCalls: (prior.modelCalls ?? 0) + modelCall,
    evidenceCount: (prior.evidenceCount ?? 0) + evidenceCount,
    tokenDelta: (prior.tokenDelta ?? 0) + tokenDelta,
    ...(error ? { failedLayer, reason: error } : {}),
  };
  pacLog(`${failedLayer} branch`, {
    facetId: unit.facetId,
    operation: state.plan?.branches?.find((branch) => branch.facetId === unit.facetId)?.intent.operation,
    unit: unit.workUnitId,
    ms: elapsedMs,
    findings: emitted.length,
    evidence: evidenceCount,
    tokens: tokenDelta,
    cacheHits:
      state.plan?.branches
        ?.find((branch) => branch.facetId === unit.facetId)
        ?.workUnitIds.filter((id) => id.startsWith("shared-")).length ?? 0,
    failed: Boolean(error),
  });
  return {
    ...state,
    branchDiagnostics: {
      ...(state.branchDiagnostics ?? {}),
      [unit.facetId]: next,
    },
  };
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
