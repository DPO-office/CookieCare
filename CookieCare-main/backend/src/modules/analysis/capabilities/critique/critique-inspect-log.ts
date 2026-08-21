import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AlignmentReport,
  CritiqueIssue,
  CritiqueReport,
  CritiqueTarget,
  DeepCritiqueResult,
  PlaceholderReport,
  ReleaseDecision,
  RequirementCoverageSummary,
} from "../../models/critique-report.js";
import type { CritiqueLiteResult } from "./run-critique-lite.js";
import {
  countBy,
  truncate,
  wrapPrefixed,
} from "../../shared/inspect-format.js";
import { pacLogBlock } from "../../utils/pac-log.js";

const REASON_LABEL: Record<CritiqueTarget["reason"], string> = {
  high_materiality: "high-severity risk/compliance finding",
  weak_evidence: "present finding with very short evidence quotes",
  conflicting_evidence: "same requirement has present + absent_expected findings",
  internal_inconsistency: "assessment status conflicts with derived Finding status",
  low_confidence: "low-confidence evaluation",
  explicit_rigor_request: "user asked for rigorous/exhaustive verification",
};

/**
 * After Critique Lite — explains structural health AND exactly why Deep Critique
 * will (or will not) run. This is the block to read when debugging replan loops.
 */
export function logCritiqueLiteInspect(lite: CritiqueLiteResult): void {
  const fails = lite.results.filter(
    (r) => r.status === "fail" || r.status === "missing"
  );
  const lines: string[] = [
    ...formatLiteVerdict(lite, fails.length),
    "",
    ...formatStructuralFailures(fails),
    "",
    ...formatCoverage(lite.requirementCoverage),
    "",
    ...formatAlignment(lite.alignment),
    "",
    ...formatPlaceholder(lite.placeholderReport),
    "",
    ...formatDeepTargets(lite.deepCritiqueTargets),
  ];
  pacLogBlock("CRITIQUE INSPECT — lite", lines);
}

/**
 * After Deep Critique + release composition — shows semantic verdicts and the
 * gate decision that drives the next PAC phase.
 */
export function logCritiqueFinalInspect(
  state: AnalysisState,
  report: CritiqueReport,
  nextPhaseHint?: string
): void {
  const lines: string[] = [
    ...formatDeepResults(report.deepCritiqueResults ?? []),
    "",
    ...formatRelease(report.release, report),
    "",
    ...formatNextDrivers(state, report, nextPhaseHint),
  ];
  pacLogBlock("CRITIQUE INSPECT — final", lines);
}

function formatLiteVerdict(lite: CritiqueLiteResult, failCount: number): string[] {
  return [
    "1. LITE VERDICT",
    `   executionComplete   ${lite.executionComplete ? "yes" : "no"}`,
    `   structurallyValid   ${lite.structurallyValid ? "yes" : "no"}`,
    `   skeletonMismatch    ${lite.skeletonMismatch ? "yes ← forces PLAN replan" : "no"}`,
    `   criticalFactAsk     ${lite.criticalFactSurfaced ? "yes ← forces ASK" : "no"}`,
    `   issues              fail/missing=${failCount}  totalChecks=${lite.results.length}  fixes=${lite.fixPlan.length}`,
    `   deepTargets         ${lite.deepCritiqueTargets.length}   (Deep Critique runs if >0 and no prior targeted redo)`,
  ];
}

function formatStructuralFailures(fails: CritiqueIssue[]): string[] {
  const lines: string[] = [
    "2. STRUCTURAL FAILURES (core problems)",
    `   count          ${fails.length}`,
  ];
  if (fails.length === 0) {
    lines.push("     (none — structure is clean)");
    return lines;
  }

  const byPrefix = countBy(fails, (issue) => issue.itemId.split(":")[0] ?? "other");
  lines.push(`   by family     ${fmtCounts(byPrefix)}`);
  lines.push("   top failures");
  for (const issue of fails.slice(0, 16)) {
    const mark = issue.status === "missing" ? "[X]" : "[!]";
    lines.push(
      `     ${mark} ${issue.itemId}  unit=${issue.workUnitId ?? "-"}  finding=${issue.findingId ?? "-"}`
    );
    if (issue.detail) {
      lines.push(...wrapPrefixed("         ", issue.detail));
    }
  }
  if (fails.length > 16) {
    lines.push(`     … (+${fails.length - 16} more)`);
  }
  return lines;
}

