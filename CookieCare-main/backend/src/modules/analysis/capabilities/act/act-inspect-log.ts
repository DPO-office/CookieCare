import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { pacLogBlock } from "../../utils/pac-log.js";

/**
 * PLAN-style inspect dump after ACT finishes — so a CRITIQUE failure can be
 * traced back to what ACT actually produced (not just unit counts).
 */
export function logActInspect(state: AnalysisState): void {
  const units = state.plan?.workUnits ?? [];
  const findings = state.findings ?? [];
  const assessments = state.requirementAssessments ?? [];
  const lines: string[] = [
    ...formatExecutionSection(units),
    "",
    ...formatFindingsSection(findings, units),
    "",
    ...formatAssessmentsSection(assessments),
    "",
    ...formatRenderSection(state),
  ];
  pacLogBlock("ACT INSPECT — execution result", lines);
}

function formatExecutionSection(units: AnalysisWorkUnit[]): string[] {
  const byStatus = countBy(units, (u) => u.status ?? "pending");
  const failed = units.filter((u) => u.status === "failed");
  const silentOk = units.filter(
    (u) =>
      (u.status === "done" || u.status === "skipped") &&
      (u.findingsEmitted ?? 0) === 0
  );

  const lines: string[] = [
    "1. WHAT RAN",
    `   workUnits      ${units.length}   done=${byStatus.done ?? 0}  failed=${byStatus.failed ?? 0}  skipped=${byStatus.skipped ?? 0}  other=${units.length - ((byStatus.done ?? 0) + (byStatus.failed ?? 0) + (byStatus.skipped ?? 0))}`,
    `   tool mix       ${summarizeTools(units)}`,
    `   silent-ok      ${silentOk.length}   (terminal units with 0 findings — usually valid)`,
  ];

  lines.push("   per-tool outcomes");
  const tools = [...new Set(units.map((u) => u.tool))];
  for (const tool of tools) {
    const group = units.filter((u) => u.tool === tool);
    const emitted = group.reduce((n, u) => n + (u.findingsEmitted ?? 0), 0);
    const fails = group.filter((u) => u.status === "failed").length;
    const zeros = group.filter(
      (u) => u.status === "done" && (u.findingsEmitted ?? 0) === 0
    ).length;
    lines.push(
      `     ${tool}  x${group.length}  findings=${emitted}  failed=${fails}  zero-finding=${zeros}`
    );
  }

  if (failed.length > 0) {
    lines.push("   failed units");
    for (const unit of failed.slice(0, 12)) {
      lines.push(`     [X] ${unit.workUnitId}  ${unit.tool}`);
      if (unit.completionNote) {
        lines.push(...wrapPrefixed("         ", unit.completionNote));
      }
    }
    if (failed.length > 12) {
      lines.push(`     … (+${failed.length - 12} more)`);
    }
  }

  return lines;
}

function formatFindingsSection(
  findings: Finding[],
  units: AnalysisWorkUnit[]
): string[] {
  const visible = findings.filter((f) => f.visibility !== "internal");
  const byKind = countBy(visible, (f) => f.kind);
  const byStatus = countBy(visible, (f) => f.status);
  const bySeverity = countBy(
    visible.filter((f) => f.severity),
    (f) => f.severity ?? "unset"
  );
  const high = visible.filter(
    (f) =>
      f.severity === "high" && (f.kind === "risk" || f.kind === "compliance")
  );
  const noEvidence = visible.filter(
    (f) =>
      f.status === "present" &&
      (f.kind === "risk" || f.kind === "compliance") &&
      f.evidence.length === 0
  );

  const lines: string[] = [
    "2. WHAT WAS FOUND",
    `   findings       ${findings.length} total   visible=${visible.length}  internal=${findings.length - visible.length}`,
    `   by kind        ${fmtCounts(byKind)}`,
    `   by status      ${fmtCounts(byStatus)}`,
    `   by severity    ${fmtCounts(bySeverity) || "(none set)"}`,
    `   high material  ${high.length}   (risk/compliance severity=high — Deep Critique bait)`,
    `   missing evid.  ${noEvidence.length}   (present risk/compliance with 0 evidence)`,
  ];

  if (high.length > 0) {
    lines.push("   high-materiality findings");
    for (const finding of high.slice(0, 8)) {
      const unit = units.find((u) => u.workUnitId === finding.workUnitId);
      lines.push(
        `     * ${finding.findingId}  ${finding.kind}/${finding.status}  rule=${finding.ruleId ?? "-"}  unit=${finding.workUnitId ?? "-"}  tool=${unit?.tool ?? "-"}`
      );
      lines.push(...wrapPrefixed("       ", finding.claim || "(no claim)"));
    }
    if (high.length > 8) {
      lines.push(`     … (+${high.length - 8} more)`);
    }
  }

  return lines;
}

function formatAssessmentsSection(
  assessments: AnalysisState["requirementAssessments"]
): string[] {
  const list = assessments ?? [];
  const byStatus = countBy(list, (a) => a.status);
  const lines: string[] = [
    "3. REQUIREMENT ASSESSMENTS",
    `   assessments    ${list.length}   ${fmtCounts(byStatus) || "(none)"}`,
  ];

  if (list.length === 0) {
    lines.push("     (none — aggregate_requirements produced no assessments)");
    return lines;
  }

  for (const assessment of list.slice(0, 16)) {
    const mark =
      assessment.status === "covered"
        ? "[OK]"
        : assessment.status === "partial"
          ? "[~]"
          : "[X]";
    lines.push(
      `     ${mark} ${assessment.requirementId}  status=${assessment.status}  findings=${assessment.supportingFindingIds.length}`
    );
    if (assessment.summary) {
      lines.push(...wrapPrefixed("         ", truncate(assessment.summary, 140)));
    }
  }
  if (list.length > 16) {
    lines.push(`     … (+${list.length - 16} more)`);
  }
  return lines;
}

function formatRenderSection(state: AnalysisState): string[] {
  const schema = state.plan?.rendererSchemaId ?? "-";
  const output = state.renderedOutput?.trim() ?? "";
  const sections = state.plan?.reportSpec?.sections ?? [];
  const lines: string[] = [
    "4. RENDER OUTPUT",
    `   renderer       ${schema}`,
    `   reportType     ${state.plan?.reportSpec?.reportType ?? "-"}`,
    `   sections       ${sections.join(" → ") || "(none)"}`,
    `   outputChars    ${output.length}`,
  ];
  if (!output) {
    lines.push("     (empty — CRITIQUE placeholder / withhold risk)");
  } else {
    const first = output.split(/\r?\n/).find((l) => l.trim()) ?? "";
    lines.push(...wrapPrefixed("     head: ", truncate(first, 100)));
  }
  return lines;
}

function summarizeTools(units: AnalysisWorkUnit[]): string {
  const counts = new Map<string, number>();
  for (const unit of units) {
    counts.set(unit.tool, (counts.get(unit.tool) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tool, count]) => (count > 1 ? `${tool} x${count}` : tool))
    .join(" → ");
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function fmtCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join("  ");
}

function wrapPrefixed(prefix: string, text: string, width = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [`${prefix}(empty)`];
  const lines: string[] = [];
  let current = prefix;
  for (const word of words) {
    if (current.length === prefix.length) {
      current += word;
      continue;
    }
    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = `${prefix}${word}`;
  }
  if (current.length > prefix.length) lines.push(current);
  return lines;
}

function truncate(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
