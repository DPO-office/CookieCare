/**
 * executive-summary.ts — Step 6 of the Compare pipeline
 *
 * Responsibility: aggregate the structured outputs of Phases 3–4 into a concise,
 * business-facing executive summary and populate CompareState.executiveSummary.
 *
 * This step is deliberately the only consumer of CompareState.differences and
 * CompareState.risks — it never touches raw document text, parses contracts,
 * or performs new analysis. Pipeline separation is maintained.
 *
 * Strategy:
 *   1. Pre-compute statistics deterministically (counts, breakdowns).
 *   2. Single LLM call via Gemini + COMPARE_SUMMARY task.
 *   3. Zod-validate the response; apply structured fallback on failure.
 *
 * There is intentionally no deterministic-first split here (unlike alignment,
 * diff, and risk) because the summary is a pure narration task — there is
 * nothing a regex rule can produce that matches the quality of a single
 * well-structured LLM call over all findings simultaneously.
 */

import { CompareState } from "../models/compare-state.js";
import { getSkill } from "../utils/knowledge-loader.js";
import {
  systemInstruction,
  buildExecutiveSummaryPrompt,
  computeStats,
} from "../prompts/executive-summary-prompt.js";
import {
  ExecutiveSummarySchema,
  EXECUTIVE_SUMMARY_JSON_SCHEMA,
  ExecutiveSummary,
} from "../schemas/executive-summary-schema.js";
import { executeJsonCompletionWithMeta } from "../../drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../../drafting/config/model-specs.js";
import { pipelineMetrics } from "../utils/pipeline-metrics.js";

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * Produce a safe, deterministic fallback summary when the LLM call fails or
 * returns an invalid schema.
 *
 * The fallback is grounded entirely in the computed statistics — it never
 * invents content, and it is honest about the failure.
 */
function buildFallbackSummary(
  state: CompareState,
  titleA: string,
  titleB: string
): ExecutiveSummary {
  const diffs = state.differences ?? [];
  const risks = state.risks ?? [];

  const highCount = risks.filter((r) => r.level === "HIGH").length;
  const mediumCount = risks.filter((r) => r.level === "MEDIUM").length;
  const removedCount = diffs.filter((d) => d.classification === "REMOVED").length;
  const addedCount = diffs.filter((d) => d.classification === "ADDED").length;
  const modifiedCount = diffs.filter(
    (d) =>
      d.classification === "MODIFIED_BROADER" ||
      d.classification === "MODIFIED_NARROWER"
  ).length;

  const overallRisk: "LOW" | "MEDIUM" | "HIGH" =
    highCount > 0 ? "HIGH" : mediumCount > 0 ? "MEDIUM" : "LOW";

  const keyFindings: string[] = [];
  if (highCount > 0)
    keyFindings.push(`${highCount} HIGH-severity risk finding(s) require immediate attention.`);
  if (mediumCount > 0)
    keyFindings.push(`${mediumCount} MEDIUM-severity finding(s) should be reviewed before signing.`);
  if (removedCount > 0)
    keyFindings.push(`${removedCount} clause(s) present in the original were removed in the revision.`);
  if (addedCount > 0)
    keyFindings.push(`${addedCount} new clause(s) were introduced in the revised agreement.`);
  if (modifiedCount > 0)
    keyFindings.push(`${modifiedCount} clause(s) were materially modified.`);
  if (keyFindings.length === 0)
    keyFindings.push("No material differences detected between the two agreements.");

  const recommendation =
    overallRisk === "HIGH"
      ? "Do not sign without legal review of the high-severity findings."
      : overallRisk === "MEDIUM"
      ? "Approve subject to resolving the medium-severity findings identified above."
      : "Approve with no changes required.";

  return {
    overallAssessment:
      `Automated narrative generation was unavailable for this comparison of ` +
      `${titleA} and ${titleB}. ` +
      `The pipeline detected ${diffs.length} clause pair(s) with ` +
      `${highCount} HIGH, ${mediumCount} MEDIUM, and ` +
      `${risks.filter((r) => r.level === "LOW").length} LOW risk finding(s). ` +
      `Manual review of the risk findings below is recommended.`,
    overallRisk,
    keyFindings: keyFindings.slice(0, 5),
    criticalRedlines: risks
      .filter((r) => r.level === "HIGH")
      .slice(0, 3)
      .map((r) => `${r.category}: ${r.rationale}`),
    missingProtections: diffs
      .filter((d) => d.classification === "REMOVED" && d.semanticSummary)
      .slice(0, 3)
      .map((d) => d.semanticSummary),
    negotiationPriorities: risks
      .filter((r) => r.level === "HIGH" || r.level === "MEDIUM")
      .slice(0, 4)
      .map((r) => `${r.category}: ${r.rationale}`),
    recommendation,
  };
}

// ─── Item 3: unrelated-document guard ────────────────────────────────────────

