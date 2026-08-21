import type { AnalysisState } from "../../models/analysis-state.js";
import type { ReleaseDecision } from "../../models/critique-report.js";

/** True when limitations are about missing skills / packages / unmapped requirements. */
export function hasSkillOrPackageLimitation(release: ReleaseDecision): boolean {
  if (release.reasons.includes("coverage_gap")) return true;
  if (release.requirementCoverage.notCovered.length > 0) return true;
  if (release.requirementCoverage.needsReplan.length > 0) return true;
  return release.alignment.issues.some(
    (i) => i.kind === "wrong_package" || i.action === "replan"
  );
}

function formatSkillPackageReasons(release: ReleaseDecision): string[] {
  const lines: string[] = [];
  const missing = release.requirementCoverage.notCovered;
  const replan = release.requirementCoverage.needsReplan;
  if (missing.length) {
    lines.push(
      `Some requested requirements were not covered by an available skill or package: ${missing.join(", ")}.`
    );
  }
  if (replan.length) {
    lines.push(
      `Some requirements could not be mapped to an execution path: ${replan.join(", ")}.`
    );
  }
  for (const issue of release.alignment.issues) {
    if (issue.kind === "wrong_package" || issue.action === "replan") {
      lines.push(issue.detail);
    }
  }
  return lines;
}

function formatReasons(release: ReleaseDecision): string[] {
  const lines: string[] = [];
  if (release.reasons.includes("coverage_gap")) {
    lines.push(...formatSkillPackageReasons(release));
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
  return [...new Set(lines)];
}

function suggestedNextStep(release: ReleaseDecision): string {
  if (release.alignment.issues.some((i) => i.action === "replan")) {
    return "Retry with a narrower instruction or confirm the document type and legal standard.";
  }
  if (release.requirementCoverage.needsReplan.length > 0) {
    return "Rephrase the request with explicit requirements or a supported analysis scope.";
  }
  if (release.verdict === "release_with_limitations") {
    return "Review the Coverage limitations section after the Bottom Line before relying on those specific points.";
  }
  return "Contact support or retry the analysis with a more specific instruction.";
}

/**
 * Insert skill/package limitations after Bottom Line when present; otherwise append at end.
 */
function attachLimitationsAfterBottomLine(body: string, limitationBlock: string): string {
  const bottomHeading = /^##\s+7\.\s+Bottom Line\s*$/im;
  const match = bottomHeading.exec(body);
  if (!match) {
    return `${body.trimEnd()}\n\n${limitationBlock}`.trim();
  }

  const afterHeading = match.index + match[0].length;
  // Find the next ## heading after Bottom Line (usually References).
  const rest = body.slice(afterHeading);
  const nextHeading = rest.search(/\n##\s+/);
  if (nextHeading === -1) {
    return `${body.trimEnd()}\n\n${limitationBlock}`.trim();
  }

  const insertAt = afterHeading + nextHeading;
  return `${body.slice(0, insertAt).trimEnd()}\n\n${limitationBlock}\n${body.slice(insertAt)}`.trim();
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
    if (!hasSkillOrPackageLimitation(release)) {
      return options.wrapExisting;
    }
    const reasons = formatSkillPackageReasons(release);
    if (reasons.length === 0) {
      return options.wrapExisting;
    }
    // Skip if the memo already rendered a Coverage limitations section.
    if (/##\s+Coverage limitations\b/i.test(options.wrapExisting)) {
      return options.wrapExisting;
    }
    const limitationBlock = [
      "## Coverage limitations",
      "",
      "These points could not be fully evaluated because a required skill, rule, or analysis package is missing or incomplete. Rely on the rest of this analysis as usual; treat only the items below with extra caution.",
      "",
      ...reasons.map((r) => `- ${r}`),
    ].join("\n");
    return attachLimitationsAfterBottomLine(options.wrapExisting, limitationBlock);
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
