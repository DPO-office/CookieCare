/**
 * Gate tests for PLAN-time injection of doc-type authoredRequirements.
 * Deterministic — no LLM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { injectAuthoredRequirements } from "../inject-authored-requirements.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import type { InstructionFocus } from "../../../models/analysis-plan.js";
import type { IntentClassification } from "../../../models/intent.js";

function baseIntent(partial: Partial<IntentClassification> = {}): IntentClassification {
  return {
    scope: "whole_document",
    operation: "compliance_check",
    standard: "none",
    outputForm: "memo",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    ...partial,
  };
}

function emptyFocus(partial: Partial<InstructionFocus> = {}): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText: "Analyse this NDA",
    ...partial,
  };
}

function skill(id: string) {
  resetSkillRegistryForTests();
  const found = getSkillById(id);
  assert.ok(found, `${id} must be registered`);
  return found!;
}

describe("injectAuthoredRequirements", () => {
  it("injects NDA authored requirements for a broad review with no classifier requirements", () => {
    const nda = skill("doc-types/nda");
    const result = injectAuthoredRequirements(baseIntent(), [nda], emptyFocus());
    const ids = result.requirements.map((r) => r.id);
    assert.deepEqual(ids, (nda.authoredRequirements ?? []).map((r) => r.id));
    assert.equal(ids.length, 6);
    assert.equal(ids[0], "nda.confidentiality_definition");
    assert.equal(ids[5], "nda.governing_law");
  });

  it("does not inject when the classifier already produced requirements", () => {
    const nda = skill("doc-types/nda");
    const existing = [
      {
        id: "user.asked.term",
        description: "Check the term.",
        type: "adequacy" as const,
        priority: "required" as const,
      },
    ];
    const result = injectAuthoredRequirements(
      baseIntent({ requirements: existing }),
      [nda],
      emptyFocus()
    );
    assert.deepEqual(result.requirements, existing);
  });

  it("does not inject when the user focused a named rule", () => {
    const nda = skill("doc-types/nda");
    const result = injectAuthoredRequirements(
      baseIntent(),
      [nda],
      emptyFocus({ ruleIds: ["nda.ci_definition"] })
    );
    assert.deepEqual(result.requirements, []);
  });

  it("does not inject when explicit article scope is set", () => {
    const nda = skill("doc-types/nda");
    const result = injectAuthoredRequirements(
      baseIntent(),
      [nda],
      emptyFocus({
        explicitScope: {
          articles: [28],
          contextArticles: [],
          allowCrossReferencedContext: false,
          allowOutOfScopeRules: false,
        },
      })
    );
    assert.deepEqual(result.requirements, []);
  });

  it("does not inject when only a regime skill is active", () => {
    const gdpr = skill("regimes/data-protection/gdpr");
    const result = injectAuthoredRequirements(baseIntent(), [gdpr], emptyFocus());
    assert.deepEqual(result.requirements, []);
  });

  it("injects only doc-type authored requirements when NDA and GDPR are both active", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda")!;
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const result = injectAuthoredRequirements(
      baseIntent(),
      [nda, gdpr],
      emptyFocus()
    );
    const ids = result.requirements.map((r) => r.id);
    assert.deepEqual(ids, (nda.authoredRequirements ?? []).map((r) => r.id));
    assert.ok(ids.every((id) => id.startsWith("nda.")));
    assert.ok(!ids.some((id) => id.startsWith("gdpr.")));
  });
});
