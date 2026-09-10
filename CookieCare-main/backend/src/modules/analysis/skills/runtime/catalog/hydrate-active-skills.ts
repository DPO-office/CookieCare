import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisSkillConfig } from "./types.js";
import {
  mergeExpectedClauses,
  mergeRegimeRules,
  mergeSkillClauseTypes,
  mergeSkillRiskCategories,
  getRuntimeTaxonomies,
} from "./registry.js";
import { loadSkillMarkdownForSkills } from "./load-skill-md.js";

export interface HydrateActiveSkillsOptions {
  /** When true, refresh metadata taxonomy versions / skill versions. Default true. */
  updateMetadata?: boolean;
  /** Optional selection-path override applied with the hydrated skills. */
  skillSelectionPath?: AnalysisState["skillSelectionPath"];
  /** Optional partial-coverage warning to attach. */
  partialCoverageWarning?: AnalysisState["partialCoverageWarning"];
  /** Extra state fields to merge (attributions, clarification clears, etc.). */
  patch?: Partial<AnalysisState>;
}

/**
 * Canonical skill hydration: merge taxonomies + load SKILL.md for the active set.
 * Used by PLAN resolve-skills, ASK answer application, and org-memory defaults.
 */
export async function hydrateActiveSkills(
  state: AnalysisState,
  skills: AnalysisSkillConfig[],
  options: HydrateActiveSkillsOptions = {}
): Promise<AnalysisState> {
  const skillMd = await loadSkillMarkdownForSkills(skills);
  const updateMetadata = options.updateMetadata !== false;
  const runtime = updateMetadata ? getRuntimeTaxonomies() : undefined;

  return {
    ...state,
    ...options.patch,
    activeSkills: skills,
    activeSkillIds: skills.map((s) => s.skillId),
    mergedClauseTypes: mergeSkillClauseTypes(skills),
    mergedRiskCategories: mergeSkillRiskCategories(skills).map((r) => r.category),
    mergedExpectedClauses: mergeExpectedClauses(skills),
    mergedRegimeRules: mergeRegimeRules(skills),
    skillMarkdown: skillMd,
    skillSelectionPath: options.skillSelectionPath ?? state.skillSelectionPath,
    partialCoverageWarning:
      options.partialCoverageWarning !== undefined
        ? options.partialCoverageWarning
        : state.partialCoverageWarning,
    metadata: updateMetadata
      ? {
          ...state.metadata,
          clauseTaxonomyVersion:
            runtime?.clauseTaxonomyVersion ?? state.metadata.clauseTaxonomyVersion,
          riskTaxonomyVersion:
            runtime?.riskTaxonomyVersion ?? state.metadata.riskTaxonomyVersion,
          activeSkillVersions: Object.fromEntries(
            skills.map((s) => [s.skillId, s.version])
          ),
        }
      : state.metadata,
  };
}
