/**
 * executive-summary-prompt.ts
 *
 * System instruction and user-turn prompt builder for the Executive Summary step.
 * Mirrors the structure established in alignment-prompt.ts, difference-prompt.ts,
 * and risk-prompt.ts:
 *   - systemInstruction: constant per-step directive
 *   - buildExecutiveSummaryPrompt(): builder that receives the pre-computed
 *     statistics and structured inputs and returns the user-turn prompt string
 *
 * The AI Skill (executive-summary.md) is loaded by the step and prepended
 * to systemInstruction at call time — knowledge stays separate from directives.
 */

import type {
  ClauseDifference,
  RiskFinding,
  DiffClassification,
  RiskLevel,
  RiskCategory,
} from "../models/compare-state.js";

// ─── System instruction ───────────────────────────────────────────────────────

export const systemInstruction = `
You are generating an executive summary for a legal contract comparison.

Return ONLY a raw JSON object (no markdown fences) with exactly these fields:
{
  "overallAssessment": string (2–4 sentences),
  "overallRisk": "LOW" | "MEDIUM" | "HIGH",
  "keyFindings": string[] (3–5 entries, ≤25 words each, HIGH first),
  "criticalRedlines": string[] ([] if no HIGH/MEDIUM findings warrant redlines),
  "missingProtections": string[] ([] if no significant protections removed),
  "negotiationPriorities": string[] (1–4 entries, most critical first),
  "recommendation": string (one sentence: Approve / Approve subject to / Do not sign)
}

Rules: ground every statement in the provided findings; do not mention UNCHANGED or NEUTRAL_REPHRASE items; do not hallucinate.
`.trim();

// ─── Statistics builder ───────────────────────────────────────────────────────

/**
 * Pre-computed statistics derived deterministically from pipeline outputs.
 * Passed to the prompt so the LLM narrates facts rather than counts.
 */
export interface ComparisonStats {
  totalPairs: number;
  unchanged: number;
  neutralRephrase: number;
  added: number;
  removed: number;
  modifiedBroader: number;
  modifiedNarrower: number;
  /** Differences that could not be reliably classified (detectionMethod: "fallback") */
  fallbackCount: number;
  riskHigh: number;
  riskMedium: number;
  riskLow: number;
  totalRiskFindings: number;
}

/**
 * Compute statistics from pipeline outputs deterministically.
 * The LLM receives these numbers as ground truth — it should not recount.
 */