function formatCoverage(coverage: RequirementCoverageSummary): string[] {
  const lines: string[] = [
    "3. REQUIREMENT COVERAGE",
    `   total=${coverage.total}  covered=${coverage.covered}  notCovered=${coverage.notCovered.length}  needsReplan=${coverage.needsReplan.length}`,
  ];
  for (const entry of coverage.entries) {
    if (entry.state === "covered") continue;
    const mark = entry.state === "needs_replan" ? "[~]" : "[X]";
    lines.push(`     ${mark} ${entry.requirementId}  ${entry.state}`);
    if (entry.reason) lines.push(...wrapPrefixed("         ", entry.reason));
  }
  if (coverage.entries.every((e) => e.state === "covered") && coverage.total > 0) {
    lines.push("     (all requirements covered)");
  }
  if (coverage.total === 0) {
    lines.push("     (no intent requirements to cover)");
  }
  return lines;
}

function formatAlignment(alignment: AlignmentReport): string[] {
  const lines: string[] = [
    "4. PLAN/ACT ALIGNMENT",
    `   issues         ${alignment.issues.length}`,
  ];
  if (alignment.issues.length === 0) {
    lines.push("     (aligned)");
    return lines;
  }
  for (const issue of alignment.issues) {
    lines.push(
      `     [!] ${issue.kind}  action=${issue.action}  req=${issue.requirementId ?? "-"}  pkg=${issue.packageId ?? "-"}`
    );
    lines.push(...wrapPrefixed("         ", issue.detail));
  }
  return lines;
}

function formatPlaceholder(placeholder: PlaceholderReport): string[] {
  const lines: string[] = [
    "5. PLACEHOLDER / RELEASE SAFETY",
    `   detected       ${placeholder.detected ? "yes" : "no"}`,
  ];
  if (placeholder.detected) {
    lines.push(`   kind           ${placeholder.kind ?? "-"}`);
    if (placeholder.detail) {
      lines.push(...wrapPrefixed("   detail         ", placeholder.detail));
    }
  }
  return lines;
}

function formatDeepTargets(targets: CritiqueTarget[]): string[] {
  const lines: string[] = [
    "6. WHY DEEP CRITIQUE",
    `   targets        ${targets.length}`,
  ];
  if (targets.length === 0) {
    lines.push("     (none — Deep Critique will be skipped)");
    lines.push(
      "     tip: Deep Critique only runs for high_materiality, weak_evidence,"
    );
    lines.push(
      "          conflicting_evidence, internal_inconsistency, or explicit_rigor_request"
    );
    return lines;
  }

  const byReason = new Map<CritiqueTarget["reason"], CritiqueTarget[]>();
  for (const target of targets) {
    const list = byReason.get(target.reason) ?? [];
    list.push(target);
    byReason.set(target.reason, list);
  }

  lines.push("   by reason");
  for (const [reason, group] of byReason) {
    lines.push(
      `     ★ ${reason}  x${group.length}  — ${REASON_LABEL[reason]}`
    );
    for (const target of group.slice(0, 6)) {
      lines.push(
        `         req=${target.requirementId ?? "-"}  finding=${target.findingId ?? "-"}  unit=${target.workUnitId}  pkg=${target.evidencePackageId ?? "-"}`
      );
      if (target.instruction) {
        lines.push(...wrapPrefixed("           ", target.instruction));
      }
    }
    if (group.length > 6) {
      lines.push(`         … (+${group.length - 6} more)`);
    }
  }

  lines.push("");
  lines.push("   CORE PROBLEM SUMMARY");
  for (const [reason, group] of byReason) {
    lines.push(
      `     → ${group.length} target(s) because: ${REASON_LABEL[reason]}`
    );
  }
  return lines;
}

