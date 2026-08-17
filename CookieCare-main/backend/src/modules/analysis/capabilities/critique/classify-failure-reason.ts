import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { CritiqueResult } from "../../models/critique-report.js";
import type { FailureReason } from "../../models/work-unit-outcome.js";
import type { AnalysisSkillConfig } from "../../skills/types.js";
import { hasAuthoredContent, targetIdForUnit } from "./has-authored-content.js";

export interface UnitCritiqueContext {
  unit: AnalysisWorkUnit;
  unitResults: CritiqueResult[];
  skills: AnalysisSkillConfig[];
}

export function classifyFailureReason(ctx: UnitCritiqueContext): FailureReason {
  const { unit, unitResults, skills } = ctx;
  const targetId = targetIdForUnit(unit);

  if (unit.status === "failed") {
    return {
      kind: "tool_execution_error",
      error: unit.completionNote ?? "Work unit execution failed",
    };
  }

  const budgetExceeded = unitResults.some((r) =>
    r.detail?.includes("budget_exceeded")
  );
  if (budgetExceeded) {
    return {
      kind: "tool_execution_error",
      error: "budget_exceeded",
    };
  }

  const hasMissing = unitResults.some((r) => r.status === "missing");
  const failResults = unitResults.filter((r) => r.status === "fail");

  if (
    targetId &&
    !hasAuthoredContent(targetId, skills) &&
    (hasMissing ||
      failResults.some(
        (r) =>
          r.itemId.startsWith("regime:") ||
          r.itemId.startsWith("focus-") ||
          r.itemId.startsWith("fixplan:")
      ))
  ) {
    return {
      kind: "not_authored",
      details: `No active skill declares ${targetId}`,
    };
  }

  const rejection = failResults.find((r) => r.detail)?.detail;
  if (rejection) {
    return {
      kind: "verification_rejected",
      critiqueReason: rejection,
    };
  }

  if (hasMissing) {
    const missingDetail = unitResults.find((r) => r.status === "missing")?.detail;
    return {
      kind: "verification_rejected",
      critiqueReason: missingDetail ?? "Required finding missing for this work unit",
    };
  }

  return {
    kind: "intent_mismatch",
    details: "No specific rejection reason available",
  };
}
