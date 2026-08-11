/**
 * diff-detect.ts — Step 4 of the Compare pipeline
 *
 * Responsibility: classify the semantic difference for every aligned clause
 * pair and populate CompareState.differences.
 *
 * Strategy (deterministic-first, same philosophy as Phase 2):
 *
 *   Tier 1 — Identical text
 *     → UNCHANGED, confidence 1.0, no LLM call.
 *
 *   Tier 2 — High character similarity (≥ SIM_THRESHOLD)
 *     → NEUTRAL_REPHRASE, confidence proportional to similarity, no LLM call.
 *
 *   Tier 3 — ADDED / REMOVED pairs (null on one side)
 *     → Classified directly from alignment status, no LLM call.
 *
 *   Tier 4 — Genuine semantic diff required
 *     → LLM call (Gemini Flash, COMPARE_DIFF task).
 *     → Uses the difference-analysis AI Skill + difference-prompt.
 *     → Batched at LLM_BATCH_SIZE pairs per call.
 *     → Validated with Zod; fallback on failure.
 */

import {
  CompareState,
  AlignedPair,
  ExtractedClause,
  ClauseDifference,
  DiffClassification,
} from "../models/compare-state.js";
import { getSkill } from "../utils/knowledge-loader.js";
import {
  systemInstruction,
  buildDifferencePrompt,
  resolveClauseTexts,
  ResolvedPair,
} from "../prompts/difference-prompt.js";
import {
  DifferenceResponseSchema,
  DIFFERENCE_JSON_SCHEMA,
  DifferenceEntry,
} from "../schemas/difference-schema.js";
import { executeJsonCompletionWithMeta } from "../../drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../../drafting/config/model-specs.js";
import { pipelineMetrics } from "../utils/pipeline-metrics.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Character-level Jaccard similarity threshold above which a pair is
 * classified NEUTRAL_REPHRASE without calling the LLM.
 * Set at 0.95: 5% of characters must differ for us to bother the model.
 */
const SIM_THRESHOLD = 0.95;

/** Max pairs sent to the LLM in one batch */
const LLM_BATCH_SIZE = 20;

// ─── Similarity ───────────────────────────────────────────────────────────────

/**
 * Bigram-based character similarity (Dice coefficient).
 * Fast, language-agnostic, works well for legal text.
 *
 * Returns a score in [0, 1] where 1 = identical.
 */
function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const getBigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  let intersection = 0;
  for (const [bg, countA] of bigramsA) {
    const countB = bigramsB.get(bg) ?? 0;
    intersection += Math.min(countA, countB);
  }

  const totalA = a.length - 1;
  const totalB = b.length - 1;
  return (2 * intersection) / (totalA + totalB);
}

// ─── Deterministic tier handlers ─────────────────────────────────────────────

function makeResult(
  pair: AlignedPair,
  classification: DiffClassification,
  semanticSummary: string,
  confidence: number,
  detectionMethod: ClauseDifference["detectionMethod"]
): ClauseDifference {
  return {
    pairId: pair.id,
    clauseAId: pair.clauseAId,
    clauseBId: pair.clauseBId,
    classification,
    semanticSummary,
    confidence,
    detectionMethod,
  };
}

/**
 * Apply deterministic tiers to a single pair.
 * Returns a ClauseDifference when the tier fires, or null when the pair
 * must be forwarded to the LLM.
 */
function tryDeterministic(
  pair: AlignedPair,
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>
): ClauseDifference | null {
  // Tier 3: ADDED / REMOVED — derived from alignment, no text comparison needed
  if (pair.clauseAId === null) {
    return makeResult(pair, "ADDED", "", 1.0, "identical");
  }
  if (pair.clauseBId === null) {
    return makeResult(pair, "REMOVED", "", 1.0, "identical");
  }

  const textA = clauseMapA.get(pair.clauseAId)?.text ?? "";
  const textB = clauseMapB.get(pair.clauseBId)?.text ?? "";

  // Tier 1: Exact text match → UNCHANGED
  if (textA === textB) {
    return makeResult(pair, "UNCHANGED", "", 1.0, "identical");
  }

  // Tier 2: High similarity → NEUTRAL_REPHRASE (no LLM needed)
  const sim = charSimilarity(textA, textB);
  if (sim >= SIM_THRESHOLD) {
    return makeResult(
      pair,
      "NEUTRAL_REPHRASE",
      `Clause wording changed slightly (${Math.round(sim * 100)}% character similarity) with no apparent change in legal meaning.`,
      sim,
      "similarity"
    );
  }

  return null; // Must go to LLM
}

// ─── LLM normaliser ───────────────────────────────────────────────────────────

function normaliseLLMEntry(entry: DifferenceEntry): ClauseDifference {
  return {
    pairId: entry.pairId,
    clauseAId: entry.clauseAId ?? null,
    clauseBId: entry.clauseBId ?? null,
    classification: entry.classification as DiffClassification,
    semanticSummary: entry.semanticSummary?.trim() ?? "",
    confidence: Math.min(1, Math.max(0, entry.confidence)),
    detectionMethod: "llm",
  };
}

// ─── LLM fallback ─────────────────────────────────────────────────────────────

/**
 * When the LLM fails for a batch, produce safe fallback results so the
 * pipeline does not hard-fail. Mirrors heuristicFallback in DPAReviewAgent.
 */
function buildFallbackResults(pairs: AlignedPair[]): ClauseDifference[] {
  return pairs.map((p) => ({
    pairId: p.id,
    clauseAId: p.clauseAId,
    clauseBId: p.clauseBId,
    // Safest assumption: something changed, but we could not classify it.
    // Phase 4 (Risk) will treat unclassified pairs conservatively.
    classification: "MODIFIED_BROADER" as DiffClassification,
    semanticSummary:
      "Semantic classification unavailable — LLM call failed. Manual review recommended.",
    confidence: 0.1,
    detectionMethod: "fallback" as ClauseDifference["detectionMethod"],
  }));
}

