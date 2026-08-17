import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { AnalysisSkillConfig } from "../../skills/types.js";
import { hasRegimeRule } from "../../skills/registry.js";

/** Resolve the authored target id for a work unit (rule, matrix row, or category). */
export function targetIdForUnit(unit: AnalysisWorkUnit): string | undefined {
  const ruleId = unit.input.ruleId ? String(unit.input.ruleId) : "";
  if (ruleId) return ruleId;
  const rowId = unit.input.rowId ? String(unit.input.rowId) : "";
  if (rowId) return rowId;
  const cats = unit.input.riskCategoryIds as string[] | undefined;
  if (cats?.length === 1) return cats[0];
  return undefined;
}

/** Whether any active skill declares authored content for this target. */
export function hasAuthoredContent(
  targetId: string | undefined,
  skills: AnalysisSkillConfig[]
): boolean {
  if (!targetId?.trim()) return true;

  if (targetId.startsWith("gdpr.") || targetId.includes(".art")) {
    const inActive = skills.some((skill) =>
      skill.regimeRules.some((rule) => rule.ruleId === targetId)
    );
    if (inActive) return true;
    return hasRegimeRule(targetId);
  }

  if (targetId.includes(".right.")) {
    return skills.some((skill) =>
      (skill.rightsMatrixRows ?? []).some((row) => row.rowId === targetId)
    );
  }

  return skills.some(
    (skill) =>
      skill.riskCategories.some((rc) => rc.category === targetId) ||
      skill.regimeRules.some((rule) => rule.findingCategory === targetId) ||
      skill.expectedClauses.some((ec) => ec.findingCategory === targetId)
  );
}
