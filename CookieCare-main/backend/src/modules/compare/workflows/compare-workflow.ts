/**
 * compare-workflow.ts — CompareWorkflowOrchestrator
 *
 * Mirrors the DraftWorkflowOrchestrator pattern from
 * src/modules/drafting/workflows/draft-workflow.ts.
 *
 * Phase 1 pipeline:
 *   Parse → Structure Extraction → return CompareState
 *
 * Phases 2–4 are stubbed as TODOs.  Each stub receives and returns a
 * CompareState so the final pipeline shape is already correct — future
 * phases slot in without changing the orchestrator's structure.
 */

import { CompareState } from "../models/compare-state.js";
import { parseStep } from "../steps/parse.js";
import { structureExtractStep } from "../steps/structure-extract.js";
import { clauseAlignStep } from "../steps/clause-align.js";
import { diffDetectStep } from "../steps/diff-detect.js";
import { riskAnalysisStep } from "../steps/risk-analysis.js";
import { executiveSummaryStep } from "../steps/executive-summary.js";
import { validateCompareOutput } from "../pac/critique-compare.js";
import { pipelineMetrics, StageName } from "../utils/pipeline-metrics.js";
import { geminiScheduler } from "../utils/llm-scheduler.js";

// ─── Step timing helper (mirrors draft-workflow.ts) ───────────────────────────

type StepTiming = { label: string; ms: number };

async function timed(
  state: CompareState,
  label: string,
  fn: (s: CompareState) => Promise<CompareState>
): Promise<CompareState> {
  const start = Date.now();
  const next = await fn(state);
  const ms = Date.now() - start;

  // Record wall time in the metrics collector (if this label is a known stage)
  pipelineMetrics.setWall(label as StageName, ms);

  const prior: StepTiming[] = Array.isArray(
    (next.metadata as { stepTimings?: StepTiming[] }).stepTimings
  )
    ? ((next.metadata as { stepTimings?: StepTiming[] }).stepTimings as StepTiming[])
    : [];
  return {
    ...next,
    metadata: {
      ...next.metadata,
      stepTimings: [...prior, { label, ms }],
    },
  };
}

function logTimings(state: CompareState): void {
  const timings = (
    (state.metadata as { stepTimings?: StepTiming[] }).stepTimings ?? []
  ) as StepTiming[];
  const total = timings.reduce((sum, t) => sum + t.ms, 0);
  const breakdown = timings.map((t) => `${t.label}=${t.ms}ms`).join("  ");
  console.log(`[CompareWorkflow/Timings] total=${total}ms  ${breakdown}`);
}

// ─── Progress helper ──────────────────────────────────────────────────────────

async function progress(
  state: CompareState,
  percent: number,
  message: string
): Promise<void> {
  if (state.onProgress) {
    await state.onProgress(percent, message).catch(() => {
      /* non-fatal */
    });
  }
}

// ─── Scheduler stat sync ─────────────────────────────────────────────────────

/**
 * After all steps complete, pull the global scheduler's aggregate stats
 * (retries, rate-limit hits, wait time, LLM exec time) and distribute them
 * proportionally across the stages that made LLM calls.
 *
 * This is the simplest approach that doesn't require per-call tagging inside
 * the scheduler — each stage already knows its own llmRequests count, so we
 * weight the scheduler totals by that share.
 */
