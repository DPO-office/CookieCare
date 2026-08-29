import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { Finding } from "../../../models/finding.js";
import type { SharedEvidenceBundle } from "../../../models/evidence-package.js";
import {
  countBy,
  summarizeTools,
  truncate,
  wrapPrefixed,
} from "../../../shared/inspect-format.js";
import { pacLogBlock } from "../../../utils/pac-log.js";

/** Set ANALYSIS_ACT_STEP_INSPECT=0 to silence per-step dumps (final ACT INSPECT still runs). */
function stepInspectEnabled(): boolean {
  const raw = process.env.ANALYSIS_ACT_STEP_INSPECT;
  if (raw === undefined || raw === "") return true;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

/**
 * Dump the ACT graph once before execution — numbered steps + deps + key inputs.
 */
export function logActGraphInspect(state: AnalysisState, runnable: AnalysisWorkUnit[]): void {
  if (!stepInspectEnabled()) return;
  const lines: string[] = [
    "GRAPH (runnable order is dependency-batched; numbers are planning order)",
    `   runnable=${runnable.length}  planUnits=${state.plan?.workUnits?.length ?? 0}`,
    "",
  ];
  runnable.forEach((unit, i) => {
    lines.push(
      `   ${i + 1}. ${unit.tool}  id=${unit.workUnitId}  deps=${unit.dependsOn.join(",") || "(none)"}`
    );
    lines.push(...formatUnitInput(unit, "      "));
  });
  pacLogBlock("ACT INSPECT — graph before run", lines);
}

/**
 * Dump segmentation / chunking after documents are prepared for ACT.
 */
export function logActSegmentationInspect(state: AnalysisState): void {
  if (!stepInspectEnabled()) return;
  const lines: string[] = ["DOCUMENTS (after ensureSegmented)"];
  const docs = state.workspace.documents ?? [];
  if (docs.length === 0) {
    lines.push("   (no documents in workspace)");
  }
  for (const doc of docs) {
    const segLens = doc.segments.map((s) => s.text?.length ?? 0);
    const totalSegChars = segLens.reduce((a, b) => a + b, 0);
    lines.push(`   docId=${doc.docId}`);
    lines.push(
      `      role=${doc.role ?? "-"}  docType=${doc.docType ?? "-"}  fullTextChars=${doc.fullText?.length ?? 0}`
    );
    lines.push(
      `      segments=${doc.segments.length}  segmentChars=${totalSegChars}  clauses=${doc.clauses?.length ?? 0}`
    );
    if (doc.segments.length > 0) {
      lines.push("      segment sample (first 8)");
      for (const seg of doc.segments.slice(0, 8)) {
        const path =
          seg.locator?.structuralPath ??
          (seg.locator?.charRange
            ? `${seg.locator.charRange[0]}-${seg.locator.charRange[1]}`
            : seg.kind);
        lines.push(
          `        [${seg.kind}/${path}] chars=${seg.text?.length ?? 0}  ${truncate(seg.text ?? "", 100)}`
        );
      }
      if (doc.segments.length > 8) {
        lines.push(`        … (+${doc.segments.length - 8} more segments)`);
      }
    }
  }
  pacLogBlock("ACT INSPECT — segmentation / chunking", lines);
}

export interface ActStepInspectArgs {
  unit: AnalysisWorkUnit;
  /** State after this unit (serial) or tool-local state (parallel). */
  state: AnalysisState;
  /** State snapshot before the unit, when available. */
  priorState?: AnalysisState;
  emitted: Finding[];
  ms: number;
  stepIndex: number;
  stepTotal: number;
  failed?: boolean;
  error?: string;
}

/**
 * Per-work-unit dump so you can walk classify → … → render and see I/O.
 */
export function logActStepInspect(args: ActStepInspectArgs): void {
  if (!stepInspectEnabled()) return;
  const { unit, state, priorState, emitted, ms, stepIndex, stepTotal, failed, error } =
    args;
  const lines: string[] = [
    `STEP ${stepIndex}/${stepTotal}  tool=${unit.tool}  id=${unit.workUnitId}  ms=${ms}${failed ? "  FAILED" : ""}`,
    `   deps=${unit.dependsOn.join(",") || "(none)"}`,
    "",
    "INPUT",
    ...formatUnitInput(unit, "   "),
  ];

  if (error) {
    lines.push("", "ERROR");
    lines.push(...wrapPrefixed("   ", error));
  }

  lines.push("", "OUTPUT");
  lines.push(...formatToolOutput(unit, state, priorState, emitted));

  if (emitted.length > 0) {
    lines.push("", `EMITTED FINDINGS (${emitted.length})`);
    for (const finding of emitted.slice(0, 20)) {
      lines.push(...formatFindingLines(finding, "   "));
    }
    if (emitted.length > 20) {
      lines.push(`   … (+${emitted.length - 20} more findings)`);
    }
  } else {
    lines.push("", "EMITTED FINDINGS (0)");
  }

  pacLogBlock(`ACT STEP — ${unit.tool}`, lines);
}

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
    ...formatLinkageSection(findings, assessments),
    "",
    ...formatAssessmentsSection(assessments),
    "",
    ...formatSharedEvidenceSummary(state),
    "",
    ...formatRenderSection(state),
  ];
  pacLogBlock("ACT INSPECT — execution result", lines);
}

