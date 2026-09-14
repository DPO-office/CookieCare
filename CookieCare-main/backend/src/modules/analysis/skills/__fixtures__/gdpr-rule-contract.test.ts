/**
 * Skill-contract parity for the GDPR rule-first migration: every rule with a
 * populated `investigation` profile must carry a complete, resolvable
 * contract, and every composition must reference real rule ids on the skill.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../runtime/catalog/registry.js";
import { GDPR_RULE_INVESTIGATION } from "../regimes/data-protection/gdpr/rule-investigation.js";

describe("GDPR rule-first contract parity", () => {
  resetSkillRegistryForTests();
  const gdpr = getSkillById("regimes/data-protection/gdpr")!;

  it("is registered and carries regimeRules + compositions", () => {
    assert.ok(gdpr, "GDPR skill must be registered");
    assert.ok(gdpr.regimeRules.length > 0);
    assert.ok((gdpr.compositions ?? []).length > 0);
  });

  it("every regimeRule has a unique ruleId", () => {
    const ids = gdpr.regimeRules.map((rule) => rule.ruleId);
    assert.equal(new Set(ids).size, ids.length, "duplicate ruleId found in GDPR regimeRules");
  });

  it("every regimeRule has structured authority with a citation", () => {
    for (const rule of gdpr.regimeRules) {
      assert.ok(rule.authority, `${rule.ruleId} missing authority`);
      assert.ok(rule.authority!.citation, `${rule.ruleId} missing authority.citation`);
      assert.ok(rule.authority!.provisionPath.length > 0, `${rule.ruleId} missing provisionPath`);
      assert.equal(rule.authority!.instrument, "GDPR");
    }
  });

  it("every regimeRule has at least one selection alias or concept", () => {
    for (const rule of gdpr.regimeRules) {
      assert.ok(rule.selection, `${rule.ruleId} missing selection`);
      const hasAliasOrConcept =
        (rule.selection!.aliases?.length ?? 0) > 0 || (rule.selection!.concepts?.length ?? 0) > 0;
      assert.ok(hasAliasOrConcept, `${rule.ruleId} has no selection alias or concept`);
    }
  });

  it("every regimeRule has a populated investigation profile with a required proof element", () => {
    for (const rule of gdpr.regimeRules) {
      assert.ok(rule.investigation, `${rule.ruleId} missing investigation profile`);
      assert.ok(rule.investigation!.hypothesis.trim().length > 0, `${rule.ruleId} missing hypothesis`);
      assert.ok(rule.investigation!.proofStandard.trim().length > 0, `${rule.ruleId} missing proofStandard`);
      assert.ok(rule.investigation!.proofElements.length > 0, `${rule.ruleId} has no proofElements`);
      assert.ok(
        rule.investigation!.proofElements.some((element) => element.required),
        `${rule.ruleId} has no REQUIRED proofElement`
      );
    }
  });

  it("authors an explicit investigation profile for every GDPR rule", () => {
    for (const rule of gdpr.regimeRules) {
      assert.ok(
        GDPR_RULE_INVESTIGATION[rule.ruleId],
        `${rule.ruleId} is falling back to a generated investigation profile`
      );
    }
  });

  it("models all Article 33 notification particulars as atomic rules", () => {
    const ids = new Set(gdpr.regimeRules.map((rule) => rule.ruleId));
    for (const id of [
      "gdpr.art33.1",
      "gdpr.art33.2",
      "gdpr.art33.3",
      "gdpr.art33.4",
      "gdpr.art33.5",
    ]) {
      assert.ok(ids.has(id), `${id} is missing from the GDPR catalog`);
      const elements = gdpr.regimeRules.find((rule) => rule.ruleId === id)!.investigation!.proofElements;
      assert.ok(elements.length > 1, `${id} must not collapse its compound proof into one primary element`);
      assert.ok(elements.every((element) => element.id !== "primary"));
    }
  });

  it("decomposes data-subject-rights review into independently provable elements", () => {
    for (const id of [
      "gdpr.art12.3",
      "gdpr.art15",
      "gdpr.art16",
      "gdpr.art17",
      "gdpr.art18",
      "gdpr.art19",
      "gdpr.art20",
      "gdpr.art21",
      "gdpr.art22",
      "gdpr.art28.3.e",
    ]) {
      const elements = gdpr.regimeRules.find((rule) => rule.ruleId === id)!.investigation!.proofElements;
      assert.ok(elements.length > 1, `${id} must expose element-level coverage`);
      assert.ok(elements.every((element) => element.id !== "primary"));
    }
  });

  it("every composition's ruleIds exist on this skill", () => {
    const knownRuleIds = new Set(gdpr.regimeRules.map((rule) => rule.ruleId));
    for (const composition of gdpr.compositions ?? []) {
      assert.ok(composition.ruleIds.length > 0, `${composition.id} has no ruleIds`);
      for (const ruleId of composition.ruleIds) {
        assert.ok(knownRuleIds.has(ruleId), `composition ${composition.id} references unknown rule ${ruleId}`);
      }
      assert.ok(composition.aliases.length > 0, `${composition.id} has no aliases`);
    }
  });

  it("the rights matrix package is not represented as a compliance composition", () => {
    for (const composition of gdpr.compositions ?? []) {
      assert.notEqual(composition.id, "gdpr.dsr.rights_matrix");
      assert.ok(
        !composition.ruleIds.includes("data_subject_rights"),
        "the matrix's umbrella id must never appear as a rule-first composition member"
      );
    }
  });

  it("every rule's relationships reference real rule ids", () => {
    const knownRuleIds = new Set(gdpr.regimeRules.map((rule) => rule.ruleId));
    for (const rule of gdpr.regimeRules) {
      for (const requiredId of rule.relationships?.requires ?? []) {
        assert.ok(knownRuleIds.has(requiredId), `${rule.ruleId} requires unknown rule ${requiredId}`);
      }
      for (const supportedId of rule.relationships?.supports ?? []) {
        assert.ok(knownRuleIds.has(supportedId), `${rule.ruleId} supports unknown rule ${supportedId}`);
      }
      for (const relatedId of rule.relationships?.relatedTo ?? []) {
        assert.ok(knownRuleIds.has(relatedId), `${rule.ruleId} relatedTo unknown rule ${relatedId}`);
      }
    }
  });
});
