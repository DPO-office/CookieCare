/**
 * clause-align.ts — Step 3 of the Compare pipeline
 *
 * Responsibility: produce AlignedPair[] that maps every clause in Agreement A
 * to its counterpart in Agreement B (or marks it unmatched/added/removed).
 *
 * Strategy:
 *   1. Deterministic fast-path  — exact text, exact title, numeric label,
 *      and normalised heading matches. Zero LLM cost.
 *   2. Semantic LLM pass        — only for clauses the deterministic matcher
 *      could not confidently pair. Uses Gemini + the clause-alignment AI Skill.
 *   3. Fallback                 — if the LLM call fails, remaining residual
 *      clauses are marked "unmatched" so the pipeline never hard-fails.
 *
 * The step populates CompareState.alignment and is the foundation that every
 * later phase (diff detection, risk, summary) depends on.
 */

import crypto from "crypto";
import { CompareState, AlignedPair, AlignmentStatus } from "../models/compare-state.js";
import { runDeterministicMatching } from "../utils/deterministic-matcher.js";
import { getSkill } from "../utils/knowledge-loader.js";
import { systemInstruction, buildAlignmentPrompt } from "../prompts/alignment-prompt.js";
import {
  AlignmentResponseSchema,
  ALIGNMENT_JSON_SCHEMA,
  AlignmentEntry,
} from "../schemas/alignment-schema.js";
import {
  executeJsonCompletionWithMeta,
} from "../../drafting/llm/index.js";
import {
  LLMTask,
  LLMProvider,
} from "../../drafting/config/model-specs.js";
import { pipelineMetrics } from "../utils/pipeline-metrics.js";
import { geminiScheduler } from "../utils/llm-scheduler.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum confidence below which a semantic match is treated as "unmatched"
 * rather than forced as "matched".  Favouring correctness over completeness.
 */
const CONFIDENCE_THRESHOLD = 0.50;

/**
 * Maximum number of residual clauses to send to the LLM in a single batch.
 * Keeps token usage predictable for very large agreements.
 * Clauses beyond this limit are batched in chunks.
 */
const LLM_BATCH_SIZE = 40;

// ─── Pair ID generator ────────────────────────────────────────────────────────

let pairSeq = 0;
function nextPairId(): string {
  pairSeq += 1;
  return `pair-${pairSeq}`;
}

// ─── LLM response normaliser ─────────────────────────────────────────────────

/**
 * Convert a raw LLM entry into a valid AlignedPair, applying defensive
 * normalisation the same way DPAReviewAgent.normalizeLLMOutput does.
 */