function formatUnitInput(unit: AnalysisWorkUnit, prefix: string): string[] {
  const input = unit.input ?? {};
  const lines: string[] = [];
  const keys = [
    "docId",
    "packageId",
    "skillIds",
    "clauseTypes",
    "requirementIds",
    "ruleId",
    "riskCategoryIds",
    "matrixRowId",
    "retryRequirementIds",
  ];
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      lines.push(
        `${prefix}${key}=[${value.length}] ${value
          .slice(0, 12)
          .map(String)
          .join(", ")}${value.length > 12 ? ", …" : ""}`
      );
    } else {
      lines.push(`${prefix}${key}=${String(value)}`);
    }
  }
  if (unit.requirementIds?.length) {
    lines.push(
      `${prefix}unit.requirementIds=[${unit.requirementIds.length}] ${unit.requirementIds.join(", ")}`
    );
  }
  if (lines.length === 0) {
    lines.push(`${prefix}(no key inputs)`);
  }
  return lines;
}

function formatToolOutput(
  unit: AnalysisWorkUnit,
  state: AnalysisState,
  priorState: AnalysisState | undefined,
  emitted: Finding[]
): string[] {
  switch (unit.tool) {
    case "classify_document":
      return formatClassifyOutput(unit, state);
    case "extract_clauses":
      return formatExtractClausesOutput(unit, state);
    case "extract_shared_evidence":
      return formatSharedEvidenceOutput(unit, state, priorState);
    case "evaluate_package":
      return formatEvaluatePackageOutput(unit, emitted);
    case "flag_risk":
    case "check_against_rule":
    case "derive_risk":
      return formatFindingToolOutput(emitted);
    case "aggregate_requirements":
      return formatAggregateOutput(state);
    case "render_output":
      return formatRenderSection(state).map((l) => (l.startsWith("4.") ? l.replace("4.", "   ") : l));
    default:
      return [
        `   tool=${unit.tool}  emittedFindings=${emitted.length}`,
        `   assessments=${state.requirementAssessments?.length ?? 0}  sharedBundles=${Object.keys(state.sharedEvidence ?? {}).length}`,
      ];
  }
}

