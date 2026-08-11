/**
 * pipeline-metrics.ts
 *
 * Per-stage and per-pipeline metrics collector for the Compare workflow.
 *
 * Design
 * ───────
 * Each pipeline step records its own StageMetrics via the collector.
 * The workflow retrieves the full picture at the end and prints a
 * structured table to the console.
 *
 * Architecture constraint: CompareState is NOT modified. The collector
 * is a side-channel singleton injected into steps that need it. Steps
 * that do not need metrics simply ignore the collector.
 *
 * Usage
 * ──────
 *   // Inside a step:
 *   import { pipelineMetrics } from "../utils/pipeline-metrics.js";
 *   pipelineMetrics.record("riskAnalysis", { llmRequests: 3, ... });
 *
 *   // At workflow end:
 *   pipelineMetrics.printReport();
 *   pipelineMetrics.reset();   // clean up for the next run
 */

// ─── Per-stage metrics ────────────────────────────────────────────────────────

export interface StageMetrics {
  /** Wall-clock time for the entire stage (ms) */
  wallMs: number;
  /** Number of LLM requests dispatched (0 for deterministic-only stages) */
  llmRequests: number;
  /** Number of LLM retries triggered by 429 / error */
  llmRetries: number;
  /** Number of times the provider returned a rate-limit response */
  rateLimitHits: number;
  /** Total time spent waiting due to pacing or retry delays (ms) */
  waitMs: number;
  /** Actual time spent inside Gemini API calls, excluding wait (ms) */
  llmMs: number;
  /** Prompt tokens consumed (summed across all batches for this stage) */
  promptTokens: number;
  /** Completion tokens generated */
  completionTokens: number;
  /** Total tokens (promptTokens + completionTokens) */
  totalTokens: number;
  /** Items classified without any LLM call */
  deterministicItems: number;
  /** Items sent to the LLM */
  llmItems: number;
  /** Items that fell back to the heuristic (LLM failed) */
  fallbackItems: number;
}

function emptyStageMetrics(): StageMetrics {
  return {
    wallMs: 0,
    llmRequests: 0,
    llmRetries: 0,
    rateLimitHits: 0,
    waitMs: 0,
    llmMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    deterministicItems: 0,
    llmItems: 0,
    fallbackItems: 0,
  };
}

// ─── Stage names ──────────────────────────────────────────────────────────────

export type StageName =
  | "parse"
  | "structureExtract"
  | "clauseAlign"
  | "diffDetect"
  | "riskAnalysis"
  | "executiveSummary";

// ─── Collector ────────────────────────────────────────────────────────────────

export class PipelineMetricsCollector {
  private stages: Map<StageName, StageMetrics> = new Map();

  /** Record (or merge into) metrics for a stage. */
  record(stage: StageName, partial: Partial<StageMetrics>): void {
    const existing = this.stages.get(stage) ?? emptyStageMetrics();
    this.stages.set(stage, {
      wallMs:             (existing.wallMs             ?? 0) + (partial.wallMs             ?? 0),
      llmRequests:        (existing.llmRequests        ?? 0) + (partial.llmRequests        ?? 0),
      llmRetries:         (existing.llmRetries         ?? 0) + (partial.llmRetries         ?? 0),
      rateLimitHits:      (existing.rateLimitHits      ?? 0) + (partial.rateLimitHits      ?? 0),
      waitMs:             (existing.waitMs             ?? 0) + (partial.waitMs             ?? 0),
      llmMs:              (existing.llmMs              ?? 0) + (partial.llmMs              ?? 0),
      promptTokens:       (existing.promptTokens       ?? 0) + (partial.promptTokens       ?? 0),
      completionTokens:   (existing.completionTokens   ?? 0) + (partial.completionTokens   ?? 0),
      totalTokens:        (existing.totalTokens        ?? 0) + (partial.totalTokens        ?? 0),
      deterministicItems: (existing.deterministicItems ?? 0) + (partial.deterministicItems ?? 0),
      llmItems:           (existing.llmItems           ?? 0) + (partial.llmItems           ?? 0),
      fallbackItems:      (existing.fallbackItems      ?? 0) + (partial.fallbackItems      ?? 0),
    });
  }

