import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisBranchPlan, AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { displayRequirementStatus, isGapLike } from "../../models/requirement-assessment.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";
import { pacLog } from "../../utils/pac-log.js";

export interface BranchOutputValidation {
  valid: boolean;
  reasons: string[];
}

/** Deterministic release checks for branch prose; no second full-report LLM call. */
export function validateBranchOutput(
  output: string,
  evidenceCount: number,
  hasLockedGap: boolean
): BranchOutputValidation {
  const text = output.trim();
  const reasons: string[] = [];
  if (text.length < 40) reasons.push("missing_or_too_short");
  if (/\b(system prompt|developer message|ignore previous|you are chatgpt)\b/i.test(text)) {
    reasons.push("prompt_leakage");
  }
  if (/\.\.\.\s*$/.test(text) || (text.match(/```/g)?.length ?? 0) % 2 !== 0) {
    reasons.push("truncated_output");
  }
  const cited = [...text.matchAll(/\[E(\d+)\]/g)].map((match) => Number(match[1]));
  if (cited.some((number) => !Number.isFinite(number) || number < 1 || number > evidenceCount)) {
    reasons.push("citation_mismatch");
  }
  if (hasLockedGap && /^#{1,4}\s+(no (material )?gaps?|fully compliant)\b/im.test(text)) {
    reasons.push("contradictory_heading");
  }
  return { valid: reasons.length === 0, reasons };
}

export function mergeBranchOutputs(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const requestedOrder = Array.isArray(unit.input.branchOrder)
    ? unit.input.branchOrder.map(String)
    : [];
  const branches = [...(state.plan?.branches ?? [])].sort((a, b) => {
    const ai = requestedOrder.indexOf(a.facetId);
    const bi = requestedOrder.indexOf(b.facetId);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    return a.order - b.order;
  });
  const sections: string[] = [];
  const overviewRows: string[] = [];
  const diagnostics = { ...(state.branchDiagnostics ?? {}) };

  for (const [index, branch] of branches.entries()) {
    const branchFindings = findings.filter((finding) => finding.facetId === branch.facetId);
    const assessments = (state.requirementAssessments ?? []).filter(
      (assessment) => assessment.facetId === branch.facetId
    );
    const evidenceCount = new Set(
      branchFindings.flatMap((finding) =>
        finding.evidence.map((span) =>
          `${span.locator.docId}:${span.locator.charRange[0]}:${span.locator.charRange[1]}`
        )
      )
    ).size;
    const report = state.branchReports?.[branch.facetId] ?? "";
    const validation = validateBranchOutput(
      report,
      evidenceCount,
      assessments.some((assessment) => isGapLike(assessment.status))
    );
    const priorDiagnostic = diagnostics[branch.facetId];
    const incomplete = priorDiagnostic?.status === "incomplete";
    const body = !incomplete && validation.valid
      ? report.trim()
      : buildSafeBranchFallback(state, branch.facetId, branch.label, assessments, branchFindings, [
          ...(priorDiagnostic?.reason ? [priorDiagnostic.reason] : []),
          ...validation.reasons,
        ]);
    diagnostics[branch.facetId] = {
      ...(priorDiagnostic ?? {}),
      status: incomplete || !validation.valid ? "incomplete" : "complete",
      failedLayer:
        priorDiagnostic?.failedLayer ?? (!validation.valid ? "MERGE" : undefined),
      reason:
        priorDiagnostic?.reason ??
        (!validation.valid ? `Release safeguard: ${validation.reasons.join(", ")}.` : undefined),
      evidenceCount,
    };
    const title = compactBranchTitle(branch);
    const formattedBody = formatBranchBody(body, branch.label);
    const scope = compactScope(branch.label);
    sections.push(
      [
        `## ${index + 1}. ${title}`,
        "",
        `*Scope: ${scope}*`,
        "",
        formattedBody,
      ].join("\n")
    );
    const needsAttention = assessments.filter((assessment) =>
      isGapLike(assessment.status)
    ).length;
    const result = diagnostics[branch.facetId]?.status === "complete"
      ? "Complete"
      : "Analysis incomplete";
    const coverage = assessments.length > 0
      ? `${assessments.length} checks / ${needsAttention} need attention`
      : `${branchFindings.filter((finding) => finding.visibility !== "internal").length} findings`;
    overviewRows.push(
      `| ${index + 1} | ${escapeTableCell(title)} | ${escapeTableCell(coverage)} | ${result} |`
    );
    pacLog("MERGE branch", {
      facetId: branch.facetId,
      operation: branch.intent.operation,
      status: diagnostics[branch.facetId]?.status,
      evidence: evidenceCount,
      findings: branchFindings.length,
      validation: validation.reasons.join(",") || "ok",
      modelCalls: diagnostics[branch.facetId]?.modelCalls ?? 0,
      tokens: diagnostics[branch.facetId]?.tokenDelta ?? 0,
      ms: diagnostics[branch.facetId]?.elapsedMs ?? 0,
      cacheHits: branch.workUnitIds.filter((id) => id.startsWith("shared-")).length,
      failedLayer: diagnostics[branch.facetId]?.failedLayer ?? "none",
      timeoutReason:
        diagnostics[branch.facetId]?.reason?.toLowerCase().includes("ceiling") ||
        diagnostics[branch.facetId]?.reason?.toLowerCase().includes("timed out")
          ? diagnostics[branch.facetId]?.reason
          : "none",
    });
  }

  const completeCount = Object.values(diagnostics).filter(
    (item) => item.status === "complete"
  ).length;
  const renderedOutput = [
    "# Analysis report",
    `> **${completeCount} of ${branches.length} workstreams completed.** Each section below was analyzed with its own operation-specific evidence and report contract.`,
    [
      "| # | Workstream | Coverage | Result |",
      "|---:|---|---|---|",
      ...overviewRows,
    ].join("\n"),
    ...sections,
  ].join("\n\n").trim();
  if (renderedOutput) emitAnalysisToken(state, `${renderedOutput}\n`);
  pacLog("MERGE done", {
    branches: branches.length,
    complete: Object.values(diagnostics).filter((item) => item.status === "complete").length,
    incomplete: Object.values(diagnostics).filter((item) => item.status === "incomplete").length,
  });
  return {
    state: { ...state, renderedOutput, branchDiagnostics: diagnostics },
    findings,
  };
}