function normaliseLLMEntry(entry: AlignmentEntry, index: number): AlignedPair {
  const confidence = typeof entry.matchConfidence === "number"
    ? Math.min(1, Math.max(0, entry.matchConfidence))
    : 0;

  // Downgrade alignment type when confidence is below threshold
  const lowConfidence =
    entry.status === "matched" && confidence < CONFIDENCE_THRESHOLD;

  const effectiveType = lowConfidence ? "unmatched" : entry.alignmentType;

  const effectiveStatus: AlignmentStatus = lowConfidence
    ? "restructured"
    : (entry.status as AlignmentStatus);

  return {
    id: nextPairId(),
    clauseAId: entry.clauseAId ?? null,
    clauseBId: entry.clauseBId ?? null,
    matchConfidence: confidence,
    alignmentType: effectiveType,
    alignmentReason: entry.alignmentReason?.trim() || "Alignment produced by LLM semantic matching.",
    status: effectiveStatus,
  };
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

/**
 * When the LLM call fails entirely, mark all residual clauses as unmatched
 * so the pipeline keeps moving rather than throwing.
 * Mirrors the heuristicFallback() pattern in DPAReviewAgent.
 */
function buildFallbackPairs(
  residualA: CompareState["structure"] extends null ? never : CompareState["structure"]["clausesA"],
  residualB: CompareState["structure"] extends null ? never : CompareState["structure"]["clausesB"]
): AlignedPair[] {
  const pairs: AlignedPair[] = [];

  for (const a of residualA) {
    pairs.push({
      id: nextPairId(),
      clauseAId: a.id,
      clauseBId: null,
      matchConfidence: 0,
      alignmentType: "unmatched",
      alignmentReason:
        "LLM semantic alignment unavailable — marked unmatched by fallback. Manual review recommended.",
      status: "removed",
    });
  }

  for (const b of residualB) {
    pairs.push({
      id: nextPairId(),
      clauseAId: null,
      clauseBId: b.id,
      matchConfidence: 0,
      alignmentType: "unmatched",
      alignmentReason:
        "LLM semantic alignment unavailable — marked unmatched by fallback. Manual review recommended.",
      status: "added",
    });
  }

  return pairs;
}

// ─── LLM semantic matching ────────────────────────────────────────────────────

async function runSemanticMatching(
  residualA: NonNullable<CompareState["structure"]>["clausesA"],
  residualB: NonNullable<CompareState["structure"]>["clausesB"]
): Promise<AlignedPair[]> {
  if (residualA.length === 0 && residualB.length === 0) return [];

  // Load the AI Skill and combine with the step's system instruction
  const skill = getSkill("clause-alignment");
  const fullSystemInstruction = `${skill}\n\n---\n\n${systemInstruction}`;

  const allPairs: AlignedPair[] = [];

  // Process residualA in chunks of LLM_BATCH_SIZE. For each chunk, we pass
  // only the B clauses not yet claimed to keep the prompt size bounded.
  for (let i = 0; i < residualA.length; i += LLM_BATCH_SIZE) {
    const batchA = residualA.slice(i, i + LLM_BATCH_SIZE);

    // Build the set of B clause IDs already matched in previous batches
    const claimedBIds = new Set(
      allPairs
        .filter((p) => p.clauseBId !== null && p.status === "matched")
        .map((p) => p.clauseBId!)
    );
    const availableB = residualB.filter((b) => !claimedBIds.has(b.id));

    const prompt = buildAlignmentPrompt(batchA, availableB);

    console.log(
      `[clauseAlignStep] LLM batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
        `${batchA.length} A clauses × ${availableB.length} B clauses`
    );

    let rawEntries: AlignmentEntry[];
    try {
      const { result, usage } = await executeJsonCompletionWithMeta<AlignmentEntry[]>(
        prompt,
        fullSystemInstruction,
        ALIGNMENT_JSON_SCHEMA,
        LLMTask.COMPARE_ALIGN,
        LLMProvider.GEMINI
      );
      rawEntries = result;
      pipelineMetrics.record("clauseAlign", {
        llmRequests: 1,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        llmItems: batchA.length,
      });
    } catch (llmErr: any) {
      console.warn(
        `[clauseAlignStep] LLM call failed for batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
          llmErr.message +
          " — applying fallback for this batch."
      );
      pipelineMetrics.record("clauseAlign", {
        llmRequests: 1,
        fallbackItems: batchA.length,
      });
      allPairs.push(...buildFallbackPairs(batchA, availableB));
      continue;
    }

    // Validate with Zod
    const parsed = AlignmentResponseSchema.safeParse(rawEntries);
    if (!parsed.success) {
      console.warn(
        `[clauseAlignStep] Zod validation failed for LLM batch — applying fallback. ` +
          `Errors: ${JSON.stringify(parsed.error.issues)}`
      );
      allPairs.push(...buildFallbackPairs(batchA, availableB));
      continue;
    }

    const normalisedPairs = parsed.data.map((entry, idx) =>
      normaliseLLMEntry(entry, idx)
    );
    allPairs.push(...normalisedPairs);
  }

  return allPairs;
}

// ─── Main step ────────────────────────────────────────────────────────────────

/**
 * clauseAlignStep — Stage 3 of the compare pipeline.
 *
 * Requires state.structure to be populated (structureExtractStep must have run).
 * Returns an enriched CompareState with state.alignment populated.
 */
export async function clauseAlignStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.structure) {
    throw new Error(
      "[clauseAlignStep] state.structure is null — structureExtractStep must run before clause alignment."
    );
  }

  pairSeq = 0; // Reset for a clean, reproducible run

  const { clausesA, clausesB } = state.structure;

  // ── Step 1: Deterministic matching ────────────────────────────────────────
  const { matched: deterministicPairs, residualA, residualB } =
    runDeterministicMatching(clausesA, clausesB);

  console.log(
    `[clauseAlignStep] Deterministic: ${deterministicPairs.length} pair(s) matched | ` +
      `residual: ${residualA.length} A clause(s), ${residualB.length} B clause(s) → LLM`
  );

  pipelineMetrics.record("clauseAlign", {
    deterministicItems: deterministicPairs.length,
  });

  // ── Step 2: Semantic matching (LLM — only for residual clauses) ───────────
  const semanticPairs = await runSemanticMatching(residualA, residualB);

  console.log(
    `[clauseAlignStep] Semantic: ${semanticPairs.filter((p) => p.status === "matched").length} matched | ` +
      `${semanticPairs.filter((p) => p.status !== "matched").length} unmatched/added/removed`
  );

  // ── Merge results ─────────────────────────────────────────────────────────
  const alignment: AlignedPair[] = [...deterministicPairs, ...semanticPairs];

  console.log(
    `[clauseAlignStep] Final alignment: ${alignment.length} pair(s) total — ` +
      `exact=${alignment.filter((p) => p.alignmentType === "exact").length} ` +
      `semantic=${alignment.filter((p) => p.alignmentType === "semantic").length} ` +
      `unmatched=${alignment.filter((p) => p.alignmentType === "unmatched").length}`
  );

  return {
    ...state,
    alignment,
  };
}
