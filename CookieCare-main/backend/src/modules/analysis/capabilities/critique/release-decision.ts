import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AlignmentReport,
  DeepCritiqueResult,
  FixItem,
  PlaceholderReport,
  ReleaseDecision,
  ReleaseReason,
  ReleaseVerdict,
  RequirementCoverageSummary,
} from "../../models/critique-report.js";
import { isBudgetExceeded } from "../../pac/policy.js";

export interface ComposeReleaseDecisionInput {
  state: AnalysisState;
  coverage: RequirementCoverageSummary;
  alignment: AlignmentReport;
  placeholder: PlaceholderReport;
  structurallyValid: boolean;
  executionComplete: boolean;
  fixPlan: FixItem[];
  skeletonMismatch: boolean;
  deepResults?: DeepCritiqueResult[];
}

function hasUnsupportedFindings(deepResults?: DeepCritiqueResult[]): boolean {
  return (
    deepResults?.some(
      (r) =>
        r.verdict === "unsupported" || r.verdict === "partially_supported"
    ) ?? false
  );
}

/**
 * Alignment issues that make the *shown* output actively wrong/unsafe (e.g.
 * scope creep — we analysed material outside the user's explicit scope). These
 * force a hard withhold even when substantive output exists. Issues whose
 * declared action is `replan` (missing package, wrong execution shape) are NOT
 * treated as hard blocks: they are recoverable coverage gaps that should either
 * drive a replan/targeted redo (when turns remain) or degrade to release_with_limitations.
 */
function hasBlockingAlignment(alignment: AlignmentReport): boolean {
  return alignment.issues.some((i) => i.action === "withhold");
}

/**
 * Compose the release gate from Critique layers (P7 §10).
 */
export function composeReleaseDecision(
  input: ComposeReleaseDecisionInput
): ReleaseDecision {
  const {
    state,
    coverage,
    alignment,
    placeholder,
    structurallyValid,
    executionComplete,
    fixPlan,
    skeletonMismatch,
    deepResults,
  } = input;

  const reasons: ReleaseReason[] = [];
  const unsupported = hasUnsupportedFindings(deepResults);

  if (coverage.notCovered.length > 0 || coverage.needsReplan.length > 0) {
    reasons.push("coverage_gap");
  }
  if (alignment.issues.length > 0) {
    reasons.push("alignment_mismatch");
  }
  if (unsupported) {
    reasons.push("unsupported_finding");
  }
  if (placeholder.detected) {
    reasons.push("placeholder_output");
  }
  if (isBudgetExceeded(state)) {
    reasons.push("blocked_by_budget");
  }
  if (!executionComplete && fixPlan.length === 0) {
    reasons.push("unrecoverable_execution_failure");
  }

  let verdict: ReleaseVerdict;

  const coverageComplete =
    coverage.total === 0 || coverage.covered === coverage.total;
  const hasRenderedBody = Boolean(state.renderedOutput?.trim());

  // A body we can actually ship: real rendered content that is not itself a
  // placeholder. When we have this, partial coverage/alignment gaps should be
  // disclosed as limitations rather than throwing the whole analysis away.
  const shippableBody = hasRenderedBody && !placeholder.detected;

  // Hard blocks — presenting the output would be misleading or unsafe no matter
  // how much substance exists.
  const hardWithhold =
    placeholder.detected ||
    hasBlockingAlignment(alignment) ||
    (isBudgetExceeded(state) && !hasRenderedBody) ||
    (!executionComplete && fixPlan.length === 0 && !structurallyValid);

  // Soft gaps — recoverable coverage/replan signals. These only withhold when
  // there is nothing shippable to fall back on; otherwise we release the
  // substance with an explicit limitations note.
  const hasSoftGap =
    skeletonMismatch ||
    coverage.notCovered.length > 0 ||
    coverage.needsReplan.length > 0 ||
    alignment.issues.some(
      (i) => i.action === "replan" || i.action === "targeted_redo"
    );

  if (hardWithhold || (hasSoftGap && !shippableBody)) {
    verdict = "withhold";
  } else if (
    coverageComplete &&
    alignment.issues.length === 0 &&
    !unsupported &&
    !placeholder.detected &&
    structurallyValid &&
    fixPlan.length === 0 &&
    executionComplete
  ) {
    verdict = "release";
  } else {
    verdict = "release_with_limitations";
  }

  return {
    verdict,
    reasons: [...new Set(reasons)],
    requirementCoverage: coverage,
    alignment,
    placeholderReport: placeholder,
  };
}
