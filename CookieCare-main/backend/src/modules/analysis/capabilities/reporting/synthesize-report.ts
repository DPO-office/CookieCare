import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState, ReportSectionBlock } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import type { ReportOutlineItem, ReportSpec } from "../../models/intent.js";
import {
  buildSectionSynthesisUserPrompt,
  synthesisSectionSystemPrompt,
} from "../../prompts/synthesis.js";
import {
  enforceConclusionSectionLast,
  normalizeReportSections,
  outlineItemSectionId,
  roleForSectionId,
  suggestedHeading,
} from "../../prompts/report-sections.js";
import { emitAnalysisToken, beginRenderStreaming } from "../../utils/stream-tokens.js";
import { pacLog } from "../../utils/pac-log.js";
import { groupAssessmentsForReport } from "../../shared/group-assessments.js";
import { filterAssessmentsByRequirementIds } from "../../shared/requirement-identity.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
import { resolveSectionMaxOutputTokens } from "../../utils/resolve-synthesis-ceiling.js";
import { createOrderedSectionStream } from "../../utils/ordered-section-stream.js";
import { runAnalyticalSynthesis } from "./analytical-synthesis.js";

export interface SynthesizeReportOptions {
  retrySectionIds?: string[];
}

function outlineItemsForSpec(spec: ReportSpec): ReportOutlineItem[] {
  if (spec.outline && spec.outline.length > 0) return spec.outline;
  return normalizeReportSections(spec.sections).map((id) => ({
    id,
    role: roleForSectionId(id),
    sectionId: id,
    heading: suggestedHeading(id),
    requirementIds: [],
    source: "deterministic" as const,
  }));
}

function assembleSections(blocks: ReportSectionBlock[]): string {
  return blocks
    .map((block) => block.markdown.trim())
    .filter(Boolean)
    .join("\n\n");
}

