/**
 * critique-compare.ts — Lightweight post-pipeline validation for the Compare module.
 *
 * Philosophy (mirrors analysis/capabilities/critique/run-critique-lite.ts):
 *   - Pure function — zero LLM calls, zero side effects.
 *   - Validates structural invariants only: referential integrity, required
 *     field presence, cross-collection consistency.
 *   - Returns a typed result that the workflow can log and surface without
 *     aborting the pipeline.
 *
 * Checks performed (in order):
 *   1. alignments    — every AlignedPair has a non-empty alignmentReason,
 *                      valid confidence, and at least one non-null clause ID.
 *   2. differences   — every ClauseDifference references a valid pairId and
 *                      has a non-negative confidence value.
 *   3. risks         — every RiskFinding has a non-empty rationale, a valid
 *                      pairId back-reference, and confidence in [0, 1].
 *   4. summary       — ExecutiveSummary has the required fields with
 *                      non-empty content; keyFindings count is reasonable.
 *   5. cross-checks  — every risk pairId exists in differences; every
 *                      difference pairId exists in alignment.
 */

import type {
  CompareState,
  AlignedPair,
  ClauseDifference,
  RiskFinding,
} from "../models/compare-state.js";
import type { ExecutiveSummary } from "../schemas/executive-summary-schema.js";

// ─── Result types ─────────────────────────────────────────────────────────────

export type CritiqueIssueSeverity = "error" | "warning";

export interface CompareValidationIssue {
  /** Stable identifier scoped to the check category, e.g. "alignment:reason-empty" */
  id: string;
  severity: CritiqueIssueSeverity;
  /** Human-readable description — never contains sensitive content */
  message: string;
  /**
   * Optional reference to the offending item.
   * e.g. pairId, riskId, "summary" — for correlating against state.
   */
  ref?: string;
}

