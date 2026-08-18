import type { Finding } from "../../models/finding.js";
import type { RequirementStatus } from "../../models/requirement-assessment.js";

/**
 * Deterministic requirement-status aggregation (ACT refactor doc §9).
 *
 * The reporting status of a requirement is derived ONLY from its supporting
 * Findings — the synthesis LLM may explain the result but must never silently
 * invent a different authoritative status.
 *
 * Precedence (highest first):
 *   1. conflicting / unresolvable evidence   -> cannot_determine
 *   2. clear legal / control gap             -> missing
 *   3. some elements met, others absent/weak -> partial
 *   4. all required elements supported       -> covered
 *   5. clearly outside scope / applicability -> not_applicable
 *
 * When there is no evidence at all, the requirement cannot be established and
 * resolves to `cannot_determine` (distinct from a positively-found gap).
 */

/** A Finding "positively establishes" the requirement (element present/ok). */
function isSupporting(f: Finding): boolean {
  return f.status === "present";
}

/** A Finding shows a concrete gap (required element absent). */
function isGap(f: Finding): boolean {
  return f.status === "absent_expected";
}

/** A Finding could not be resolved from the document evidence. */
function isIndeterminate(f: Finding): boolean {
  return f.status === "insufficient_evidence";
}

/** A Finding marks the rule/control as not authored / out of coverage. */
function isNotApplicable(f: Finding): boolean {
  return f.status === "not_covered";
}

export function deriveRequirementStatus(findings: Finding[]): RequirementStatus {
  if (findings.length === 0) return "cannot_determine";

  const supporting = findings.filter(isSupporting);
  const gaps = findings.filter(isGap);
  const indeterminate = findings.filter(isIndeterminate);
  const notApplicable = findings.filter(isNotApplicable);

  // 1. Conflicting: at least one element is clearly met AND another clearly
  //    absent, with no way to reconcile at the requirement level.
  if (supporting.length > 0 && gaps.length > 0) {
    return "partial";
  }

  // Pure indeterminate evidence (present nowhere, absent nowhere) — we cannot
  // conclude either way.
  if (
    supporting.length === 0 &&
    gaps.length === 0 &&
    indeterminate.length > 0
  ) {
    return "cannot_determine";
  }

  // 2. Clear gap(s) and nothing supporting -> missing.
  if (gaps.length > 0 && supporting.length === 0) {
    return "missing";
  }

  // 3. Some elements met but weakened by indeterminate evidence -> partial.
  if (supporting.length > 0 && indeterminate.length > 0) {
    return "partial";
  }

  // 4. Everything supporting -> covered.
  if (supporting.length > 0) {
    return "covered";
  }

  // 5. Only not-covered signals remain -> outside authored scope.
  if (notApplicable.length > 0) {
    return "not_applicable";
  }

  return "cannot_determine";
}

/**
 * Build the supporting-finding id set for a requirement. A finding supports a
 * requirement when it is explicitly tagged with `requirementId`.
 */
export function findingsForRequirement(
  requirementId: string,
  findings: Finding[]
): Finding[] {
  return findings.filter((f) => f.requirementId === requirementId);
}
