import type { AnalysisState } from "../../models/analysis-state.js";
import type { ReleaseDecision } from "../../models/critique-report.js";

function formatReasons(release: ReleaseDecision): string[] {
  const lines: string[] = [];
  if (release.reasons.includes("coverage_gap")) {
    const missing = release.requirementCoverage.notCovered;
    const replan = release.requirementCoverage.needsReplan;
    if (missing.length) {
      lines.push(
        `Some requested requirements were not covered: ${missing.join(", ")}.`
      );
    }
    if (replan.length) {
      lines.push(
        `Some requirements could not be mapped to an execution path: ${replan.join(", ")}.`
      );
    }
  }
  if (release.reasons.includes("alignment_mismatch")) {
    for (const issue of release.alignment.issues) {
      lines.push(issue.detail);
    }
  }
  if (release.reasons.includes("unsupported_finding")) {
    lines.push(
      "One or more findings could not be verified against the cited evidence."
    );
  }
  if (release.reasons.includes("placeholder_output")) {
    lines.push(
      release.placeholderReport.detail ??
        "The rendered analysis did not contain substantive legal conclusions."
    );
  }
  if (release.reasons.includes("blocked_by_budget")) {
    lines.push("Analysis stopped because the token or turn budget was exhausted.");
  }
  if (release.reasons.includes("unrecoverable_execution_failure")) {
    lines.push("The analysis graph did not complete successfully and cannot be recovered.");
  }
  return lines;
}

function suggestedNextStep(release: ReleaseDecision): string {
  if (release.alignment.issues.some((i) => i.action === "replan")) {
    return "Retry with a narrower instruction or confirm the document type and legal standard.";
  }
  if (release.requirementCoverage.needsReplan.length > 0) {
    return "Rephrase the request with explicit requirements or a supported analysis scope.";
  }
  if (release.verdict === "release_with_limitations") {
    return "Review the limitations below before relying on this output.";
  }
  return "Contact support or retry the analysis with a more specific instruction.";
}

/**
 * Deterministic limitations report for withhold / partial release (P7 §9, P8 §14).
 */
export function renderLimitationsReport(
  state: AnalysisState,
  release: ReleaseDecision,
  options?: { wrapExisting?: string }
): string {
  const instruction = state.request.instruction;
  const lines: string[] = [];

  if (release.verdict === "release_with_limitations" && options?.wrapExisting) {
    lines.push(
      "## Limitations",
      "",
      "This analysis completed with known limitations. Do not treat it as a fully verified legal conclusion.",
      ""
    );
    for (const reason of formatReasons(release)) {
      lines.push(`- ${reason}`);
    }
    lines.push("", "---", "", options.wrapExisting);
    return lines.join("\n");
  }

  lines.push("# Analysis could not be released", "");
  lines.push("## Scope", "");
  lines.push(`Instruction: ${instruction}`, "");
  lines.push("## What was attempted", "");
  const paths = state.plan?.requirementExecutionPaths ?? [];
  if (paths.length > 0) {
    lines.push(
      `The system planned ${paths.length} requirement execution path(s) using skill(s): ${(state.activeSkillIds ?? []).join(", ") || "none"}.`
    );
  } else {
    lines.push("No requirement execution paths were established during planning.");
  }
  lines.push("", "## Why this cannot be presented", "");
  const reasons = formatReasons(release);
  if (reasons.length === 0) {
    lines.push(
      "The analysis did not meet the minimum correctness and coverage thresholds for release."
    );
  } else {
    for (const reason of reasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("", "## Suggested next step", "");
  lines.push(suggestedNextStep(release));
  return lines.join("\n");
}