export interface CompareCritiqueResult {
  /** True only when there are zero "error"-severity issues */
  isValid: boolean;
  /** All detected issues across all validation groups */
  issues: CompareValidationIssue[];
  /**
   * Flat list of human-readable messages for state.metadata.validationIssues.
   * Subset of issues — only the ones consumers need to see.
   */
  summaryMessages: string[];
  /** Counts per severity level for quick inspection */
  counts: { errors: number; warnings: number };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function issue(
  id: string,
  severity: CritiqueIssueSeverity,
  message: string,
  ref?: string
): CompareValidationIssue {
  return { id, severity, message, ref };
}

/** Clamp a number and check it is within [0, 1]. */
function isValidConfidence(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/** Check a string is non-null, non-undefined, and non-whitespace. */
function isNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ─── Individual validators ────────────────────────────────────────────────────

function validateAlignments(
  pairs: AlignedPair[],
  issues: CompareValidationIssue[]
): void {
  if (pairs.length === 0) {
    issues.push(
      issue(
        "alignment:empty",
        "warning",
        "Alignment array is empty — no clause pairs were produced. " +
          "Downstream risk analysis may be incomplete."
      )
    );
    return;
  }

  const seenIds = new Set<string>();

  for (const pair of pairs) {
    // Duplicate pair IDs
    if (seenIds.has(pair.id)) {
      issues.push(
        issue(
          "alignment:duplicate-id",
          "error",
          `Duplicate AlignedPair id "${pair.id}".`,
          pair.id
        )
      );
    }
    seenIds.add(pair.id);

    // At least one clause side must be non-null
    if (pair.clauseAId === null && pair.clauseBId === null) {
      issues.push(
        issue(
          "alignment:both-null",
          "error",
          `AlignedPair "${pair.id}" has null clauseAId AND null clauseBId — ` +
            "a pair must reference at least one clause.",
          pair.id
        )
      );
    }

    // alignmentReason must be present and non-empty
    if (!isNonEmpty(pair.alignmentReason)) {
      issues.push(
        issue(
          "alignment:reason-empty",
          "warning",
          `AlignedPair "${pair.id}" has an empty alignmentReason. ` +
            "Every pair should explain why the match was made.",
          pair.id
        )
      );
    }

    // Confidence must be a valid number in [0, 1]
    if (!isValidConfidence(pair.matchConfidence)) {
      issues.push(
        issue(
          "alignment:confidence-invalid",
          "error",
          `AlignedPair "${pair.id}" has an invalid matchConfidence ` +
            `(${pair.matchConfidence}). Expected a number in [0, 1].`,
          pair.id
        )
      );
    }
  }
}

function validateDifferences(
  differences: ClauseDifference[],
  alignedPairIds: Set<string>,
  issues: CompareValidationIssue[]
): void {
  if (differences.length === 0) {
    // Zero differences is valid (e.g. identical documents) — only warn when
    // there are alignment pairs that should have produced at least some output.
    if (alignedPairIds.size > 0) {
      issues.push(
        issue(
          "diff:empty",
          "warning",
          "No differences were produced despite alignment pairs being present. " +
            "All clauses may be identical, which is valid but unusual."
        )
      );
    }
    return;
  }

  const seenPairRefs = new Set<string>();

  for (const diff of differences) {
    // pairId must reference a real AlignedPair
    if (!alignedPairIds.has(diff.pairId)) {
      issues.push(
        issue(
          "diff:invalid-pair-ref",
          "error",
          `ClauseDifference references pairId "${diff.pairId}" which does not ` +
            "exist in state.alignment.",
          diff.pairId
        )
      );
    }

    // Each pairId should appear at most once in differences
    if (seenPairRefs.has(diff.pairId)) {
      issues.push(
        issue(
          "diff:duplicate-pair-ref",
          "warning",
          `pairId "${diff.pairId}" appears more than once in differences. ` +
            "Each aligned pair should produce at most one difference entry.",
          diff.pairId
        )
      );
    }
    seenPairRefs.add(diff.pairId);

    // Confidence must be valid
    if (!isValidConfidence(diff.confidence)) {
      issues.push(
        issue(
          "diff:confidence-invalid",
          "error",
          `ClauseDifference for pairId "${diff.pairId}" has an invalid confidence ` +
            `(${diff.confidence}). Expected a number in [0, 1].`,
          diff.pairId
        )
      );
    }

    // MODIFIED_* classifications should have a non-empty semanticSummary
    if (
      (diff.classification === "MODIFIED_BROADER" ||
        diff.classification === "MODIFIED_NARROWER") &&
      !isNonEmpty(diff.semanticSummary)
    ) {
      issues.push(
        issue(
          "diff:summary-missing",
          "warning",
          `ClauseDifference for pairId "${diff.pairId}" is classified as ` +
            `${diff.classification} but has an empty semanticSummary. ` +
            "Material changes should include a factual description.",
          diff.pairId
        )
      );
    }
  }
}

function validateRisks(
  risks: RiskFinding[],
  diffPairIds: Set<string>,
  issues: CompareValidationIssue[]
): void {
  if (risks.length === 0) {
    // Zero risks is valid — not every comparison has risk findings.
    return;
  }

  const seenIds = new Set<string>();

  for (const risk of risks) {
    // Duplicate risk IDs
    if (seenIds.has(risk.id)) {
      issues.push(
        issue(
          "risk:duplicate-id",
          "error",
          `Duplicate RiskFinding id "${risk.id}".`,
          risk.id
        )
      );
    }
    seenIds.add(risk.id);

    // pairId must reference a real ClauseDifference
    if (diffPairIds.size > 0 && !diffPairIds.has(risk.pairId)) {
      issues.push(
        issue(
          "risk:invalid-pair-ref",
          "error",
          `RiskFinding "${risk.id}" references pairId "${risk.pairId}" which ` +
            "does not exist in state.differences.",
          risk.id
        )
      );
    }

    // rationale must be non-empty
    if (!isNonEmpty(risk.rationale)) {
      issues.push(
        issue(
          "risk:rationale-empty",
          "error",
          `RiskFinding "${risk.id}" has an empty rationale. ` +
            "Every risk finding must explain the exposure.",
          risk.id
        )
      );
    }

    // Confidence must be valid
    if (!isValidConfidence(risk.confidence)) {
      issues.push(
        issue(
          "risk:confidence-invalid",
          "error",
          `RiskFinding "${risk.id}" has an invalid confidence ` +
            `(${risk.confidence}). Expected a number in [0, 1].`,
          risk.id
        )
      );
    }
  }
}

function validateSummary(
  summary: ExecutiveSummary | undefined,
  hasRisks: boolean,
  issues: CompareValidationIssue[]
): void {
  if (!summary) {
    if (hasRisks) {
      // A missing summary when risks are present is unusual — warn so it surfaces.
      issues.push(
        issue(
          "summary:missing",
          "warning",
          "ExecutiveSummary is absent but risk findings are present. " +
            "The summary step may not have completed."
        )
      );
    }
    return;
  }

  // overallAssessment must be non-empty
  if (!isNonEmpty(summary.overallAssessment)) {
    issues.push(
      issue(
        "summary:assessment-empty",
        "error",
        "ExecutiveSummary.overallAssessment is empty.",
        "summary"
      )
    );
  }

  // recommendation must be non-empty
  if (!isNonEmpty(summary.recommendation)) {
    issues.push(
      issue(
        "summary:recommendation-empty",
        "error",
        "ExecutiveSummary.recommendation is empty.",
        "summary"
      )
    );
  }

  // keyFindings must have at least one entry
  if (!Array.isArray(summary.keyFindings) || summary.keyFindings.length === 0) {
    issues.push(
      issue(
        "summary:key-findings-empty",
        "warning",
        "ExecutiveSummary.keyFindings is empty. At least one key finding is expected.",
        "summary"
      )
    );
  }

  // Individual keyFindings must be non-empty strings
  if (Array.isArray(summary.keyFindings)) {
    for (let i = 0; i < summary.keyFindings.length; i++) {
      if (!isNonEmpty(summary.keyFindings[i])) {
        issues.push(
          issue(
            "summary:key-finding-blank",
            "warning",
            `ExecutiveSummary.keyFindings[${i}] is blank or not a string.`,
            "summary"
          )
        );
      }
    }
  }

  // If there are HIGH risks, criticalRedlines should not be empty
  if (
    hasRisks &&
    Array.isArray(summary.criticalRedlines) &&
    summary.criticalRedlines.length === 0
  ) {
    // Only a warning — the LLM may legitimately decide no redlines are needed
    // even with HIGH findings if they are already being negotiated.
    issues.push(
      issue(
        "summary:redlines-empty",
        "warning",
        "Risk findings are present but criticalRedlines is empty. " +
          "Consider whether any HIGH-severity findings warrant a redline.",
        "summary"
      )
    );
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * validateCompareOutput — pure, synchronous post-pipeline critique.
 *
 * Accepts a fully-executed CompareState and returns a structured validation
 * report. No LLM calls. No mutations. Safe to call multiple times.
 *
 * @param state - The CompareState after all pipeline steps have completed.
 * @returns     CompareCritiqueResult with issues and a validity flag.
 */
export function validateCompareOutput(state: CompareState): CompareCritiqueResult {
  const issues: CompareValidationIssue[] = [];

  // ── 1. Alignments ────────────────────────────────────────────────────────
  const alignment = state.alignment ?? [];
  validateAlignments(alignment, issues);
  const alignedPairIds = new Set(alignment.map((p) => p.id));

  // ── 2. Differences ────────────────────────────────────────────────────────
  const differences = state.differences ?? [];
  validateDifferences(differences, alignedPairIds, issues);
  const diffPairIds = new Set(differences.map((d) => d.pairId));

  // ── 3. Risks ──────────────────────────────────────────────────────────────
  const risks = state.risks ?? [];
  validateRisks(risks, diffPairIds, issues);

  // ── 4. Summary ────────────────────────────────────────────────────────────
  const hasHighRisks = risks.some((r) => r.level === "HIGH");
  validateSummary(state.executiveSummary, hasHighRisks, issues);

  // ── 5. Cross-collection counts sanity check ───────────────────────────────
  // Every AlignedPair should have a corresponding ClauseDifference.
  // Missing entries are a warning (not an error) because UNCHANGED clauses
  // are sometimes legitimately skipped in summarised outputs.
  const coveredPairs = new Set(differences.map((d) => d.pairId));
  const uncoveredPairCount = alignment.filter(
    (p) => !coveredPairs.has(p.id)
  ).length;

  if (uncoveredPairCount > 0 && alignment.length > 0) {
    const ratio = uncoveredPairCount / alignment.length;
    // Only surface as warning when more than 20% of pairs are uncovered
    if (ratio > 0.2) {
      issues.push(
        issue(
          "cross:pairs-without-diff",
          "warning",
          `${uncoveredPairCount} of ${alignment.length} AlignedPair(s) ` +
            `(${Math.round(ratio * 100)}%) have no corresponding ClauseDifference. ` +
            "This may be expected for identical clauses, but a high ratio can indicate " +
            "an incomplete diff-detect run.",
        )
      );
    }
  }

  // ── Derive summary ────────────────────────────────────────────────────────
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  const summaryMessages = issues
    .filter((i) => i.severity === "error")
    .map((i) => i.message);

  // Always include warnings in summary messages too, for full observability
  const warningMessages = issues
    .filter((i) => i.severity === "warning")
    .map((i) => `[warn] ${i.message}`);

  return {
    isValid: errorCount === 0,
    issues,
    summaryMessages: [...summaryMessages, ...warningMessages],
    counts: { errors: errorCount, warnings: warningCount },
  };
}
