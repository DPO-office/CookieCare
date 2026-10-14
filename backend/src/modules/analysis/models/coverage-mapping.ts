import type { RequirementCoverageStatus } from "./analysis-plan.js";
import type { CoverageState } from "./critique-report.js";

/**
 * Explicit mapping between PLAN completeness statuses and Critique coverage
 * states. Keeps the two enums separate (different semantics) while documenting
 * how they relate.
 */
export function planCoverageToCritiqueState(
  status: RequirementCoverageStatus
): CoverageState {
  switch (status) {
    case "covered":
      return "covered";
    case "partial":
      return "covered";
    case "missing":
      return "not_covered";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function critiqueStateToPlanCoverage(
  state: CoverageState
): RequirementCoverageStatus | null {
  switch (state) {
    case "covered":
      return "covered";
    case "not_covered":
      return "missing";
    case "needs_replan":
      return "missing";
    case "cannot_determine":
      return null;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
