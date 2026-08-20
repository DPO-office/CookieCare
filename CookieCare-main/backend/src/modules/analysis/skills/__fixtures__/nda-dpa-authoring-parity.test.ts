/**
 * Authoring parity: NDA / DPA structural_review packages stay internally consistent.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../registry.js";
import type { AnalysisSkillConfig } from "../types.js";

function skill(id: string): AnalysisSkillConfig {
  resetSkillRegistryForTests();
  const found = getSkillById(id);
  assert.ok(found, `${id} must be registered`);
  return found!;
}

function assertStructuralReviewParity(config: AnalysisSkillConfig, packageId: string): void {
  const pkg = (config.evidencePackages ?? []).find((p) => p.id === packageId);
  assert.ok(pkg, `${config.skillId} must author ${packageId}`);
  const authoredIds = new Set((config.authoredRequirements ?? []).map((r) => r.id));
  assert.ok(authoredIds.size > 0, `${config.skillId} must declare authoredRequirements`);
  for (const reqId of pkg!.requirementIds) {
    assert.ok(
      authoredIds.has(reqId),
      `${packageId} requirement "${reqId}" is missing from authoredRequirements`
    );
  }
  const ruleIds = new Set(config.regimeRules.map((r) => r.ruleId));
  for (const capId of pkg!.capabilityIds) {
    assert.ok(
      ruleIds.has(capId),
      `${packageId} capability "${capId}" is not a regimeRules[].ruleId on ${config.skillId}`
    );
  }
  assert.ok(
    (pkg!.report?.sections?.length ?? 0) > 0,
    `${packageId} must declare report.sections`
  );
}

describe("NDA / DPA structural_review authoring parity", () => {
  it("keeps nda.structural_review requirementIds and capabilityIds in-skill", () => {
    assertStructuralReviewParity(skill("doc-types/nda"), "nda.structural_review");
  });

  it("keeps dpa.structural_review requirementIds and capabilityIds in-skill", () => {
    assertStructuralReviewParity(skill("doc-types/dpa"), "dpa.structural_review");
  });
});
