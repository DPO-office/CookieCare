import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimeTaxonomies,
  getRuntimeTaxonomies,
  getSkillById,
  getSkillRegistry,
  isKnownRiskCategory,
  loadAllSkillConfigs,
  resetSkillRegistryForTests,
} from "../src/modules/analysis/skills/runtime/catalog/registry.js";

describe("skill registry", () => {
  it("loads authored skills at boot and resolves legacy aliases", () => {
    const registry = loadAllSkillConfigs();
    assert.ok(Object.keys(registry).length >= 3);
    assert.ok(getSkillById("general-review"));
    assert.ok(getSkillById("commercial"));
    assert.ok(getSkillById("privacy-gdpr-dpa"));
    assert.equal(getSkillById("general-review")?.skillId, "_global");
    assert.equal(
      getSkillById("privacy-gdpr-dpa")?.skillId,
      "regimes/data-protection/gdpr"
    );
  });

  it("builds runtime taxonomy union from skills", () => {
    resetSkillRegistryForTests();
    const global = getSkillById("_global")!;
    const runtime = buildRuntimeTaxonomies([global]);
    assert.ok(runtime.clauseTypes.includes("indemnity"));
    assert.ok(runtime.riskCategories.includes("missing_limitation_of_liability"));
  });

  it("getRuntimeTaxonomies includes skill-specific categories", () => {
    const runtime = getRuntimeTaxonomies();
    assert.ok(runtime.clauseTypes.length > 10);
    assert.ok(isKnownRiskCategory("missing_limitation_of_liability"));
  });

  it("finds skills by prompt library category id", () => {
    const privacy = getSkillById("privacy-gdpr-dpa");
    assert.ok(privacy);
    assert.equal(privacy.skillId, "regimes/data-protection/gdpr");
    assert.ok(Object.keys(getSkillRegistry()).length >= 3);
  });
});