function compactBranchTitle(branch: AnalysisBranchPlan): string {
  const standard = branch.intent.standardConcept?.trim();
  switch (branch.intent.operation) {
    case "compliance_check":
      return standard ? `${standard} compliance review` : "Compliance review";
    case "compare":
      return branch.referenceDocId ? "Playbook alignment" : "Agreement comparison";
    case "risk_flag": {
      const perspective = branch.partyPerspective?.trim();
      return perspective
        ? `${sentenceCase(perspective)}-side risk assessment`
        : "Risk assessment";
    }
    case "summarize":
      return "Document summary";
    case "explain_qa":
      return "Questions answered";
    case "extract":
      return "Requested extraction";
    default:
      return humanize(branch.intent.operation);
  }
}

function compactScope(label: string): string {
  return label.replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
}

/** Reserve H1/H2 for the report and workstream hierarchy. */
function formatBranchBody(output: string, label: string): string {
  return stripLeadingDuplicateHeading(output, label)
    .replace(/^(#{1,5})\s+/gm, (_match, hashes: string) => {
      const level = Math.min(6, Math.max(3, hashes.length + 1));
      return `${"#".repeat(level)} `;
    })
    .trim();
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSafeBranchFallback(
  state: AnalysisState,
  facetId: string,
  label: string,
  assessments: NonNullable<AnalysisState["requirementAssessments"]>,
  findings: Finding[],
  reasons: string[]
): string {
  const rows = assessments.slice(0, 12).map((assessment) => {
    const support = findings.find((finding) =>
      assessment.supportingFindingIds.includes(finding.findingId)
    );
    const evidence = support?.evidence[0];
    const citation = evidence
      ? ` — “${evidence.quotedText.replace(/\s+/g, " ").trim().slice(0, 320)}”`
      : "";
    return `- **${assessment.requirementId}: ${displayRequirementStatus(assessment)}.** ${assessment.summary}${citation}`;
  });
  const direct = findings
    .filter((finding) => finding.visibility !== "internal")
    .slice(0, 8)
    .map((finding) => `- **${finding.category}.** ${finding.claim}`);
  const content = rows.length > 0 ? rows : direct;
  return [
    "**Status: Analysis incomplete**",
    "",
    `The ${label.toLowerCase()} branch could not safely release its generated prose. Completed evidence-backed results are preserved below; other branches are unaffected.`,
    reasons.length > 0 ? `Reason: ${[...new Set(reasons)].join("; ")}.` : undefined,
    "",
    ...(content.length > 0 ? content : ["- No verified result was produced for this branch."]),
    "",
    `_Branch: ${facetId}; request: ${state.request.sessionId}_`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function stripLeadingDuplicateHeading(output: string, label: string): string {
  const lines = output.trim().split(/\r?\n/);
  const first = lines[0]?.replace(/^#+\s*/, "").trim().toLowerCase();
  if (first === label.trim().toLowerCase()) return lines.slice(1).join("\n").trim();
  return output.trim();
}
