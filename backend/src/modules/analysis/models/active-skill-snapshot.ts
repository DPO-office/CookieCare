import type { AnalysisSkillConfig } from "../skills/runtime/catalog/types.js";

/**
 * Slim view of an active skill for future state hydration.
 *
 * Evaluation (Phase 8): AnalysisState currently embeds full
 * `AnalysisSkillConfig[]`. Migrating to this snapshot would shrink ledger
 * payloads, but requires API + job-handler consumer audit. Do not wire into
 * AnalysisState until that audit is complete.
 */
export interface ActiveSkillSnapshot {
  skillId: string;
  version: string;
  axis: AnalysisSkillConfig["axis"];
  label: string;
  /** Package ids available from this skill (not full package payloads). */
  evidencePackageIds: string[];
  /** Rule ids available from this skill. */
  regimeRuleIds: string[];
}

export function toActiveSkillSnapshot(
  skill: AnalysisSkillConfig
): ActiveSkillSnapshot {
  return {
    skillId: skill.skillId,
    version: skill.version,
    axis: skill.axis,
    label: skill.label,
    evidencePackageIds: (skill.evidencePackages ?? []).map((p) => p.id),
    regimeRuleIds: (skill.regimeRules ?? []).map((r) => r.ruleId),
  };
}