export function computeStats(
  differences: ClauseDifference[],
  risks: RiskFinding[]
): ComparisonStats {
  const count = (cls: DiffClassification) =>
    differences.filter((d) => d.classification === cls).length;

  const riskCount = (level: RiskLevel) =>
    risks.filter((r) => r.level === level).length;

  return {
    totalPairs: differences.length,
    unchanged: count("UNCHANGED"),
    neutralRephrase: count("NEUTRAL_REPHRASE"),
    added: count("ADDED"),
    removed: count("REMOVED"),
    modifiedBroader: count("MODIFIED_BROADER"),
    modifiedNarrower: count("MODIFIED_NARROWER"),
    fallbackCount: differences.filter((d) => d.detectionMethod === "fallback")
      .length,
    riskHigh: riskCount("HIGH"),
    riskMedium: riskCount("MEDIUM"),
    riskLow: riskCount("LOW"),
    totalRiskFindings: risks.length,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of risk findings passed to the LLM.
 * We select the most material (HIGH first, then MEDIUM) and deduplicate by
 * category so the LLM is not flooded with 70+ near-duplicate findings.
 * The statistics block already tells it exactly how many there were in total.
 */
const MAX_RISK_FINDINGS_FOR_PROMPT = 10;

// ─── Finding selector ─────────────────────────────────────────────────────────

/**
 * Select the most material risk findings to send to the LLM.
 *
 * Strategy:
 *   1. Sort HIGH → MEDIUM → LOW, then by confidence descending.
 *   2. De-duplicate: keep only the first (highest-confidence) finding per category.
 *   3. Cap at MAX_RISK_FINDINGS_FOR_PROMPT.
 *
 * The stats block tells the LLM the full counts so it can still produce accurate
 * overallRisk and general statements — it just won't enumerate 70+ items.
 */
export function selectMaterialFindings(risks: RiskFinding[]): RiskFinding[] {
  const levelOrder: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  const sorted = [...risks].sort((a, b) => {
    const lvl = levelOrder[a.level] - levelOrder[b.level];
    if (lvl !== 0) return lvl;
    return b.confidence - a.confidence;
  });

  // De-duplicate: one finding per category (highest confidence wins per category)
  const seenCategories = new Set<RiskCategory>();
  const deduped: RiskFinding[] = [];
  for (const r of sorted) {
    if (!seenCategories.has(r.category)) {
      seenCategories.add(r.category);
      deduped.push(r);
    } else if (r.level === "HIGH") {
      // Always include HIGH findings even if category already seen — they're critical
      deduped.push(r);
    }
  }

  return deduped.slice(0, MAX_RISK_FINDINGS_FOR_PROMPT);
}

// ─── Serialisable risk/diff input shapes ─────────────────────────────────────

interface PromptRisk {
  id: string;
  level: RiskLevel;
  category: RiskCategory;
  rationale: string;
}

interface PromptDiff {
  pairId: string;
  classification: DiffClassification;
  semanticSummary: string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the user-turn prompt for the executive summary step.
 *
 * Only the most material findings (Top-10, de-duplicated by category) are sent
 * to the LLM. The statistics block provides full counts so the model can
 * accurately narrate the overall picture without needing to enumerate everything.
 */
export function buildExecutiveSummaryPrompt(
  differences: ClauseDifference[],
  risks: RiskFinding[],
  stats: ComparisonStats,
  titleA: string,
  titleB: string
): string {
  // Filter to material differences only (exclude UNCHANGED and NEUTRAL_REPHRASE)
  const materialDiffs: PromptDiff[] = differences
    .filter(
      (d) =>
        d.classification !== "UNCHANGED" &&
        d.classification !== "NEUTRAL_REPHRASE" &&
        d.detectionMethod !== "fallback"
    )
    .map((d) => ({
      pairId: d.pairId,
      classification: d.classification,
      semanticSummary: d.semanticSummary,
    }));

  // Select only the most material findings — not all 71+
  const selectedRisks = selectMaterialFindings(risks);
  const orderedRisks: PromptRisk[] = selectedRisks.map((r) => ({
    id: r.id,
    level: r.level,
    category: r.category,
    rationale: r.rationale,
  }));

  const statsBlock =
    `STATISTICS: ${JSON.stringify(titleA)} vs ${JSON.stringify(titleB)}\n` +
    `pairs=${stats.totalPairs} unchanged=${stats.unchanged} rephrase=${stats.neutralRephrase} ` +
    `added=${stats.added} removed=${stats.removed} broader=${stats.modifiedBroader} narrower=${stats.modifiedNarrower} fallback=${stats.fallbackCount}\n` +
    `risks: HIGH=${stats.riskHigh} MEDIUM=${stats.riskMedium} LOW=${stats.riskLow} total=${stats.totalRiskFindings}`;

  const riskBlock =
    orderedRisks.length > 0
      ? `\nTOP RISK FINDINGS (${orderedRisks.length} most material shown; ${stats.totalRiskFindings} total):\n` +
        orderedRisks
          .map(
            (r, i) =>
              `[${i + 1}] ${r.level} ${r.category}: ${r.rationale}`
          )
          .join("\n")
      : "\nRISK FINDINGS: none";

  const diffBlock =
    materialDiffs.length > 0
      ? `\nMATERIAL DIFFERENCES (${materialDiffs.length}):\n` +
        materialDiffs
          .map(
            (d, i) =>
              `[${i + 1}] ${d.classification}${d.semanticSummary ? ": " + d.semanticSummary : ""}`
          )
          .join("\n")
      : "\nMATERIAL DIFFERENCES: none";

  const fallbackNote =
    stats.fallbackCount > 0
      ? `\nNOTE: ${stats.fallbackCount} pair(s) have uncertain alignment or unclassified semantics. These are NOT confirmed additions, deletions, or material modifications. Mention the review-needed count in overallAssessment and add manual review of uncertain pairs to negotiationPriorities. Do not describe them as removed or added clauses.`
      : "";

  return `${statsBlock}\n${riskBlock}\n${diffBlock}${fallbackNote}\n\nGenerate the executive summary JSON now.`;
}
