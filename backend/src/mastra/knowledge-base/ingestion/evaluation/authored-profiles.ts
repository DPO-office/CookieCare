import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../../../../backend/src/modules/analysis/skills/runtime/catalog/types.js";
import { hashRevision, KB_SCHEMA_VERSION } from "../schemas/index.js";

export interface AuthoredComparisonInput {
  schemaVersion: typeof KB_SCHEMA_VERSION;
  purpose: "comparison_only";
  skillId: string;
  ruleId: string;
  provenance: {
    kind: "imported";
    sourcePath: string;
    skillVersion: string;
    profileVersion: string | null;
    declaredReviewStatus: "authored" | "legal_reviewed";
    contentHash: string;
  };
  requiresLegalReview: true;
  rawRule: SkillRegimeRule;
}

/** Preserve the entire serializable authored rule. No field is reinterpreted or approved. */
export function importAuthoredComparisons(skill: AnalysisSkillConfig, sourcePath: string, ruleIds: string[]): AuthoredComparisonInput[] {
  if (!sourcePath.trim()) throw new Error("Authored comparison source path is required");
  if (new Set(ruleIds).size !== ruleIds.length) throw new Error("Duplicate comparison rule ID");
  return ruleIds.map(ruleId => {
    const matches = skill.regimeRules.filter(rule => rule.ruleId === ruleId);
    if (matches.length !== 1) throw new Error(`Missing or ambiguous authored rule: ${ruleId}`);
    const rule = matches[0];
    if (!rule.investigation || !rule.authority) throw new Error(`Incomplete authored comparison input: ${ruleId}`);
    // The snapshot is a JSON artifact: optional undefined fields are absent, as in API serialization.
    const rawRule = JSON.parse(JSON.stringify(rule)) as SkillRegimeRule;
    return {
      schemaVersion: KB_SCHEMA_VERSION, purpose: "comparison_only", skillId: skill.skillId, ruleId,
      provenance: {
        kind: "imported", sourcePath, skillVersion: skill.version,
        profileVersion: rule.verification?.version ?? null,
        declaredReviewStatus: rule.verification?.reviewStatus ?? "authored", contentHash: hashRevision(rawRule),
      },
      requiresLegalReview: true, rawRule,
    };
  });
}