interface AlignmentStatsSnapshot {
  match: number;
  moved: number;
  added: number;
  removed: number;
  split: number;
  merged: number;
  uncertain: number;
}

/** Minimum total alignment pairs before the guard is evaluated — a handful of
 *  UNCERTAIN pairs on a tiny document is noise, not a signal. */
const MISMATCH_MIN_PAIRS = 6;

/** Above this fraction of UNCERTAIN pairs, correspondence is dominated by "could not match". */
const MISMATCH_UNCERTAIN_RATIO = 0.8;

/** Below this fraction of confident MATCH/MOVED pairs, there is almost no confirmed structural overlap. */
const MISMATCH_CONFIDENT_RATIO = 0.05;

/**
 * Conservative guard built entirely from the alignment pipeline's own
 * relationship counts (state.metadata.alignmentStats, populated by
 * clauseAlignStep) — never re-derives correspondence itself.
 *
 * Fires only when BOTH confident structural overlap is almost absent AND
 * UNCERTAIN pairs overwhelmingly dominate. A heavily revised version of the
 * same agreement still accumulates a meaningful mix of confirmed
 * ADDED/REMOVED/MERGED evidence even when MATCH/MOVED is sparse — the
 * validated Mastercard DPA case (MATCH 4, MOVED 2, ADDED 11, REMOVED 68,
 * MERGED 10, UNCERTAIN 94) has confident ratio ~3% but uncertain ratio only
 * ~50%, and must NOT trigger this guard. Two unrelated documents instead
 * produce almost nothing BUT UNCERTAIN, because there is no structural basis
 * for even a confirmed ADDED/REMOVED call.
 */
function detectLikelyUnrelatedDocuments(
  stats: AlignmentStatsSnapshot | undefined
): { likely: boolean; confidentPct: number; uncertainPct: number; total: number } {
  if (!stats) return { likely: false, confidentPct: 0, uncertainPct: 0, total: 0 };
  const total =
    stats.match + stats.moved + stats.added + stats.removed +
    stats.split + stats.merged + stats.uncertain;
  if (total < MISMATCH_MIN_PAIRS) {
    return { likely: false, confidentPct: 0, uncertainPct: 0, total };
  }
  const confident = stats.match + stats.moved;
  const confidentRatio = confident / total;
  const uncertainRatio = stats.uncertain / total;
  const likely =
    confidentRatio < MISMATCH_CONFIDENT_RATIO && uncertainRatio >= MISMATCH_UNCERTAIN_RATIO;
  return {
    likely,
    confidentPct: Math.round(confidentRatio * 100),
    uncertainPct: Math.round(uncertainRatio * 100),
    total,
  };
}

/**
 * Deterministic, conservative summary returned instead of calling the LLM
 * when detectLikelyUnrelatedDocuments fires. Grounded entirely in the
 * computed ratios — never invents findings.
 */
function buildMismatchSummary(
  titleA: string,
  titleB: string,
  confidentPct: number,
  uncertainPct: number
): ExecutiveSummary {
  return {
    overallAssessment:
      `This comparison shows very low structural correspondence between ${titleA} and ${titleB}: ` +
      `only ${confidentPct}% of clause pairs could be confidently matched, and ${uncertainPct}% could ` +
      `not be matched at all. This pattern is more consistent with two unrelated documents than two ` +
      `versions of the same agreement. Treat any Added/Removed/Modified findings below with caution ` +
      `until the document relationship is confirmed.`,
    overallRisk: "MEDIUM",
    keyFindings: [
      `Low-confidence comparison: only ${confidentPct}% of clauses could be confidently matched between the two documents, and ${uncertainPct}% could not be matched at all.`,
    ],
    criticalRedlines: [],
    missingProtections: [],
    negotiationPriorities: [
      "Confirm both documents are versions of the same underlying agreement before relying on this comparison as a redline.",
    ],
    recommendation:
      "Verify these documents are related before treating this as a reliable redline. If confirmed related, review individual findings with extra scrutiny.",
  };
}

// ─── Main step ────────────────────────────────────────────────────────────────

/**
 * executiveSummaryStep — Step 6 of the compare pipeline.
 *
 * Requires:
 *   - state.differences to be populated (diffDetectStep must have run)
 *   - state.risks to be populated (riskAnalysisStep must have run)
 *   - state.parsed for document filenames (optional — graceful fallback)
 *
 * Returns an enriched CompareState with state.executiveSummary populated.
 */