function ensureHeading(markdown: string, heading: string): string {
  const trimmed = markdown.trim();
  if (/^##\s+/.test(trimmed)) return trimmed;
  return `## ${heading}\n\n${trimmed}`;
}

/**
 * Dynamic synthesis: one LLM completion per finalized outline section, then assemble.
 */
export async function synthesizeReport(
  state: AnalysisState,
  findings: Finding[],
  reportSpec: ReportSpec,
  options: SynthesizeReportOptions = {}
): Promise<string> {
  const assessments = state.requirementAssessments ?? [];
  if (!state.analyticalSynthesis && assessments.length > 0) {
    state.analyticalSynthesis = await runAnalyticalSynthesis(state, assessments);
  }
  const items = outlineItemsForSpec(reportSpec);
  const retry = new Set(options.retrySectionIds ?? []);
  const prior = new Map((state.reportSections ?? []).map((block) => [block.id, block]));
  const synthStart = Date.now();
  beginRenderStreaming(state);
  const live = createOrderedSectionStream(items.length, (delta) =>
    emitAnalysisToken(state, delta)
  );

  pacLog("synthesis prompt", {
    chars: 0,
    sections: items.length,
    retry: retry.size,
    assessments: assessments.length,
    findings: findings.length,
    depth: reportSpec.depth,
    thinkingMode: state.analysisProfile?.thinkingMode ?? state.request.thinkingMode,
    answerStyle: state.request.answerStyle ?? "narrative",
  });

  const work = items.map(async (item, index): Promise<{
    block: ReportSectionBlock;
    tokensUsed: number;
    truncated: boolean;
  }> => {
    const reuse = retry.size > 0 && !retry.has(item.id) && prior.get(item.id);
    if (reuse) {
      live.push(index, reuse.markdown);
      live.close(index);
      return { block: reuse, tokensUsed: 0, truncated: false };
    }
    const perSection = resolveSectionMaxOutputTokens(state, reportSpec, item);
    const prompt = buildSectionSynthesisUserPrompt({
      state,
      findings,
      assessments,
      reportSpec,
      item,
    });
    const sectionTracker = { tokensUsed: 0 };
    try {
      const outcome = await executeBoundedCompletion(
        prompt,
        synthesisSectionSystemPrompt(state),
        LLMTask.REFINEMENT,
        LLMProvider.GEMINI,
        {
          maxOutputTokens: perSection,
          tracker: sectionTracker,
          thinkingLevel: profileThinkingLevel(state, LLMTask.REFINEMENT),
          onDelta: (delta) => live.push(index, delta),
        }
      );
      live.close(index);
      return {
        block: {
          id: item.id,
          heading: item.heading,
          markdown: ensureHeading(outcome.text.trim(), item.heading),
        },
        tokensUsed: sectionTracker.tokensUsed,
        truncated: outcome.truncated,
      };
    } catch (err) {
      console.warn(
        `[synthesizeReport] section ${item.id} failed; using deterministic fallback:`,
        err
      );
      const markdown = buildDeterministicSection(item, assessments, findings);
      live.push(index, markdown);
      live.close(index);
      return {
        block: {
          id: item.id,
          heading: item.heading,
          markdown,
        },
        tokensUsed: sectionTracker.tokensUsed,
        truncated: false,
      };
    }
  });

  const results = await Promise.all(work);
  const blocks: ReportSectionBlock[] = results.map((result) => result.block);
  const anyTruncated = results.some((result) => result.truncated);
  const maxSectionTokens = items.reduce((max, item) => {
    if (retry.size > 0 && !retry.has(item.id) && prior.get(item.id)) return max;
    return Math.max(max, resolveSectionMaxOutputTokens(state, reportSpec, item));
  }, 0);
  if (state.agent) {
    state.agent.tokensUsed += results.reduce((sum, result) => sum + result.tokensUsed, 0);
  }
  state.reportSections = blocks;
  state.synthesisMeta = {
    truncated: anyTruncated,
    maxOutputTokens: maxSectionTokens,
    depth: reportSpec.depth,
  };
  pacLog("synthesis llm", {
    ms: Date.now() - synthStart,
    outChars: blocks.reduce((n, b) => n + b.markdown.length, 0),
    truncated: anyTruncated,
    depth: reportSpec.depth,
    maxOutputTokens: maxSectionTokens,
    thinkingMode: state.analysisProfile?.thinkingMode ?? state.request.thinkingMode,
  });

  const assembled = enforceConclusionSectionLast(assembleSections(blocks));
  if (anyTruncated) {
    const note = `\n\n[Report ended at the length limit for ${reportSpec.depth} depth. Remaining detail was omitted.]`;
    emitAnalysisToken(state, note);
    return `${assembled}${note}`;
  }
  if (assembled.trim()) return assembled;

  const fallback = enforceConclusionSectionLast(
    buildDeterministicReport(state, assessments, reportSpec)
  );
  emitAnalysisToken(state, fallback);
  return fallback;
}

function buildDeterministicSection(
  item: ReportOutlineItem,
  assessments: RequirementAssessment[],
  findings: Finding[]
): string {
  const sectionId = outlineItemSectionId(item);
  const lines = [`## ${item.heading}`, ""];
  if (sectionId === "risk_summary") {
    const risks = findings.filter((f) => f.kind === "risk" && f.visibility !== "internal");
    if (risks.length === 0) lines.push("No user-facing material risks were flagged.", "");
    else for (const risk of risks) lines.push(`- ${risk.claim}`, "");
    return lines.join("\n");
  }
  const wanted = item.requirementIds;
  const sliced =
    wanted.length > 0
      ? filterAssessmentsByRequirementIds(assessments, wanted)
      : assessments;
  const groups = groupAssessmentsForReport(sliced);
  if (groups.length === 0) {
    lines.push("No mapped assessments for this section.", "");
    return lines.join("\n");
  }
  for (const group of groups) {
    lines.push(`- ${group.status}: ${group.title}`);
    const summaries = [...new Set(group.members.map((m) => m.summary).filter(Boolean))];
    if (summaries.length > 0) lines.push(summaries.join(" "));
    lines.push("");
  }
  return lines.join("\n");
}

/** Deterministic, evidence-faithful fallback used only if synthesis fails. */
function buildDeterministicReport(
  state: AnalysisState,
  assessments: RequirementAssessment[],
  reportSpec: ReportSpec
): string {
  const items = outlineItemsForSpec(reportSpec);
  return items
    .map((item) => buildDeterministicSection(item, assessments, state.findings ?? []))
    .join("\n");
}
