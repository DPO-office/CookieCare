import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRegistryApi, resetSkillRegistryForTests } from "../runtime/catalog/registry.js";
import { assertInvestigationProfileQualityBudget } from "../runtime/lint/audit-investigation-profiles.js";

describe("rule-first contract parity for every regime skill", () => {
  resetSkillRegistryForTests();
  const regimes = getRegistryApi().getByAxis("regime");

  it("keeps one complete atomic investigation contract per rule", () => {
    assert.equal(regimes.length, 7);
    for (const skill of regimes) {
      assert.ok(skill.regimeRules.length > 0, `${skill.skillId} has no atomic rules`);
      for (const rule of skill.regimeRules) {
        assert.ok(rule.authority?.instrument.trim(), `${skill.skillId}/${rule.ruleId} missing instrument`);
        assert.ok(rule.authority?.citation.trim(), `${skill.skillId}/${rule.ruleId} missing citation`);
        assert.ok(rule.authority?.provisionPath.length, `${skill.skillId}/${rule.ruleId} missing provision path`);
        assert.ok(
          (rule.selection?.aliases.length ?? 0) + (rule.selection?.concepts.length ?? 0) > 0,
          `${skill.skillId}/${rule.ruleId} missing selection vocabulary`
        );
        assert.ok(rule.investigation?.hypothesis.trim(), `${skill.skillId}/${rule.ruleId} missing hypothesis`);
        assert.ok(rule.investigation?.proofStandard.trim(), `${skill.skillId}/${rule.ruleId} missing proof standard`);
        assert.ok(rule.investigation?.evidenceHints.length, `${skill.skillId}/${rule.ruleId} missing evidence hints`);
        assert.ok(
          rule.investigation?.proofElements.some((element) => element.required),
          `${skill.skillId}/${rule.ruleId} missing required proof element`
        );
      }
    }
  });

  it("keeps compositions as valid shortcuts to local rules", () => {
    for (const skill of regimes) {
      const known = new Set(skill.regimeRules.map((rule) => rule.ruleId));
      for (const composition of skill.compositions ?? []) {
        assert.ok(composition.aliases.length > 0, `${skill.skillId}/${composition.id} has no aliases`);
        assert.ok(composition.ruleIds.length > 0, `${skill.skillId}/${composition.id} has no rules`);
        for (const ruleId of composition.ruleIds) {
          assert.ok(known.has(ruleId), `${skill.skillId}/${composition.id} references ${ruleId}`);
        }
      }
    }
  });

  it("does not allow investigation-profile quality debt to grow", () => {
    assertInvestigationProfileQualityBudget();
  });
});
