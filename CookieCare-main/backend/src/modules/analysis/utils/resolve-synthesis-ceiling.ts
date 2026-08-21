import type { AnalysisState } from "../models/analysis-state.js";
import type { ReportSpec } from "../models/intent.js";
import { normalizeReportSections } from "../prompts/report-sections.js";
import { getAnalysisProfile } from "./profile-thinking.js";

/** Base ceilings keyed only by ReportSpec.depth (structural semantics unchanged). */
export const DEPTH_CEILING: Record<ReportSpec["depth"], number> = {
  narrow: 900,
  standard: 1800,
  deep: 3200,
};

const COMPLEXITY_BONUS_CAP = 1200;
const TRUNCATION_RETRY_BUMP = 1.25;

/**
 * Profile- and complexity-aware synthesis maxOutputTokens.
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

  // One bump when re-rendering after a truncated synthesis (still hard-capped).
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
