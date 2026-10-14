import type { AnalysisState } from "../../models/analysis-state.js";
import type { AuditReport } from "../../models/audit-report.js";
import type { Finding } from "../../models/finding.js";
import { countBy, truncate, wrapPrefixed } from "../../shared/inspect-format.js";
import { pacLogBlock } from "../../utils/pac-log.js";

/**
 * Deep-only. Explains exactly what the grounding pass changed and why, plus
 * whether the optional LLM contradiction sweep ran. This is the block to read
 * when a "present" finding mysteriously became "insufficient_evidence" between
 * ACT and the final memo.
 */
export function logAuditInspect(
  before: AnalysisState,
  after: AnalysisState,
  args: { verifierRan: boolean; verifierSkippedReason?: string }
): void {
  const report = after.auditReport ?? {
    findingsChanged: [],
    assessmentsChanged: [],
    contradictions: [],
    notes: [],
  };
  const lines: string[] = [
    ...formatWhatRan(before),
    "",
    ...formatFindingDowngrades(report),
    "",
    ...formatAssessmentDowngrades(report),
    "",
    ...formatContradictionSweep(report, args),
    "",
    ...formatNetResult(before, after, report),
  ];
  pacLogBlock("AUDIT INSPECT — grounding + verification", lines);
}

function formatWhatRan(before: AnalysisState): string[] {
  const findings = before.findings ?? [];
  const visible = findings.filter((f) => f.visibility !== "internal");
  const skipped = visible.filter((f) => f.verifiedByProposition);
  return [
    "1. WHAT AUDIT CHECKED",
    `   findings       ${findings.length} total   visible=${visible.length}  internal=${findings.length - visible.length}`,
    `   skipped-reverify ${skipped.length}  (already VERIFY-checked against their exact quote — not re-searched)`,
    `   re-searched    ${visible.length - skipped.length}  (whole-document quote lookup)`,
  ];
}

function formatFindingDowngrades(report: AuditReport): string[] {
  const changes = report.findingsChanged;
  const lines: string[] = [
    "2. FINDING DOWNGRADES",
    `   count          ${changes.length}`,
  ];
  if (changes.length === 0) {
    lines.push("     (none — every visible finding's quote was grounded in the source)");
    return lines;
  }
  const byReason = countBy(changes, (c) => c.reason);
  lines.push(`   by reason      ${fmtCounts(byReason)}`);
  for (const change of changes.slice(0, 20)) {
    lines.push(
      `     [!] ${change.findingId}  ${change.from} → ${change.to}  reason=${change.reason}`
    );
  }
  if (changes.length > 20) {
    lines.push(`     … (+${changes.length - 20} more)`);
  }
  return lines;
}

function formatAssessmentDowngrades(report: AuditReport): string[] {
  const changes = report.assessmentsChanged;
  const lines: string[] = [
    "3. ASSESSMENT DOWNGRADES",
    `   count          ${changes.length}`,
  ];
  if (changes.length === 0) {
    lines.push("     (none — no requirement was left \"covered\" without a supporting present finding)");
    return lines;
  }
  const byReason = countBy(changes, (c) => c.reason);
  lines.push(`   by reason      ${fmtCounts(byReason)}`);
  for (const change of changes.slice(0, 20)) {
    lines.push(
      `     [!] ${change.requirementId}  ${change.from} → ${change.to}  reason=${change.reason}`
    );
  }
  if (changes.length > 20) {
    lines.push(`     … (+${changes.length - 20} more)`);
  }
  return lines;
}

function formatContradictionSweep(
  report: AuditReport,
  args: { verifierRan: boolean; verifierSkippedReason?: string }
): string[] {
  const lines: string[] = ["4. LLM CONTRADICTION SWEEP (memo vs findings)"];
  if (!args.verifierRan) {
    lines.push(
      `   status         skipped  reason=${args.verifierSkippedReason ?? "no rendered memo yet"}`
    );
    return lines;
  }
  lines.push(`   status         ran`);
  lines.push(`   contradictions ${report.contradictions.length}`);
  if (report.contradictions.length === 0) {
    lines.push("     (none — memo claims are all supported by findings)");
  } else {
    for (const c of report.contradictions.slice(0, 8)) {
      lines.push(...wrapPrefixed("     - ", truncate(c, 160)));
    }
    if (report.contradictions.length > 8) {
      lines.push(`     … (+${report.contradictions.length - 8} more)`);
    }
    lines.push('   note: appended to memo as "## Verification notes" — never rewrites the memo.');
  }
  return lines;
}

function formatNetResult(
  before: AnalysisState,
  after: AnalysisState,
  report: AuditReport
): string[] {
  const beforeStatus = countBy(before.findings ?? [], (f: Finding) => f.status);
  const afterStatus = countBy(after.findings ?? [], (f: Finding) => f.status);
  const lines: string[] = [
    "5. NET RESULT",
    `   findings by status   before: ${fmtCounts(beforeStatus) || "(none)"}`,
    `                        after:  ${fmtCounts(afterStatus) || "(none)"}`,
    `   changed              ${report.findingsChanged.length} finding(s), ${report.assessmentsChanged.length} assessment(s)`,
  ];
  if (report.notes.length > 0) {
    lines.push("   notes");
    for (const note of report.notes) {
      lines.push(...wrapPrefixed("     ", note));
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