// ─── LLM semantic batch ───────────────────────────────────────────────────────

async function runSemanticDiff(
  pairs: AlignedPair[],
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>
): Promise<ClauseDifference[]> {
  if (pairs.length === 0) return [];

  const skill = getSkill("difference-analysis");
  const fullSystemInstruction = `${skill}\n\n---\n\n${systemInstruction}`;

  const results: ClauseDifference[] = [];

  for (let i = 0; i < pairs.length; i += LLM_BATCH_SIZE) {
    const batch = pairs.slice(i, i + LLM_BATCH_SIZE);
    const resolved: ResolvedPair[] = resolveClauseTexts(
      batch,
      clauseMapA,
      clauseMapB
    );
    const prompt = buildDifferencePrompt(resolved);

    console.log(
      `[diffDetectStep] LLM batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
        `${batch.length} pair(s) → semantic classification`
    );

    let rawEntries: DifferenceEntry[];
    try {
      const { result, usage } = await executeJsonCompletionWithMeta<DifferenceEntry[]>(
        prompt,
        fullSystemInstruction,
        DIFFERENCE_JSON_SCHEMA,
        LLMTask.COMPARE_DIFF,
        LLMProvider.GEMINI
      );
      rawEntries = result;
      pipelineMetrics.record("diffDetect", {
        llmRequests: 1,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        llmItems: batch.length,
      });
    } catch (llmErr: any) {
      console.warn(
        `[diffDetectStep] LLM call failed for batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
          llmErr.message +
          " — applying fallback."
      );
      pipelineMetrics.record("diffDetect", {
        llmRequests: 1,
        fallbackItems: batch.length,
      });
      results.push(...buildFallbackResults(batch));
      continue;
    }

    const parsed = DifferenceResponseSchema.safeParse(rawEntries);
    if (!parsed.success) {
      console.warn(
        `[diffDetectStep] Zod validation failed — applying fallback. ` +
          `Errors: ${JSON.stringify(parsed.error.issues)}`
      );
      results.push(...buildFallbackResults(batch));
      continue;
    }

    results.push(...parsed.data.map(normaliseLLMEntry));
  }

  return results;
}

// ─── Main step ────────────────────────────────────────────────────────────────

/**
 * diffDetectStep — Stage 4 of the compare pipeline.
 *
 * Requires state.alignment to be populated (clauseAlignStep must have run).
 * Returns an enriched CompareState with state.differences populated.
 */
export async function diffDetectStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.alignment) {
    throw new Error(
      "[diffDetectStep] state.alignment is null — clauseAlignStep must run before difference detection."
    );
  }
  if (!state.structure) {
    throw new Error(
      "[diffDetectStep] state.structure is null — structureExtractStep must run before difference detection."
    );
  }

  // Build O(1) lookup maps from clause ID → ExtractedClause
  const clauseMapA = new Map<string, ExtractedClause>(
    state.structure.clausesA.map((c) => [c.id, c])
  );
  const clauseMapB = new Map<string, ExtractedClause>(
    state.structure.clausesB.map((c) => [c.id, c])
  );

  const deterministic: ClauseDifference[] = [];
  const llmQueue: AlignedPair[] = [];

  // ── Deterministic pass ───────────────────────────────────────────────────
  for (const pair of state.alignment) {
    const result = tryDeterministic(pair, clauseMapA, clauseMapB);
    if (result !== null) {
      deterministic.push(result);
    } else {
      llmQueue.push(pair);
    }
  }

  const unchanged = deterministic.filter((d) => d.classification === "UNCHANGED").length;
  const rephrase  = deterministic.filter((d) => d.classification === "NEUTRAL_REPHRASE").length;
  const addedRem  = deterministic.filter(
    (d) => d.classification === "ADDED" || d.classification === "REMOVED"
  ).length;

  console.log(
    `[diffDetectStep] Deterministic: ${deterministic.length} classified ` +
      `(unchanged=${unchanged}, rephrase=${rephrase}, added/removed=${addedRem}) | ` +
      `${llmQueue.length} pair(s) → LLM`
  );

  pipelineMetrics.record("diffDetect", {
    deterministicItems: deterministic.length,
  });

  // ── LLM semantic pass (only residual pairs) ──────────────────────────────
  const semantic = await runSemanticDiff(llmQueue, clauseMapA, clauseMapB);

  const broader  = semantic.filter((d) => d.classification === "MODIFIED_BROADER").length;
  const narrower = semantic.filter((d) => d.classification === "MODIFIED_NARROWER").length;

  console.log(
    `[diffDetectStep] Semantic: ${semantic.length} classified ` +
      `(broader=${broader}, narrower=${narrower}, fallback=${
        semantic.filter((d) => d.detectionMethod === "fallback").length
      })`
  );

  // ── Merge ────────────────────────────────────────────────────────────────
  // Preserve original alignment order so downstream stages can iterate
  // alignment and differences in lockstep.
  const pairOrder = new Map(
    state.alignment.map((p, i) => [p.id, i])
  );
  const differences: ClauseDifference[] = [...deterministic, ...semantic].sort(
    (a, b) => (pairOrder.get(a.pairId) ?? 0) - (pairOrder.get(b.pairId) ?? 0)
  );

  console.log(
    `[diffDetectStep] Final differences: ${differences.length} total`
  );

  return {
    ...state,
    differences,
  };
}
