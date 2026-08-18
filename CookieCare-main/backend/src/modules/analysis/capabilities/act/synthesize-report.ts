import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import type { ReportSpec, ReportSectionId } from "../../models/intent.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";
import { pacLog } from "../../utils/pac-log.js";

/**
 * Dynamic synthesis (ACT refactor doc §16). Produces the user-facing narrative
 * from RequirementAssessments + supporting findings + derived risks, structured
 * by ReportSpec.sections and depth. This replaces the finding-dump renderer for
 * the package path.
 *
 * Verbosity is structural, not token-math (doc §15): the depth cue and the
 * per-status content rules drive length, and the program only sets a safe
 * output ceiling for the provider call.
 */

const DEPTH_CEILING: Record<ReportSpec["depth"], number> = {
  narrow: 900,
  standard: 1800,
  deep: 3200,
};

const SECTION_LABELS: Record<ReportSectionId, string> = {
  scope_and_conclusion: "Scope and conclusion",
  chapeau_particulars: "Chapeau particulars",
  requirements_detail: "Requirements detail",
  qualifications: "Qualifications",
  recommendations: "Recommendations",
  missing_materials: "Missing materials",
};

export async function synthesizeReport(
  state: AnalysisState,
  findings: Finding[],
  reportSpec: ReportSpec
): Promise<string> {
  const assessments = state.requirementAssessments ?? [];
  const brief = buildSynthesisBrief(state, findings, assessments, reportSpec);
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const synthStart = Date.now();
  pacLog("synthesis prompt", {
    chars: brief.length,
    assessments: assessments.length,
    findings: findings.length,
    depth: reportSpec.depth,
  });

  try {
    const outcome = await executeBoundedCompletion(
      brief,
      "You are a senior-associate legal/compliance writer. Write a cohesive report " +
        "that directly answers the user's request, organized around the requirements " +
        "(never internal rule ids). Support conclusions with the supplied evidence; " +
        "distinguish covered / partial / missing / cannot determine; include " +
        "qualifications where evidence is incomplete or conflicting; give recommendations " +
        "only where justified. Use ONLY the requested sections and omit any that would be " +
        "empty. Introduce no new claim, right, timeframe, or citation not present in the " +
        "supplied assessments/findings. Never advise whether to sign or litigate.",
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI,
      {
        maxOutputTokens: DEPTH_CEILING[reportSpec.depth],
        onDelta: state.onToken,
        tracker,
      }
    );
    if (state.agent && tracker) state.agent.tokensUsed = tracker.tokensUsed;
    const text = outcome.text.trim();
    pacLog("synthesis llm", { ms: Date.now() - synthStart, outChars: text.length });
    if (text) return text;
  } catch (err) {
    console.warn("[synthesizeReport] synthesis failed; using deterministic brief:", err);
  }

  // Deterministic fallback keeps the pipeline resilient (doc §21): never fabricate.
  const fallback = buildDeterministicReport(state, assessments, reportSpec);
  emitAnalysisToken(state, fallback);
  return fallback;
}

function buildSynthesisBrief(
  state: AnalysisState,
  findings: Finding[],
  assessments: RequirementAssessment[],
  reportSpec: ReportSpec
): string {
  const sections = reportSpec.sections
    .map((id) => `- ${SECTION_LABELS[id]}`)
    .join("\n");

  const requirementBlocks = assessments.map((a) => {
    const supporting = findings.filter((f) =>
      a.supportingFindingIds.includes(f.findingId)
    );
    const evidence = supporting
      .flatMap((f) => f.evidence.map((e) => `    - "${e.quotedText.slice(0, 200)}"`))
      .slice(0, 4)
      .join("\n");
    return [
      `- Requirement: ${humanize(a.requirementId)}`,
      `  Status: ${a.status}`,
      `  Summary: ${a.summary}`,
      a.recommendation ? `  Recommendation: ${a.recommendation}` : "",
      evidence ? `  Evidence:\n${evidence}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  const risks = findings
    .filter((f) => f.kind === "risk" && f.visibility !== "internal")
    .map((f) => `- ${f.claim} (severity: ${f.severity ?? "n/a"})`);

  return [
    `User instruction: ${state.request.instruction}`,
    `Report type: ${reportSpec.reportType}`,
    `Depth: ${reportSpec.depth}`,
    "",
    "Produce ONLY these sections, in order, omitting any that would be empty:",
    sections,
    "",
    depthGuidance(reportSpec.depth),
    "",
    "Requirement assessments (authoritative — do not change these verdicts):",
    requirementBlocks.join("\n\n"),
    "",
    risks.length ? "Material risks:" : "",
    risks.join("\n"),
    "",
    reportSpec.reportType === "regime_compliance_memo" ||
    reportSpec.reportType === "risk_audit"
      ? "Begin with a direct bottom-line conclusion before the detail."
      : "Answer the user's question directly and concisely.",
  ]
    .filter(Boolean)
    .join("\n");
}

function depthGuidance(depth: ReportSpec["depth"]): string {
  switch (depth) {
    case "narrow":
      return "Depth = narrow: give the direct answer with concise evidence and minimal explanation.";
    case "deep":
      return "Depth = deep: answer, evidence, rationale, qualifications, material risks, recommendations, and missing materials where relevant.";
    case "standard":
    default:
      return "Depth = standard: answer, evidence, gap explanation where needed, and a concise recommendation.";
  }
}

/** Deterministic, evidence-faithful fallback used only if synthesis fails. */
function buildDeterministicReport(
  state: AnalysisState,
  assessments: RequirementAssessment[],
  reportSpec: ReportSpec
): string {
  const lines: string[] = [];
  lines.push(`# Analysis`, "");
  lines.push(`Instruction: ${state.request.instruction}`, "");
  if (reportSpec.sections.includes("scope_and_conclusion")) {
    const covered = assessments.filter((a) => a.status === "covered").length;
    lines.push("## Scope and conclusion", "");
    lines.push(
      `${covered} of ${assessments.length} requirements are covered based on the document evidence.`,
      ""
    );
  }
  lines.push("## Requirements detail", "");
  for (const a of assessments) {
    lines.push(`### ${humanize(a.requirementId)} — ${a.status}`, "");
    lines.push(a.summary, "");
    if (a.recommendation) lines.push(`Recommendation: ${a.recommendation}`, "");
  }
  return lines.join("\n");
}

function humanize(id: string): string {
  return id
    .replace(/^[a-z]+\.[a-z0-9.]+\./i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
