process.env.GOOGLE_CLOUD_PROJECT ??= "urgent-analysis-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IntentClassification } from "../../models/intent.js";
import {
  containsInternalAnalysisLeak,
  sanitizeRenderedAnalysisOutput,
} from "../../utils/response-safety.js";
import {
  heuristicClassify,
  isBriefSummaryInstruction,
} from "../../capabilities/plan/intent-heuristics.js";
import { buildActGraphDetailed } from "../runtime/graph/build-act-graph.js";
import {
  extractArticleNumbers,
  extractInstructionFocus,
  normalizeForMatch,
} from "../runtime/focus/extract-instruction-focus.js";
import { assertSkillParity } from "../runtime/lint/lint-skill-parity.js";
import { getSkillById, resetSkillRegistryForTests } from "../runtime/catalog/registry.js";

const REPRODUCTION =
  "Review how this agreement addresses data subject rights under GDPR Articles 15–22, including response timeframes.";

const INTENT: IntentClassification = {
  scope: "whole_document",
  operation: "compliance_check",
  standard: "regime_pack:regimes/data-protection/gdpr",
  outputForm: "memo",
  compound: false,
  subIntents: [],
  requirements: [],
  confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
};

describe("urgent Analysis ACT output regressions", () => {
  it("normalizes all dash variants consistently", () => {
    assert.equal(normalizeForMatch("Articles 15–22"), "articles 15-22");
    assert.equal(normalizeForMatch("Articles 15—22"), "articles 15-22");
    assert.equal(normalizeForMatch("Articles 15 - 22"), "articles 15-22");
  });

  for (const instruction of [
    "Review GDPR Articles 15–22.",
    "Review GDPR Articles 15-22.",
    "Review GDPR Articles 15 to 22.",
    "Review GDPR Articles 15, 16, 17, 18, 19, 20, 21, 22.",
    "Review GDPR Articles 15 16 17 18 19 20 21 22.",
    "Review GDPR Articles 15, 16, 17, 18, 19, 20, 21 and 22.",
  ]) {
    it(`resolves DSR focus for: ${instruction}`, async () => {
      resetSkillRegistryForTests();
      const gdpr = getSkillById("regimes/data-protection/gdpr")!;
      const focus = await extractInstructionFocus(instruction, [gdpr]);
      assert.ok(focus);
      assert.deepEqual(
        [...focus!.ruleIds].sort(),
        ["gdpr.art12.3", "gdpr.art28.3.e"].sort()
      );
      assert.equal(focus!.matrixRowIds.length, 8);
      assert.ok(!focus!.riskCategoryIds.includes("cost_allocation_silent"));
    });
  }

  it("parses a constrained whitespace article list without broadening scope", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const instruction =
      "Give me a brief overview of GDPR articles 15 16 17, nothing more than that.";
    assert.deepEqual(extractArticleNumbers(instruction), [15, 16, 17]);
    const focus = await extractInstructionFocus(instruction, [gdpr]);
    assert.ok(focus);
    assert.deepEqual(focus!.ruleIds, []);
    assert.deepEqual(focus!.matrixRowIds, [
      "gdpr.right.access",
      "gdpr.right.rectification",
      "gdpr.right.erasure",
    ]);
    assert.deepEqual(focus!.riskCategoryIds, []);
    assert.deepEqual(
      extractArticleNumbers("Only Articles 15-17, 20 and 22"),
      [15, 16, 17, 20, 22]
    );
    assert.deepEqual(extractArticleNumbers("Review GDPR Art.15 16 17"), [15, 16, 17]);
  });

  it("selects brief_summary and schedules only requested articles", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const instruction =
      "Give me a brief overview of GDPR article 15 16 17, nothing more than that.";
    assert.equal(isBriefSummaryInstruction(instruction), true);
    assert.equal(heuristicClassify(instruction).outputForm, "brief_summary");
    const focus = await extractInstructionFocus(instruction, [gdpr]);
    const graph = buildActGraphDetailed({
      docId: "cisco-dpa",
      instruction,
      skills: [gdpr],
      intent: { ...INTENT, outputForm: "brief_summary" },
      focus,
    });
    assert.equal(graph.rendererSchemaId, "brief_summary");
    assert.deepEqual(
      graph.workUnits
        .filter((unit) => unit.tool === "evaluate_matrix_row")
        .map((unit) => String(unit.input.article)),
      ["15", "16", "17"]
    );
    assert.equal(
      graph.workUnits.filter(
        (unit) =>
          unit.tool === "check_against_rule" || unit.tool === "flag_risk"
      ).length,
      0
    );
  });

  it("reproduction graph runs only focused rules and matrix rows", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const focus = await extractInstructionFocus(REPRODUCTION, [gdpr]);
    const graph = buildActGraphDetailed({
      docId: "cisco-dpa",
      instruction: REPRODUCTION,
      skills: [gdpr],
      intent: INTENT,
      focus,
    });

    const ruleIds = graph.workUnits
      .filter((unit) => unit.tool === "check_against_rule")
      .map((unit) => String(unit.input.ruleId));
    assert.deepEqual(ruleIds.sort(), ["gdpr.art12.3"]);
    assert.ok(!ruleIds.some((ruleId) => /^gdpr\.art(?:5|6|7|8|9|10|11|13|14|24)/.test(ruleId)));
    assert.equal(
      graph.workUnits.filter((unit) => unit.tool === "evaluate_matrix_row").length,
      8
    );
    const adjacentRiskUnit = graph.workUnits.find(
      (unit) =>
        unit.tool === "flag_risk" &&
        Array.isArray(unit.input.riskCategoryIds) &&
        (unit.input.riskCategoryIds as string[]).includes("cost_allocation_silent")
    );
    assert.equal(
      adjacentRiskUnit,
      undefined,
      "a focused compliance graph must not inject an unrequested adjacent risk"
    );
  });

  it("compound sub-intents stay inside the instruction focus", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const focus = await extractInstructionFocus(REPRODUCTION, [gdpr]);
    const compoundIntent: IntentClassification = {
      ...INTENT,
      compound: true,
      subIntents: Array.from({ length: 9 }, (_, index) => ({
        operation: "compliance_check" as const,
        standard: INTENT.standard,
        outputForm: "memo" as const,
        description: `sub-intent ${index}`,
      })),
    };

    const graph = buildActGraphDetailed({
      docId: "cisco-dpa",
      instruction: REPRODUCTION,
      skills: [gdpr],
      intent: compoundIntent,
      focus,
    });

    const ruleIds = graph.workUnits
      .filter((unit) => unit.tool === "check_against_rule")
      .map((unit) => String(unit.input.ruleId));
    assert.deepEqual(ruleIds.sort(), ["gdpr.art12.3"]);
    assert.equal(
      graph.workUnits.filter((unit) => unit.tool === "evaluate_matrix_row").length,
      8
    );

    const workUnitIds = graph.workUnits.map((unit) => unit.workUnitId);
    assert.equal(new Set(workUnitIds).size, workUnitIds.length);
  });

  it("authored GDPR rules have specific categories and valid scopes", () => {
    resetSkillRegistryForTests();
    assertSkillParity();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    assert.ok(gdpr.regimeRules.length > 0);
    assert.ok(
      gdpr.regimeRules.every(
        (rule) =>
          Boolean(rule.findingCategory) &&
          rule.findingCategory !== "other_known_risk" &&
          (rule.ruleScope === "per_clause" || rule.ruleScope === "per_document")
      )
    );
    assert.equal(
      gdpr.regimeRules.find((rule) => rule.ruleId === "gdpr.art17")?.findingCategory,
      "gdpr.art17.erasure_gap"
    );
    assert.equal(
      gdpr.regimeRules.find((rule) => rule.ruleId === "gdpr.art5.1")?.findingCategory,
      "principles_or_accountability_gap"
    );
    assert.equal(
      gdpr.regimeRules.find((rule) => rule.ruleId === "gdpr.art6.4")?.findingCategory,
      "lawful_basis_or_purpose_gap"
    );
    assert.equal(
      gdpr.regimeRules.find((rule) => rule.ruleId === "gdpr.art28.3.e")?.findingCategory,
      "dsr_assistance_not_operational"
    );
    for (const ruleId of ["gdpr.art5.1", "gdpr.art5.2", "gdpr.art6.4", "gdpr.art24"]) {
      assert.equal(
        gdpr.regimeRules.find((rule) => rule.ruleId === ruleId)?.ruleScope,
        "per_document"
      );
    }
  });

  it("API response safety removes internal headings and status tokens", () => {
    const raw = [
      "### Checking compliance rules",
      "- **[absent_expected] gdpr.art17.erasure_gap** (high): Missing erasure.",
      "# Final memo",
      "The agreement needs a clearer erasure obligation.",
    ].join("\n");
    const safe = sanitizeRenderedAnalysisOutput(raw)!;
    assert.equal(containsInternalAnalysisLeak(safe), false);
    assert.doesNotMatch(safe, /Checking compliance rules/);
    assert.doesNotMatch(safe, /\[(present|absent_expected|insufficient_evidence)\]/);
    assert.match(safe, /# Final memo/);
  });

  it("API response safety rewrites raw verification rejection text", () => {
    const raw =
      "Could not verify that the target document satisfies rule gdpr.art28.3.e: no verbatim supporting quote was returned.";
    const safe = sanitizeRenderedAnalysisOutput(raw)!;
    assert.equal(containsInternalAnalysisLeak(safe), false);
    assert.match(safe, /Insufficient data/i);
    assert.doesNotMatch(safe, /gdpr\.art28\.3\.e|no verbatim supporting quote/i);
  });

  it("API findings payload sanitizes internal verifier claims", async () => {
    const { sanitizeFindingsForApi } = await import("../../utils/response-safety.js");
    const [safe] = sanitizeFindingsForApi([
      {
        findingId: "f1",
        claim:
          "Could not verify that the target document satisfies rule gdpr.art28.3.e: no verbatim supporting quote was returned.",
        visibility: "user_facing",
      },
    ]);
    assert.doesNotMatch(safe.claim, /Could not verify that|gdpr\.art28\.3\.e/i);
    assert.match(safe.claim, /Insufficient data|No related clauses/i);
  });

});
