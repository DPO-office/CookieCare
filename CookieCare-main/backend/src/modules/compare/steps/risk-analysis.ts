/**
 * risk-analysis.ts — Step 5 of the Compare pipeline
 *
 * Responsibility: evaluate the legal and commercial risk of each detected
 * difference and populate CompareState.risks.
 *
 * Strategy (deterministic-first, mirrors Phase 2 and Phase 3 philosophy):
 *
 *   Stage 1 — Filter
 *     Skip differences with no risk signal:
 *       • UNCHANGED  → no risk, skip
 *       • NEUTRAL_REPHRASE → no risk, skip
 *
 *   Stage 2 — Deterministic rule engine
 *     Apply pattern rules (risk-rules.ts) against clause titles + semantic summary.
 *     High-confidence matches are classified directly — no LLM call.
 *     First rule that matches wins.
 *
 *   Stage 3 — LLM reasoning (only for residual diffs)
 *     Gemini receives the enriched differences the rules could not classify.
 *     Uses the risk-analysis AI Skill + risk-prompt.
 *     Validated with Zod; fallback on failure.
 *
 *   Stage 4 — Merge + assign stable IDs
 *     Combine deterministic and LLM findings.
 *     Sort: HIGH → MEDIUM → LOW (mirrors expected consumer order).
 *
 * Input:  CompareState.differences + CompareState.structure (for clause text)
 * Output: CompareState.risks (RiskFinding[])
 */

import {
  CompareState,
  ExtractedClause,
  RiskFinding,
  RiskLevel,
} from "../models/compare-state.js";
import { getSkill } from "../utils/knowledge-loader.js";
import { runDeterministicRiskRules } from "../utils/risk-rules.js";
import {
  systemInstruction,
  buildRiskPrompt,
  enrichDifference,
  EnrichedDifference,
} from "../prompts/risk-prompt.js";
import {
  RiskResponseSchema,
  RISK_JSON_SCHEMA,
  RiskFindingLLMEntry,
} from "../schemas/risk-schema.js";
import { executeJsonCompletionWithMeta } from "../../drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../../drafting/config/model-specs.js";
import { pipelineMetrics } from "../utils/pipeline-metrics.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max differences to send to the LLM in one batch */
const LLM_BATCH_SIZE = 10;

/**
 * Administrative / procedural clause patterns that rarely carry genuine risk.
 * Differences on these clauses are assigned LOW deterministically without
 * an LLM call — the LLM can't add meaningful signal here.
 *
 * Only applies to ADDED/REMOVED (clear-cut structural changes). MODIFIED_*
 * variants still go to the rule engine to catch edge cases.
 */
const ADMIN_CLAUSE_PATTERNS = [
  /\bnotice[s]?\b/,
  /\baddress(?:es)?\b/,
  /\bsignature[s]?\b/,
  /\bexecution\b/,
  /\bcounterpart[s]?\b/,
  /\brecital[s]?\b/,
  /\bpreamble\b/,
  /\bentire agreement\b/,
  /\bintegration clause\b/,
  /\bseverabilit/,
  /\bwaiver\b/,
  /\bheading[s]?\b/,
  /\bexhibit[s]?\b/,
  /\bschedule[s]? [a-z]\b/,
  /\bannex\b/,
  /\bappendix\b/,
];

/** Risk level order for sorting output */
const LEVEL_ORDER: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// ─── Risk ID counter ──────────────────────────────────────────────────────────

let riskSeq = 0;

function nextRiskId(): string {
  riskSeq += 1;
  return `risk-${riskSeq}`;
}

// ─── Admin clause guard ───────────────────────────────────────────────────────

/**
 * Returns true when a difference concerns a purely administrative/procedural
 * clause that does not carry meaningful legal risk.
 * Only used to skip ADDED and REMOVED — MODIFIED_* variants still go to rules.
 */
function isAdminClause(diff: EnrichedDifference): boolean {
  const corpus = [diff.titleA ?? "", diff.titleB ?? ""].join(" ").toLowerCase();
  return ADMIN_CLAUSE_PATTERNS.some((rx) => rx.test(corpus));
}

// ─── LLM result normaliser ────────────────────────────────────────────────────

function normaliseLLMEntry(entry: RiskFindingLLMEntry): RiskFinding {
  return {
    id: nextRiskId(),
    pairId: entry.pairId,
    level: entry.level,
    category: entry.category,
    rationale: entry.rationale.trim(),
    confidence: Math.min(1, Math.max(0, entry.confidence)),
    source: "llm",
  };
}

