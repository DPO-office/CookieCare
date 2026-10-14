import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { CritiqueIssue, FixItem } from "../../../models/critique-report.js";
import { isTerminal } from "./shared.js";

export function validateWorkUnits(
  units: AnalysisWorkUnit[],
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  for (const unit of units) {
    const terminal = isTerminal(unit);
    results.push({
      itemId: `complete:${unit.workUnitId}`,
      status: terminal ? "pass" : "missing",
      evidenceVerified: terminal,
      workUnitId: unit.workUnitId,
      detail: terminal
        ? unit.completionNote
        : "Work unit did not reach an allowed terminal status",
    });
    if (!terminal) {
      fixes.push({
        workUnitId: unit.workUnitId,
        instruction: `Re-run ${unit.tool}; unit did not complete`,
        sourceItemId: `complete:${unit.workUnitId}`,
      });
    } else if (unit.status === "failed") {
      const issueId = `execution-failed:${unit.workUnitId}`;
      results.push({
        itemId: issueId,
        status: "fail",
        evidenceVerified: false,
        workUnitId: unit.workUnitId,
        detail: unit.completionNote ?? "Work unit execution failed",
      });
      fixes.push({
        workUnitId: unit.workUnitId,
        instruction: `Retry failed ${unit.tool} work unit`,
        sourceItemId: issueId,
      });
    }
  }
}