  /** Overwrite wallMs for a stage (called by the workflow's timed() helper). */
  setWall(stage: StageName, ms: number): void {
    const existing = this.stages.get(stage) ?? emptyStageMetrics();
    this.stages.set(stage, { ...existing, wallMs: ms });
  }

  get(stage: StageName): StageMetrics {
    return this.stages.get(stage) ?? emptyStageMetrics();
  }

  // ── Report ────────────────────────────────────────────────────────────────

  printReport(): void {
    const STAGES: StageName[] = [
      "parse",
      "structureExtract",
      "clauseAlign",
      "diffDetect",
      "riskAnalysis",
      "executiveSummary",
    ];

    const totals = {
      wallMs: 0,
      llmRequests: 0,
      llmRetries: 0,
      rateLimitHits: 0,
      waitMs: 0,
      llmMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    const lines: string[] = [];
    lines.push("================================================");
    lines.push("  COMPARE PIPELINE METRICS");
    lines.push("------------------------------------------------");

    for (const stage of STAGES) {
      const m = this.stages.get(stage) ?? emptyStageMetrics();

      totals.wallMs         += m.wallMs;
      totals.llmRequests    += m.llmRequests;
      totals.llmRetries     += m.llmRetries;
      totals.rateLimitHits  += m.rateLimitHits;
      totals.waitMs         += m.waitMs;
      totals.llmMs          += m.llmMs;
      totals.promptTokens   += m.promptTokens;
      totals.completionTokens += m.completionTokens;
      totals.totalTokens    += m.totalTokens;

      const label = stage.padEnd(20);

      if (m.llmRequests === 0) {
        lines.push(
          `  ${label} Wall: ${fmt(m.wallMs)}  LLM: none  ` +
          `Deterministic: ${m.deterministicItems}`
        );
      } else {
        const tokenStr =
          m.totalTokens > 0
            ? `Tokens: ${m.totalTokens} (↑${m.promptTokens} ↓${m.completionTokens})`
            : "Tokens: n/a";
        lines.push(
          `  ${label} Wall: ${fmt(m.wallMs)}  ` +
          `Requests: ${m.llmRequests}  Retries: ${m.llmRetries}  ` +
          `RateLimit: ${m.rateLimitHits}  ` +
          `Wait: ${fmt(m.waitMs)}  LLMExec: ${fmt(m.llmMs)}  ` +
          `${tokenStr}`
        );
        if (m.deterministicItems > 0 || m.llmItems > 0) {
          lines.push(
            `  ${"".padEnd(20)} ` +
            `Deterministic: ${m.deterministicItems}  ` +
            `LLM: ${m.llmItems}  ` +
            `Fallback: ${m.fallbackItems}`
          );
        }
      }
    }

    lines.push("------------------------------------------------");
    lines.push(`  ${"TOTAL".padEnd(20)} Wall: ${fmt(totals.wallMs)}`);
    lines.push(`  ${"".padEnd(20)} LLM Requests: ${totals.llmRequests}`);
    lines.push(`  ${"".padEnd(20)} LLM Retries:  ${totals.llmRetries}`);
    lines.push(`  ${"".padEnd(20)} Rate Limits:  ${totals.rateLimitHits}`);
    lines.push(`  ${"".padEnd(20)} Total Wait:   ${fmt(totals.waitMs)}`);
    lines.push(`  ${"".padEnd(20)} LLM Exec:     ${fmt(totals.llmMs)}`);
    if (totals.totalTokens > 0) {
      lines.push(
        `  ${"".padEnd(20)} Tokens:       ${totals.totalTokens} ` +
        `(prompt=${totals.promptTokens} completion=${totals.completionTokens})`
      );
    }
    lines.push("================================================");

    console.log(lines.join("\n"));
  }

  reset(): void {
    this.stages.clear();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000)  return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

// ─── Global singleton ─────────────────────────────────────────────────────────

export const pipelineMetrics = new PipelineMetricsCollector();
