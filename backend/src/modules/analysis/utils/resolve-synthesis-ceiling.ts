import type { AnalysisState } from "../models/analysis-state.js";
import type { ReportOutlineItem, ReportSpec } from "../models/intent.js";
import {
  isAnalysisOutlineRole,
  isAnalysisSectionId,
  isCaveatSectionId,
  isOpeningSectionId,
  normalizeReportSections,
  outlineItemSectionId,
} from "../prompts/report-sections.js";
import { getAnalysisProfile } from "./profile-thinking.js";

/** Base ceilings keyed only by ReportSpec.depth (structural semantics unchanged). */
export const DEPTH_CEILING: Record<ReportSpec["depth"], number> = {
  narrow: 900,
  standard: 1800,
  deep: 3200,
};

const COMPLEXITY_BONUS_CAP = 1200;
const TRUNCATION_RETRY_BUMP = 1.25;

/** Minimum tokens per section role so mid-sentence cuts stop being the default. */
const SECTION_FLOOR: Record<string, number> = {
  opening: 900,
  analysis: 1800,
  gaps: 1400,
  caveats: 1000,
  evidence: 1000,
  risk: 900,
  conclusion: 1200,
  default: 1000,
};

/**
 * Profile- and complexity-aware synthesis maxOutputTokens for whole-report math.
 * Never below today's depth base; never above the profile hard cap.
 */
export function resolveSynthesisMaxOutputTokens(
  state: AnalysisState,
  reportSpec: ReportSpec
): number {
  const profile = getAnalysisProfile(state);
  const base = DEPTH_CEILING[reportSpec.depth];
  const assessments = state.requirementAssessments?.length ?? 0;
  const sections = normalizeReportSections(reportSpec.sections).length;
  const complexityBonus = Math.min(
    COMPLEXITY_BONUS_CAP,
    assessments * 80 + sections * 100
  );
  let ceiling = Math.round(
    base * profile.synthesisCeilingFactor + complexityBonus
  );
  ceiling = Math.max(base, Math.min(profile.synthesisHardCap, ceiling));

  if (
    state.synthesisMeta?.truncated &&
    state.fixPlan?.targetedOnly &&
    state.repairContext?.kind === "synthesis"
  ) {
    ceiling = Math.min(
      profile.synthesisHardCap,
      Math.round(ceiling * TRUNCATION_RETRY_BUMP)
    );
  }

  return ceiling;
}

function sectionTokenFloor(
  item: ReportOutlineItem,
  depth: ReportSpec["depth"]
): number {
  const sectionId = outlineItemSectionId(item);
  const narrowFactor = depth === "narrow" ? 0.7 : 1;
  let key = "default";
  if (isOpeningSectionId(sectionId)) key = "opening";
  else if (isAnalysisOutlineRole(item.role) || isAnalysisSectionId(sectionId)) {
    key = "analysis";
  } else if (
    sectionId === "material_gaps" ||
    sectionId === "recommendations" ||
    sectionId === "missing_materials"
  ) {
    key = "gaps";
  } else if (isCaveatSectionId(sectionId)) key = "caveats";
  else if (sectionId === "evidence") key = "evidence";
  else if (sectionId === "risk_summary") key = "risk";
  else if (sectionId === "conclusion") key = "conclusion";

  return Math.max(400, Math.round((SECTION_FLOOR[key] ?? SECTION_FLOOR.default) * narrowFactor));
}

/**
 * Per-section budget for dynamic synthesis.
 * Does NOT divide the report ceiling by section count (that starved long sections).
 * Each section gets at least a role floor, at most the profile hard cap.
 */
export function resolveSectionMaxOutputTokens(
  state: AnalysisState,
  reportSpec: ReportSpec,
  item: ReportOutlineItem
): number {
  const profile = getAnalysisProfile(state);
  const reportCeiling = resolveSynthesisMaxOutputTokens(state, reportSpec);
  const floor = sectionTokenFloor(item, reportSpec.depth);
  // Prefer enough room to finish a table/section; use report ceiling as a soft upper preference.
  let tokens = Math.max(floor, Math.min(reportCeiling, Math.round(floor * 1.15)));
  tokens = Math.min(profile.synthesisHardCap, tokens);

  if (
    state.synthesisMeta?.truncated &&
    state.fixPlan?.targetedOnly &&
    state.repairContext?.kind === "synthesis" &&
    Array.isArray(state.fixPlan.items) &&
    state.fixPlan.items.some(
      (fix) =>
        fix.retrySectionIds?.includes(item.id) ||
        fix.sourceItemId?.includes("report-output")
    )
  ) {
    tokens = Math.min(
      profile.synthesisHardCap,
      Math.round(tokens * TRUNCATION_RETRY_BUMP)
    );
  }

  return tokens;
}