// ─── LLM fallback ─────────────────────────────────────────────────────────────

/**
 * When the LLM call fails for a batch, produce conservative MEDIUM findings so
 * the pipeline does not silently drop risk signals.
 * Mirrors the heuristic fallback pattern in diff-detect.ts.
 */
function buildFallbackFindings(diffs: EnrichedDifference[]): RiskFinding[] {
  return diffs.map((d) => ({
    id: nextRiskId(),
    pairId: d.pairId,
    level: "MEDIUM" as RiskLevel,
    category: "other" as const,
    rationale:
      "Risk classification unavailable — LLM call failed. " +
      "This difference involves a material clause change and should be reviewed manually.",
    confidence: 0.3,
    source: "llm" as const,
  }));
}

// ─── LLM semantic risk pass ───────────────────────────────────────────────────

async function runSemanticRisk(
  residual: EnrichedDifference[]
): Promise<RiskFinding[]> {
  if (residual.length === 0) return [];

  const skill = getSkill("risk-analysis");
  const fullSystemInstruction = `${skill}\n\n---\n\n${systemInstruction}`;

  const results: RiskFinding[] = [];

  for (let i = 0; i < residual.length; i += LLM_BATCH_SIZE) {
    const batch = residual.slice(i, i + LLM_BATCH_SIZE);
    const prompt = buildRiskPrompt(batch);

    console.log(
      `[riskAnalysisStep] LLM batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
        `${batch.length} difference(s) → risk evaluation`
    );

    let rawEntries: RiskFindingLLMEntry[];
    try {
      const { result, usage } = await executeJsonCompletionWithMeta<RiskFindingLLMEntry[]>(
        prompt,
        fullSystemInstruction,
        RISK_JSON_SCHEMA,
        LLMTask.COMPARE_RISK,
        LLMProvider.GEMINI
      );
      rawEntries = result;
      pipelineMetrics.record("riskAnalysis", {
        llmRequests: 1,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        llmItems: batch.length,
      });
    } catch (llmErr: any) {
      console.warn(
        `[riskAnalysisStep] LLM call failed for batch ` +
          `${Math.floor(i / LLM_BATCH_SIZE) + 1}: ${llmErr.message} — applying fallback.`
      );
      pipelineMetrics.record("riskAnalysis", {
        llmRequests: 1,
        fallbackItems: batch.length,
      });
      results.push(...buildFallbackFindings(batch));
      continue;
    }

    const parsed = RiskResponseSchema.safeParse(rawEntries);
    if (!parsed.success) {
      console.warn(
        `[riskAnalysisStep] Zod validation failed — applying fallback. ` +
          `Errors: ${JSON.stringify(parsed.error.issues)}`
      );
      results.push(...buildFallbackFindings(batch));
      continue;
    }

    results.push(...parsed.data.map(normaliseLLMEntry));
  }

  return results;
}

// ─── Main step ────────────────────────────────────────────────────────────────

/**
 * riskAnalysisStep — Stage 5 of the compare pipeline.
 *
 * Requires:
 *   - state.differences to be populated (diffDetectStep must have run)
 *   - state.structure to be populated (for clause text lookup)
 *
 * Returns an enriched CompareState with state.risks populated.
 */
export async function riskAnalysisStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.differences) {
    throw new Error(
      "[riskAnalysisStep] state.differences is null — diffDetectStep must run before risk analysis."
    );
  }
  if (!state.structure) {
    throw new Error(
      "[riskAnalysisStep] state.structure is null — structureExtractStep must run before risk analysis."
    );
  }

  riskSeq = 0; // Reset for a clean, reproducible run

  // ── Build clause text lookup maps ────────────────────────────────────────
  const clauseMapA = new Map<string, ExtractedClause>(
    state.structure.clausesA.map((c) => [c.id, c])
  );
  const clauseMapB = new Map<string, ExtractedClause>(
    state.structure.clausesB.map((c) => [c.id, c])
  );

  // Build alignment map so we can check matchConfidence per diff (P0-3)
  const alignmentMap = new Map(
    (state.alignment ?? []).map((p) => [p.id, p])
  );

  // ── Stage 1: Filter — enrich risk-eligible differences only ──────────────
  const enriched: EnrichedDifference[] = [];
  let skipped = 0;
  let adminSkipped = 0;
  let fallbackSkipped = 0;

  for (const diff of state.differences) {
    // P0-2: Skip differences that are artefacts of an LLM alignment failure.
    // When the alignment LLM was unavailable, fallback pairs were emitted with
    // detectionMethod "fallback". These represent uncertain alignment, not a
    // confirmed content change, so they must never generate risk findings.
    if (diff.detectionMethod === "fallback") {
      fallbackSkipped += 1;
      continue;
    }

    const e = enrichDifference(diff, clauseMapA, clauseMapB);
    if (e === null) {
      skipped += 1;
      continue;
    }

    // Skip administrative/procedural ADDED or REMOVED clauses deterministically.
    // These never carry meaningful risk and eliminating them reduces LLM batches.
    if (
      (diff.classification === "ADDED" || diff.classification === "REMOVED") &&
      isAdminClause(e)
    ) {
      adminSkipped += 1;
      continue;
    }

    enriched.push(e);
  }

  console.log(
    `[riskAnalysisStep] Filtering: ${enriched.length} risk-eligible difference(s) | ` +
      `${skipped} skipped (UNCHANGED/NEUTRAL_REPHRASE) | ` +
      `${adminSkipped} skipped (admin/procedural) | ` +
      `${fallbackSkipped} skipped (alignment-fallback/uncertain)`
  );

  if (enriched.length === 0) {
    console.log(
      "[riskAnalysisStep] No risk-eligible differences — returning empty risks array."
    );
    return { ...state, risks: [] };
  }

  // ── Stage 2: Deterministic rule engine ───────────────────────────────────
  const { findings: deterministicFindings, residual } =
    runDeterministicRiskRules(enriched);

  // Re-assign stable IDs now (the rule engine uses its own counter that
  // may reset across invocations — we use riskSeq here for consistency).
  const normalisedDeterministic: RiskFinding[] = deterministicFindings.map(
    (f) => ({ ...f, id: nextRiskId() })
  );

  console.log(
    `[riskAnalysisStep] Deterministic: ${normalisedDeterministic.length} finding(s) | ` +
      `${residual.length} difference(s) → LLM`
  );

  pipelineMetrics.record("riskAnalysis", {
    deterministicItems: normalisedDeterministic.length,
  });

  // ── Stage 3: LLM semantic risk pass ──────────────────────────────────────
  const llmFindings = await runSemanticRisk(residual);

  const high = llmFindings.filter((f) => f.level === "HIGH").length;
  const medium = llmFindings.filter((f) => f.level === "MEDIUM").length;
  const low = llmFindings.filter((f) => f.level === "LOW").length;

  console.log(
    `[riskAnalysisStep] LLM: ${llmFindings.length} finding(s) ` +
      `(HIGH=${high} MEDIUM=${medium} LOW=${low})`
  );

  // ── Stage 4: Merge, cap low-confidence findings (P0-3), and sort ──────────
  //
  // Risk findings derived from low-confidence semantic alignment must NOT be
  // presented as equally trustworthy as findings from exact/deterministic matches.
  // For any finding whose source alignment pair had matchConfidence < 0.75 and
  // alignmentType "semantic", cap the finding level to MEDIUM (never HIGH).
  // The rationale is annotated so reviewers understand the qualification.
  const LOW_ALIGNMENT_THRESHOLD = 0.75;

  const capFinding = (f: RiskFinding): RiskFinding => {
    const pair = alignmentMap.get(f.pairId);
    if (!pair) return f;
    if (
      pair.alignmentType !== "semantic" ||
      pair.matchConfidence >= LOW_ALIGNMENT_THRESHOLD
    ) {
      return f;
    }
    // Cap HIGH → MEDIUM; MEDIUM and LOW are left as-is
    if (f.level !== "HIGH") return f;

    console.log(
      `[riskAnalysisStep] P0-3 risk cap: ${f.id} HIGH → MEDIUM ` +
        `(alignment matchConfidence=${pair.matchConfidence.toFixed(2)} < ${LOW_ALIGNMENT_THRESHOLD})`
    );
    return {
      ...f,
      level: "MEDIUM" as RiskLevel,
      rationale:
        `${f.rationale} (Note: alignment confidence is low (${Math.round(pair.matchConfidence * 100)}%) — manual review recommended.)`,
    };
  };

  const allFindings: RiskFinding[] = [
    ...normalisedDeterministic.map(capFinding),
    ...llmFindings.map(capFinding),
  ].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  console.log(
    `[riskAnalysisStep] Final risks: ${allFindings.length} total ` +
      `(deterministic=${normalisedDeterministic.length} llm=${llmFindings.length})`
  );

  return {
    ...state,
    risks: allFindings,
  };
}