function formatClassifyOutput(unit: AnalysisWorkUnit, state: AnalysisState): string[] {
  const docId = String(unit.input.docId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  return [
    `   docId=${docId || "-"}`,
    `   docType=${doc?.docType ?? "-"}  role=${doc?.role ?? "-"}`,
    `   fullTextChars=${doc?.fullText?.length ?? 0}  segments=${doc?.segments?.length ?? 0}`,
  ];
}

function formatExtractClausesOutput(unit: AnalysisWorkUnit, state: AnalysisState): string[] {
  const docId = String(unit.input.docId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  const clauses = doc?.clauses ?? [];
  const byType = countBy(clauses, (c) => c.clauseType || "uncategorized");
  const lines: string[] = [
    `   docId=${docId || "-"}  clauses=${clauses.length}`,
    `   byType  ${fmtCounts(byType) || "(none)"}`,
  ];
  lines.push("   clause sample (first 12)");
  if (clauses.length === 0) {
    lines.push("     (none extracted)");
    return lines;
  }
  for (const clause of clauses.slice(0, 12)) {
    const trunc = clause.truncated ? " truncated" : "";
    lines.push(
      `     * ${clause.clauseType}  status=${clause.evidenceStatus}${trunc}  chars=${clause.text?.length ?? 0}`
    );
    lines.push(...wrapPrefixed("       ", truncate(clause.text ?? "", 140)));
  }
  if (clauses.length > 12) {
    lines.push(`     … (+${clauses.length - 12} more clauses)`);
  }
  return lines;
}

function formatSharedEvidenceOutput(
  unit: AnalysisWorkUnit,
  state: AnalysisState,
  priorState: AnalysisState | undefined
): string[] {
  const packageId = String(unit.input.packageId ?? "");
  const bundle = state.sharedEvidence?.[packageId];
  const prior = priorState?.sharedEvidence?.[packageId];
  const lines: string[] = [
    `   packageId=${packageId || "-"}`,
    `   items=${bundle?.items?.length ?? 0}  (was ${prior?.items?.length ?? 0} before)`,
  ];
  if (!bundle?.items?.length) {
    lines.push("     (empty bundle)");
    return lines;
  }
  for (const item of bundle.items) {
    const trunc = item.truncated ? " truncated" : "";
    lines.push(
      `     ${item.ref}  type=${item.clauseType}  status=${item.evidenceStatus}${trunc}  chars=${item.quotedText.length}`
    );
    lines.push(...wrapPrefixed("        ", truncate(item.quotedText, 140)));
  }
  return lines;
}

function formatEvaluatePackageOutput(unit: AnalysisWorkUnit, emitted: Finding[]): string[] {
  const packageId = String(unit.input.packageId ?? "");
  const reqIds = (unit.input.requirementIds as string[] | undefined) ?? unit.requirementIds ?? [];
  const byReq = countBy(
    emitted.filter((f) => f.requirementId),
    (f) => f.requirementId!
  );
  const byStatus = countBy(emitted, (f) => f.status);
  const lines: string[] = [
    `   packageId=${packageId || "-"}`,
    `   packageRequirementIds=[${reqIds.length}] ${reqIds.join(", ") || "(none)"}`,
    `   emitted=${emitted.length}  byStatus ${fmtCounts(byStatus) || "(none)"}`,
    `   stampedRequirementIds  ${fmtCounts(byReq) || "(none — findings missing requirementId)"}`,
  ];
  const missingStamp = emitted.filter((f) => !f.requirementId);
  if (missingStamp.length > 0) {
    lines.push(`   WARN ${missingStamp.length} finding(s) have no requirementId stamp`);
  }
  return lines;
}

function formatFindingToolOutput(emitted: Finding[]): string[] {
  const byStatus = countBy(emitted, (f) => f.status);
  const byKind = countBy(emitted, (f) => f.kind);
  return [
    `   emitted=${emitted.length}  byKind ${fmtCounts(byKind) || "(none)"}  byStatus ${fmtCounts(byStatus) || "(none)"}`,
  ];
}

function formatAggregateOutput(state: AnalysisState): string[] {
  const assessments = state.requirementAssessments ?? [];
  const byStatus = countBy(assessments, (a) => a.status);
  const lines: string[] = [
    `   assessments=${assessments.length}  ${fmtCounts(byStatus) || "(none)"}`,
  ];
  for (const a of assessments) {
    const j = a.judgement;
    lines.push(
      `     * ${a.requirementId}  status=${a.status}  compliance=${j?.compliance ?? "-"}  evidence=${j?.evidenceState ?? "-"}  findings=${a.supportingFindingIds.length}`
    );
    lines.push(
      `       supporting=[${a.supportingFindingIds.join(", ") || "NONE"}]`
    );
    if (a.summary) {
      lines.push(...wrapPrefixed("       ", truncate(a.summary, 160)));
    }
  }
  return lines;
}

function formatFindingLines(finding: Finding, prefix: string): string[] {
  const lines: string[] = [
    `${prefix}* ${finding.findingId}  kind=${finding.kind}  status=${finding.status}  req=${finding.requirementId ?? "(none)"}  rule=${finding.ruleId ?? "-"}`,
  ];
  if (finding.judgement) {
    lines.push(
      `${prefix}  judgement compliance=${finding.judgement.compliance}  evidence=${finding.judgement.evidenceState}  drafting=${finding.judgement.draftingQuality ?? "-"}`
    );
  }
  lines.push(...wrapPrefixed(`${prefix}  claim: `, truncate(finding.claim || "(no claim)", 160)));
  if (finding.gap) {
    lines.push(...wrapPrefixed(`${prefix}  gap: `, truncate(finding.gap, 120)));
  }
  const evidence = finding.evidence ?? [];
  if (evidence.length === 0) {
    lines.push(`${prefix}  evidence: (none)`);
  } else {
    for (const span of evidence.slice(0, 2)) {
      lines.push(
        ...wrapPrefixed(
          `${prefix}  quote: `,
          truncate(span.quotedText || "(empty quote)", 140)
        )
      );
    }
    if (evidence.length > 2) {
      lines.push(`${prefix}  … (+${evidence.length - 2} more evidence spans)`);
    }
  }
  return lines;
}

function formatLinkageSection(
  findings: Finding[],
  assessments: AnalysisState["requirementAssessments"]
): string[] {
  const stamped = findings.filter((f) => f.requirementId);
  const unstamped = findings.filter(
    (f) =>
      !f.requirementId &&
      f.visibility !== "internal" &&
      (f.kind === "compliance" || f.kind === "risk")
  );
  const lines: string[] = [
    "3. FINDING → REQUIREMENT LINKAGE",
    `   stamped        ${stamped.length}  (have requirementId)`,
    `   unstamped UF   ${unstamped.length}  (user-facing compliance/risk without requirementId)`,
  ];

  const byReq = new Map<string, Finding[]>();
  for (const f of stamped) {
    const id = f.requirementId!;
    const list = byReq.get(id) ?? [];
    list.push(f);
    byReq.set(id, list);
  }
  for (const [reqId, list] of [...byReq.entries()].slice(0, 20)) {
    const statuses = fmtCounts(countBy(list, (f) => f.status));
    lines.push(`     ${reqId}  n=${list.length}  ${statuses}`);
    for (const f of list.slice(0, 4)) {
      lines.push(
        `       - ${f.findingId}  ${f.status}  ${truncate(f.claim, 80)}`
      );
    }
  }
  if (byReq.size > 20) {
    lines.push(`     … (+${byReq.size - 20} more requirement buckets)`);
  }

  const orphanAssessments = (assessments ?? []).filter(
    (a) => a.supportingFindingIds.length === 0
  );
  if (orphanAssessments.length > 0) {
    lines.push(
      `   orphan assessments (0 supporting findings): ${orphanAssessments.map((a) => a.requirementId).join(", ")}`
    );
  }
  return lines;
}

function formatSharedEvidenceSummary(state: AnalysisState): string[] {
  const bundles = Object.values(state.sharedEvidence ?? {}) as SharedEvidenceBundle[];
  const lines: string[] = [
    "5. SHARED EVIDENCE BUNDLES",
    `   bundles=${bundles.length}`,
  ];
  for (const bundle of bundles) {
    const chars = bundle.items.reduce((n, i) => n + i.quotedText.length, 0);
    const truncated = bundle.items.filter((i) => i.truncated).length;
    lines.push(
      `     ${bundle.packageId}  doc=${bundle.docId}  items=${bundle.items.length}  chars=${chars}  truncated=${truncated}`
    );
    for (const item of bundle.items.slice(0, 6)) {
      lines.push(
        `       ${item.ref} ${item.clauseType} chars=${item.quotedText.length}${item.truncated ? " trunc" : ""}  ${truncate(item.quotedText, 90)}`
      );
    }
    if (bundle.items.length > 6) {
      lines.push(`       … (+${bundle.items.length - 6} more items)`);
    }
  }
  if (bundles.length === 0) {
    lines.push("     (none)");
  }
  return lines;
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
    `   missing evid.  ${noEvidence.length}  (present risk/compliance with 0 evidence)`,
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
    "4. REQUIREMENT ASSESSMENTS",
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
    const j = assessment.judgement;
    lines.push(
      `     ${mark} ${assessment.requirementId}  status=${assessment.status}  compliance=${j?.compliance ?? "-"}  findings=${assessment.supportingFindingIds.length}`
    );
    lines.push(
      `         supporting=[${assessment.supportingFindingIds.join(", ") || "NONE"}]`
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
    "6. RENDER OUTPUT",
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

function fmtCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join("  ");
}
