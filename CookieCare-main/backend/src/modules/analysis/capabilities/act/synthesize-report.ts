import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import type { ReportSpec } from "../../models/intent.js";
import {
  SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
} from "../../prompts/synthesis.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";
import { pacLog } from "../../utils/pac-log.js";
import { groupAssessmentsForReport } from "./group-assessments.js";

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

export async function synthesizeReport(
  state: AnalysisState,
  findings: Finding[],
  reportSpec: ReportSpec
): Promise<string> {
  const assessments = state.requirementAssessments ?? [];
  const brief = buildSynthesisUserPrompt(state, findings, assessments, reportSpec);
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
      SYNTHESIS_SYSTEM_PROMPT,
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
    pacLog("synthesis llm", {
      ms: Date.now() - synthStart,
      outChars: text.length,
      truncated: outcome.truncated,
      depth: reportSpec.depth,
      maxOutputTokens: DEPTH_CEILING[reportSpec.depth],
    });
    if (text) {
      if (outcome.truncated) {
        const note = `\n\n[Report ended at the length limit for ${reportSpec.depth} depth. Remaining detail was omitted.]`;
        emitAnalysisToken(state, note);
        return `${text}${note}`;
      }
      return text;
    }
  } catch (err) {
    console.warn("[synthesizeReport] synthesis failed; using deterministic brief:", err);
  }

  // Deterministic fallback keeps the pipeline resilient (doc §21): never fabricate.
  const fallback = buildDeterministicReport(state, assessments, reportSpec);
  emitAnalysisToken(state, fallback);
  return fallback;
}

/** Deterministic, evidence-faithful fallback used only if synthesis fails. */
function buildDeterministicReport(
  state: AnalysisState,
  assessments: RequirementAssessment[],
  reportSpec: ReportSpec
): string {
  const lines: string[] = [];
  const groups = groupAssessmentsForReport(assessments);
  lines.push(`# Analysis`, "");
  lines.push(`Instruction: ${state.request.instruction}`, "");
  if (reportSpec.sections.includes("scope_and_conclusion")) {
    const covered = assessments.filter((a) => a.status === "covered").length;
    lines.push("## Scope and conclusion", "");
    lines.push(
      `${covered} of ${assessments.length} requirements are covered based on the document evidence. Related requirements are grouped below.`,
      ""
    );
  }
  lines.push("## Requirements detail", "");
  for (const group of groups) {
    lines.push(`### ${group.title} — ${group.status}`, "");
    const summaries = [...new Set(group.members.map((m) => m.summary).filter(Boolean))];
    lines.push(summaries.join(" "), "");
    const rec = group.members.find((m) => m.recommendation)?.recommendation;
    if (rec) lines.push(`Recommendation: ${rec}`, "");
  }
  return lines.join("\n");
}
