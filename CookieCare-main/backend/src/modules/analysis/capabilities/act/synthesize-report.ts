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
import { normalizeReportSections, suggestedHeading } from "../../prompts/report-sections.js";
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

  const sections = normalizeReportSections(reportSpec.sections);
  if (sections.includes("scope")) {
    lines.push(`## ${suggestedHeading("scope")}`, "");
    lines.push(
      `Review of ${assessments.length} requirement(s) against the supplied document(s).`,
      ""
    );
  }

  if (sections.includes("requirements_detail")) {
    lines.push(`## ${suggestedHeading("requirements_detail")}`, "");
    const outline = reportSpec.outline ?? [];
    const outlineAnalysisItems = outline.filter(
      (item) => item.role === "analysis" || item.role === "chapeau_particulars"
    );

    if (outlineAnalysisItems.length > 0) {
      const buckets = outlineAnalysisItems.map((item) => ({
        item,
        groups: [] as typeof groups,
        requirementSet: new Set(item.requirementIds),
      }));

      for (const group of groups) {
        const memberReqIds = new Set(group.members.map((m) => m.requirementId));
        let bestIdx = 0;
        let bestScore = -1;
        for (let i = 0; i < buckets.length; i++) {
          let score = 0;
          for (const id of memberReqIds) {
            if (buckets[i]!.requirementSet.has(id)) score += 1;
          }
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        buckets[bestIdx]!.groups.push(group);
      }

      for (const bucket of buckets) {
        if (bucket.groups.length === 0) continue;
        lines.push(`### ${bucket.item.heading}`, "");
        for (const group of bucket.groups) {
          lines.push(`- ${group.status}: ${group.title}`, "");
          const summaries = [
            ...new Set(group.members.map((m) => m.summary).filter(Boolean)),
          ];
          if (summaries.length > 0) lines.push(summaries.join(" "), "");
        }
      }
    } else {
      for (const group of groups) {
        lines.push(`### ${group.title} — ${group.status}`, "");
        const summaries = [...new Set(group.members.map((m) => m.summary).filter(Boolean))];
        lines.push(summaries.join(" "), "");
        const rec = group.members.find((m) => m.recommendation)?.recommendation;
        if (rec) lines.push(`Recommendation: ${rec}`, "");
      }
    }
  }

  if (sections.includes("conclusion")) {
    const covered = assessments.filter((a) => a.status === "covered").length;
    lines.push(`## ${suggestedHeading("conclusion")}`, "");
    lines.push(
      `${covered} of ${assessments.length} requirements are covered based on the document evidence.`,
      ""
    );
  }

  return lines.join("\n");
}