export async function executiveSummaryStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.differences) {
    throw new Error(
      "[executiveSummaryStep] state.differences is null — diffDetectStep must run before executive summary."
    );
  }
  if (!state.risks) {
    throw new Error(
      "[executiveSummaryStep] state.risks is null — riskAnalysisStep must run before executive summary."
    );
  }

  const { differences, risks } = state;

  // Derive document display names from metadata or parsed filenames
  const titleA =
    (state.metadata?.title as string | undefined) ??
    state.parsed?.metaA.fileName ??
    "Agreement A";
  const titleB = state.parsed?.metaB.fileName ?? "Agreement B";

  // ── Pre-compute statistics deterministically ────────────────────────────
  const stats = computeStats(differences, risks);

  console.log(
    `[executiveSummaryStep] Stats: ` +
      `pairs=${stats.totalPairs} ` +
      `material=${stats.added + stats.removed + stats.modifiedBroader + stats.modifiedNarrower} ` +
      `risks=${stats.totalRiskFindings} (H=${stats.riskHigh} M=${stats.riskMedium} L=${stats.riskLow})`
  );

  // ── Item 3: unrelated-document guard ────────────────────────────────────
  // Checked before the clean-comparison exit and before the LLM call — a
  // document-relationship problem should not be masked by either path.
  const alignmentStats = state.metadata?.alignmentStats as AlignmentStatsSnapshot | undefined;
  const mismatch = detectLikelyUnrelatedDocuments(alignmentStats);
  if (mismatch.likely) {
    console.log(
      `[executiveSummaryStep] Unrelated-document guard fired — ` +
        `confident=${mismatch.confidentPct}% uncertain=${mismatch.uncertainPct}% of ${mismatch.total} pair(s). ` +
        `Returning a conservative mismatch summary instead of a standard redline.`
    );
    return {
      ...state,
      executiveSummary: buildMismatchSummary(titleA, titleB, mismatch.confidentPct, mismatch.uncertainPct),
      metadata: {
        ...state.metadata,
        documentRelationshipWarning: true,
      },
    };
  }

  // ── Early-exit for completely clean comparisons ────────────────────────
  // When every difference is UNCHANGED or NEUTRAL_REPHRASE and there are
  // no risk findings, skip the LLM and return a deterministic clean summary.
  const materialCount =
    stats.added +
    stats.removed +
    stats.modifiedBroader +
    stats.modifiedNarrower;

  if (materialCount === 0 && stats.totalRiskFindings === 0) {
    console.log(
      "[executiveSummaryStep] No material differences or risk findings — " +
        "returning deterministic clean summary."
    );
    const cleanSummary: ExecutiveSummary = {
      overallAssessment:
        `The revision of ${titleA} contains no material legal or commercial changes. ` +
        `All clause differences are either identical or cosmetic rephrasing without ` +
        `legal significance.`,
      overallRisk: "LOW",
      keyFindings: ["No material differences detected between the two agreements."],
      criticalRedlines: [],
      missingProtections: [],
      negotiationPriorities: [],
      recommendation: "Approve with no changes required.",
    };
    return { ...state, executiveSummary: cleanSummary };
  }

  // ── LLM call ─────────────────────────────────────────────────────────────
  const skill = getSkill("executive-summary");
  const fullSystemInstruction = `${skill}\n\n---\n\n${systemInstruction}`;
  const prompt = buildExecutiveSummaryPrompt(differences, risks, stats, titleA, titleB);

  console.log(
    `[executiveSummaryStep] Calling LLM for narrative summary ` +
      `(${materialCount} material diffs, ${stats.totalRiskFindings} risks)`
  );

  let rawSummary: ExecutiveSummary;

  try {
    const { result, usage } = await executeJsonCompletionWithMeta<ExecutiveSummary>(
      prompt,
      fullSystemInstruction,
      EXECUTIVE_SUMMARY_JSON_SCHEMA,
      LLMTask.COMPARE_SUMMARY,
      LLMProvider.GEMINI
    );
    rawSummary = result;
    pipelineMetrics.record("executiveSummary", {
      llmRequests: 1,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      llmItems: 1,
    });
  } catch (llmErr: any) {
    console.warn(
      `[executiveSummaryStep] LLM call failed: ${llmErr.message} — applying fallback.`
    );
    pipelineMetrics.record("executiveSummary", {
      llmRequests: 1,
      fallbackItems: 1,
    });
    return {
      ...state,
      executiveSummary: buildFallbackSummary(state, titleA, titleB),
    };
  }

  // ── Zod validation ────────────────────────────────────────────────────────
  const parsed = ExecutiveSummarySchema.safeParse(rawSummary);
  if (!parsed.success) {
    console.warn(
      `[executiveSummaryStep] Zod validation failed — applying fallback. ` +
        `Errors: ${JSON.stringify(parsed.error.issues)}`
    );
    return {
      ...state,
      executiveSummary: buildFallbackSummary(state, titleA, titleB),
    };
  }

  console.log(
    `[executiveSummaryStep] Summary generated — ` +
      `overallRisk=${parsed.data.overallRisk} ` +
      `keyFindings=${parsed.data.keyFindings.length} ` +
      `redlines=${parsed.data.criticalRedlines.length} ` +
      `priorities=${parsed.data.negotiationPriorities.length}`
  );

  return {
    ...state,
    executiveSummary: parsed.data,
  };
}