function syncSchedulerStats(): void {
  const sched = geminiScheduler.getStats();
  const STAGES = [
    "clauseAlign",
    "diffDetect",
    "riskAnalysis",
    "executiveSummary",
  ] as const;

  const totalRequests = STAGES.reduce(
    (sum, s) => sum + pipelineMetrics.get(s).llmRequests,
    0
  );

  if (totalRequests === 0) return;

  for (const stage of STAGES) {
    const m = pipelineMetrics.get(stage);
    if (m.llmRequests === 0) continue;

    const share = m.llmRequests / totalRequests;
    pipelineMetrics.record(stage, {
      llmRetries:    Math.round(sched.totalRetries    * share),
      rateLimitHits: Math.round(sched.totalRateLimitHits * share),
      waitMs:        Math.round(sched.totalWaitMs     * share),
      llmMs:         Math.round(sched.totalLlmMs      * share),
    });
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class CompareWorkflowOrchestrator {
  /**
   * Phase 1 pipeline: parse + structure extraction.
   *
   * Future phases extend this method by appending steps after
   * structureExtractStep.  The timed() + progress() pattern is already in
   * place so new steps require only two lines each.
   */
  async execute(initialState: CompareState): Promise<CompareState> {
    let state: CompareState = { ...initialState };

    // Reset metrics and scheduler stats for a clean per-run view
    pipelineMetrics.reset();
    geminiScheduler.resetStats();

    try {
      // Step 1 — Document Parsing
      await progress(state, 10, "Extracting text from both documents...");
      state = await timed(state, "parse", (s) => parseStep(s));

      // Step 2 — Structure Extraction
      await progress(state, 30, "Identifying clause structure...");
      state = await timed(state, "structureExtract", (s) =>
        structureExtractStep(s)
      );

      // Step 3 — Clause Alignment
      await progress(state, 55, "Aligning clauses between agreements...");
      state = await timed(state, "clauseAlign", (s) => clauseAlignStep(s));

      // Step 4 — Difference Detection
      await progress(state, 75, "Detecting semantic differences...");
      state = await timed(state, "diffDetect", (s) => diffDetectStep(s));

      // Step 5 — Risk Analysis
      await progress(state, 88, "Analysing legal and commercial risk...");
      state = await timed(state, "riskAnalysis", (s) => riskAnalysisStep(s));

      // Step 6 — Executive Summary
      // Executive summary requires state.risks so it runs after Step 5.
      // Its LLM call is now fast (Flash model, compact Top-10 prompt).
      await progress(state, 96, "Generating executive summary...");
      state = await timed(state, "executiveSummary", (s) =>
        executiveSummaryStep(s)
      );

      // ── Phase 6 TODO: Report Assembly ─────────────────────────────────────
      // state = await timed(state, "reportAssemble", (s) => reportAssembleStep(s));

      // ── Phase 6 TODO: Save ────────────────────────────────────────────────
      // state = await timed(state, "save", (s) => saveStep(s));

      await progress(state, 100, "Analysis complete.");

      // ── Post-pipeline validation (PAC Critique Lite for Compare) ──────────
      // Pure, synchronous invariant check — zero LLM calls, zero side effects.
      // Validates referential integrity and required field presence across
      // alignment, differences, risks, and executive summary.
      const critiqueResult = validateCompareOutput(state);
      state = {
        ...state,
        metadata: {
          ...state.metadata,
          validationIssues: critiqueResult.summaryMessages,
          validationCounts: critiqueResult.counts,
        },
      };

      if (critiqueResult.counts.errors > 0) {
        console.warn(
          `[CompareWorkflow/Critique] Validation completed with ` +
            `${critiqueResult.counts.errors} error(s) and ` +
            `${critiqueResult.counts.warnings} warning(s). ` +
            "Output is structurally inconsistent — review validationIssues in metadata."
        );
        for (const iss of critiqueResult.issues.filter((i) => i.severity === "error")) {
          console.warn(`  [error] ${iss.id}: ${iss.message}`);
        }
      } else if (critiqueResult.counts.warnings > 0) {
        console.log(
          `[CompareWorkflow/Critique] Validation passed with ` +
            `${critiqueResult.counts.warnings} warning(s).`
        );
        for (const iss of critiqueResult.issues.filter((i) => i.severity === "warning")) {
          console.log(`  [warn] ${iss.id}: ${iss.message}`);
        }
      } else {
        console.log("[CompareWorkflow/Critique] Validation passed — output is structurally clean.");
      }

      // Merge scheduler-level stats (retries, wait time, rate limits) into
      // each stage's metrics.  The scheduler is global so we distribute its
      // totals proportionally by LLM request count per stage, which is the
      // fairest approximation without per-call tagging.
      syncSchedulerStats();

      logTimings(state);
      pipelineMetrics.printReport();

      return state;
    } catch (error) {
      // Still print whatever metrics we collected before the failure
      syncSchedulerStats();
      pipelineMetrics.printReport();
      throw new Error(
        `[CompareWorkflowOrchestrator] Pipeline failed: ${(error as Error).message}`
      );
    }
  }
}