function formatDeepResults(results: DeepCritiqueResult[]): string[] {
  const lines: string[] = [
    "1. DEEP CRITIQUE RESULTS",
    `   results        ${results.length}`,
  ];
  if (results.length === 0) {
    lines.push("     (Deep Critique did not run or returned no results)");
    return lines;
  }

  const byVerdict = countBy(results, (r) => r.verdict);
  const byAction = countBy(results, (r) => r.recommendedAction);
  lines.push(`   by verdict    ${fmtCounts(byVerdict)}`);
  lines.push(`   by action     ${fmtCounts(byAction)}`);

  for (const result of results.slice(0, 10)) {
    const mark =
      result.verdict === "supported"
        ? "[OK]"
        : result.verdict === "partially_supported"
          ? "[~]"
          : "[X]";
    lines.push(
      `     ${mark} ${result.targetId}  verdict=${result.verdict}  action=${result.recommendedAction}`
    );
    lines.push(...wrapPrefixed("         ", truncate(result.explanation, 160)));
  }
  if (results.length > 10) {
    lines.push(`     … (+${results.length - 10} more)`);
  }
  return lines;
}

function formatRelease(
  release: ReleaseDecision | undefined,
  report: CritiqueReport
): string[] {
  if (!release) {
    return [
      "2. RELEASE DECISION",
      "   (no release object — legacy path)",
      `   isGreen=${report.isGreen}  skeleton=${report.skeletonMismatch}  fixes=${report.fixPlan.length}`,
    ];
  }
  return [
    "2. RELEASE DECISION",
    `   verdict        ${release.verdict}`,
    `   reasons        ${release.reasons.join(", ") || "(none)"}`,
    `   isGreen        ${report.isGreen}`,
    `   coverage       covered=${release.requirementCoverage.covered}/${release.requirementCoverage.total}`,
    `   alignmentIssues ${release.alignment.issues.length}`,
    `   placeholder    ${release.placeholderReport.detected ? "yes" : "no"}`,
  ];
}

function formatNextDrivers(
  state: AnalysisState,
  report: CritiqueReport,
  nextPhaseHint?: string
): string[] {
  const replanCount = report.metrics?.replanCount ?? 0;
  const alignmentReplan =
    report.release?.alignment.issues.some((i) => i.action === "replan") ?? false;
  const drivers: string[] = [];
  if (report.skeletonMismatch) drivers.push("skeletonMismatch");
  if (alignmentReplan) drivers.push("alignment.replan");
  if (report.criticalFactSurfaced) drivers.push("criticalFactSurfaced");
  if (report.fixPlan.length > 0) {
    drivers.push(`fixPlan[${report.fixPlan.length}]`);
  }
  if (drivers.length === 0) drivers.push("(none → DONE via release gate)");

  const lines: string[] = [
    "3. NEXT-PHASE DRIVERS",
    `   drivers        ${drivers.join(" | ")}`,
    `   replanCount    ${replanCount}   (replan only allowed while < 1)`,
    `   turn           ${state.agent?.turn ?? 0}/${state.agent?.maxTurns ?? "-"}`,
  ];
  if (nextPhaseHint) {
    lines.push(`   nextHint       ${nextPhaseHint}`);
  }
  if (report.fixPlan.length > 0) {
    lines.push("   fixPlan");
    for (const fix of report.fixPlan.slice(0, 8)) {
      lines.push(
        `     * ${fix.workUnitId}  src=${fix.sourceItemId}  req=${fix.requirementId ?? "-"}`
      );
      lines.push(...wrapPrefixed("       ", fix.instruction));
    }
    if (report.fixPlan.length > 8) {
      lines.push(`     … (+${report.fixPlan.length - 8} more)`);
    }
  }
  return lines;
}

function fmtCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join("  ");
}
