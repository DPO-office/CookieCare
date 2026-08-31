import crypto from "crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById, isKnownRiskCategory } from "../../skills/runtime/catalog/registry.js";

/**
 * Deterministic risk derivation (ACT refactor doc §10).
 *
 * A compliance gap mechanically implies a risk. Rather than spend another LLM
 * call to rediscover it, derive a risk finding directly from each authored
 * compliance gap whose category is a known risk category. Compliance truth and
 * risk interpretation stay separate layers (distinct Finding.kind), so the
 * renderer/synthesis can present them separately.
 *
 * LLM risk reasoning is intentionally reserved for cases where materiality spans
 * multiple findings or evidence conflicts — those are not mechanically implied
 * and are left to synthesis, not this deterministic pass.
 */
export function deriveRisk(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];

  const existingRiskCategories = new Set(
    findings.filter((f) => f.kind === "risk").map((f) => f.category)
  );

  const derived: Finding[] = [];
  const seen = new Set<string>(existingRiskCategories);

  for (const f of findings) {
    if (f.kind !== "compliance") continue;
    if (f.status !== "absent_expected") continue;
    const category = f.category;
    if (!category || seen.has(category)) continue;
    if (!isKnownRiskCategory(category)) continue;
    seen.add(category);

    derived.push({
      findingId: `f_risk_${category}_${crypto.randomUUID().slice(0, 6)}`,
      kind: "risk",
      category,
      status: "present",
      claim: `Compliance gap creates risk: ${displayLabel(skillIds, category)}.`,
      evidence: f.evidence,
      severity: f.severity ?? "medium",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId: f.skillId,
      visibility: "user_facing",
      ruleSourceTier: f.ruleSourceTier,
      requirementId: f.requirementId,
      gap: f.gap,
    });
  }

  return { state, findings: [...findings, ...derived] };
}

function displayLabel(skillIds: string[], category: string): string {
  for (const skillId of skillIds) {
    const skill = getSkillById(skillId);
    const rc = skill?.riskCategories.find((r) => r.category === category);
    if (rc) return rc.displayLabel;
  }
  return category.replace(/[._-]+/g, " ");
}
