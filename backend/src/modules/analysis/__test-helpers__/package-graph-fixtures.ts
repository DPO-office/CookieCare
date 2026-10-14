/**
 * Shared builders for package-graph / resolvePackages tests.
 * Keep helpers tiny and deterministic — no LLM.
 */
import assert from "node:assert/strict";
import { getSkillById, resetSkillRegistryForTests } from "../skills/runtime/catalog/registry.js";
import type { InstructionFocus } from "../models/analysis-plan.js";
import type { IntentClassification, IntentRequirement } from "../models/intent.js";
import type { AnalysisSkillConfig } from "../skills/runtime/catalog/types.js";

export function resetAndGetGdpr(): AnalysisSkillConfig {
  resetSkillRegistryForTests();
  const skill = getSkillById("regimes/data-protection/gdpr");
  assert.ok(skill, "GDPR skill must be registered");
  return skill!;
}

/** Alias used by some suites. */
export const gdprSkill = resetAndGetGdpr;
export const gdpr = resetAndGetGdpr;

export function bothSkills(): AnalysisSkillConfig[] {
  resetSkillRegistryForTests();
  return [
    getSkillById("regimes/data-protection/gdpr")!,
    getSkillById("regimes/data-protection/international-transfers")!,
  ];
}

export function packageGraphIntent(
  requirements: IntentRequirement[] = []
): IntentClassification {
  return {
    scope: "whole_document",
    operation: "compliance_check",
    standard: "regime_pack:gdpr",
    outputForm: "memo",
    compound: false,
    subIntents: [],
    requirements,
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
  };
}

/** Alias used by some suites. */
export const intent = packageGraphIntent;

export function packageGraphFocus(
  partial: Partial<InstructionFocus>,
  defaults?: { instructionText?: string }
): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText:
      defaults?.instructionText ??
      partial.instructionText ??
      "Review the DPA for GDPR Article 28 compliance.",
    ...partial,
  };
}

/** Alias used by some suites. */
export function focus(partial: Partial<InstructionFocus>): InstructionFocus {
  return packageGraphFocus(partial);
}
