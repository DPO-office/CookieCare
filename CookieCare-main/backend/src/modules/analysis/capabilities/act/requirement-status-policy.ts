import type { Finding } from "../../models/finding.js";
import type { RequirementStatus } from "../../models/requirement-assessment.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import { findingsLinkedToRequirement } from "../../shared/article-linkage.js";

/**
 * Deterministic requirement-status aggregation (ACT refactor doc §9).
 *
 * The reporting status of a requirement is derived ONLY from its supporting
 * Findings — the synthesis LLM may explain the result but must never silently
 * invent a different authoritative status.
 *
 * Precedence (highest first):
 *   1. conflicting / unresolvable evidence   -> cannot_determine
 *   2. clear legal / control gap             -> gap
 *   3. some elements met, others absent/weak -> conditional
 *   4. all required elements supported       -> adequate (strong when the quote is substantial)
 *   5. clearly outside scope / applicability -> not_applicable
 *
 * Legacy aliases: covered=adequate, partial=conditional, missing=gap.
 *
 * When there is no evidence at all, the requirement cannot be established and
 * resolves to `cannot_determine` (distinct from a positively-found gap).
 */

/** A Finding "positively establishes" the requirement (element present/ok). */
function isSupporting(f: Finding): boolean {
  return f.status === "present";
}

/** A Finding shows a concrete gap (required element absent or operationally incomplete). */
function isGap(f: Finding): boolean {
  if (isReferencedElsewhereClaim(f)) return false;
  if (f.status === "absent_expected") return true;
  // Named matrix rows that still carry an implementationGap are partial, not covered.
  if (f.gap && f.matrixAddressing === "named") return true;
  if (
    f.kind === "risk" &&
    f.status === "present" &&
    (f.severity === "medium" || f.severity === "high")
  ) {
    return true;
  }
  if (f.matrixAddressing === "generic" || f.matrixAddressing === "absent") {
    return Boolean(f.gap);
  }
  return false;
}

/**
 * Gap language that actually points to an annex/schedule/other document is
 * indeterminate, not a positive "missing from this agreement" finding.
 */
const REFERENCED_ELSEWHERE_CLAIM_RE =
  /\b(referenced (?:in|to|elsewhere)|incorporated by reference|see (?:the )?(?:annex|schedule|appendix|exhibit|sow|statement of work)|cannot (?:be )?(?:fully )?verif(?:y|ied)|substance (?:is|lives) (?:in|elsewhere))\b/i;

function isReferencedElsewhereClaim(f: Finding): boolean {
  return REFERENCED_ELSEWHERE_CLAIM_RE.test(`${f.claim} ${f.gap ?? ""}`);
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
  const indeterminate = findings.filter(
    (f) => isIndeterminate(f) || isReferencedElsewhereClaim(f)
  );
  const notApplicable = findings.filter(isNotApplicable);

  if (supporting.length > 0 && gaps.length > 0) {
    return "conditional";
  }

  if (
    supporting.length === 0 &&
    gaps.length === 0 &&
    indeterminate.length > 0
  ) {
    return "cannot_determine";
  }

  if (gaps.length > 0 && supporting.length === 0) {
    return "gap";
  }

  if (supporting.length > 0 && indeterminate.length > 0) {
    return "conditional";
  }

  if (supporting.length > 0) {
    const quoteLen = Math.max(
      0,
      ...supporting.map((f) => f.evidence[0]?.quotedText?.trim().length ?? 0)
    );
    return quoteLen >= 80 ? "strong" : "adequate";
  }

  if (notApplicable.length > 0) {
    return "not_applicable";
  }

  return "cannot_determine";
}

/**
 * Prefer explicit `Finding.requirementId` stamps, then join same-article
 * matrix/rule/risk findings so Named matrix rows don't hide operational gaps.
 */
export function findingsForRequirement(
  requirementId: string,
  findings: Finding[],
  state?: AnalysisState
): Finding[] {
  if (state) return findingsLinkedToRequirement(requirementId, findings, state);
  return findings.filter((f) => f.requirementId === requirementId);
}
