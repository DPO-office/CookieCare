/**
 * Point 4 — classified intent must pass through PLAN normalization unchanged
 * except for missing-field and low-confidence defaults.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySensibleDefaults } from "../intent-sensible-defaults.js";
import type { IntentClassification } from "../../../models/intent.js";

function highConfidenceIntent(
  overrides: Partial<IntentClassification> = {}
): IntentClassification {
  return {
    scope: "whole_document",
    operation: "explain_qa",
    standard: "none",
    outputForm: "memo",
    reportType: "qa_answer",
    depth: "deep",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 0.9, operation: 0.9, standard: 0.9, outputForm: 0.9 },
    ...overrides,
  };
}

describe("plan intent preservation", () => {
  describe("A: NDA broad analysis parity", () => {
    const seed = highConfidenceIntent({
      operation: "explain_qa",
      depth: "deep",
      reportType: "qa_answer",
      docTypeHint: "nda",
    });

    const instructions = [
      "Analyse this NDA.",
      "Review this NDA.",
      "Give me an in-depth NDA analysis.",
      "Perform a detailed review of this NDA.",
    ];

    for (const instruction of instructions) {
      it(`preserves intent for "${instruction}"`, () => {
        const { intent, normalizations } = applySensibleDefaults(seed, instruction);
        assert.equal(intent.operation, "explain_qa");
        assert.equal(intent.depth, "deep");
        assert.equal(intent.reportType, "qa_answer");
        assert.notEqual(intent.operation, "risk_flag");
        assert.deepEqual(normalizations, []);
      });
    }

    it("produces identical outputs for equivalent NDA prompts", () => {
      const results = instructions.map((instruction) =>
        applySensibleDefaults(seed, instruction)
      );
      for (let i = 1; i < results.length; i++) {
        assert.deepEqual(results[i]!.intent, results[0]!.intent);
        assert.deepEqual(results[i]!.normalizations, results[0]!.normalizations);
      }
    });
  });

  describe("B: DPA broad analysis", () => {
    it("does not turn explain_qa into compliance_check", () => {
      const seed = highConfidenceIntent({
        operation: "explain_qa",
        docTypeHint: "dpa",
      });
      const { intent } = applySensibleDefaults(seed, "Review this DPA.");
      assert.equal(intent.operation, "explain_qa");
      assert.notEqual(intent.operation, "compliance_check");
    });
  });

  describe("C: explicit GDPR compliance_check", () => {
    it("preserves operation, depth, and reportType", () => {
      const seed = highConfidenceIntent({
        operation: "compliance_check",
        depth: "deep",
        reportType: "regime_compliance_memo",
        standard: "regime_pack:regimes/data-protection/gdpr",
      });
      const { intent, normalizations } = applySensibleDefaults(
        seed,
        "Perform a rigorous GDPR Article 28 review."
      );
      assert.equal(intent.operation, "compliance_check");
      assert.equal(intent.depth, "deep");
      assert.equal(intent.reportType, "regime_compliance_memo");
      assert.deepEqual(normalizations, []);
    });
  });

  describe("D: narrow request", () => {
    it("preserves narrow depth", () => {
      const seed = highConfidenceIntent({ depth: "narrow" });
      const { intent } = applySensibleDefaults(seed, "Only check confidentiality.");
      assert.equal(intent.depth, "narrow");
    });
  });

  describe("E: explicit depth preservation without regex match", () => {
    it("keeps deep when instruction lacks explicit deep signal", () => {
      const seed = highConfidenceIntent({ depth: "deep" });
      const { intent } = applySensibleDefaults(seed, "Look at this contract.");
      assert.equal(intent.depth, "deep");
    });
  });

  describe("F: explicit reportType preservation", () => {
    it("keeps rights_matrix and records no reportType normalization", () => {
      const seed = highConfidenceIntent({
        operation: "compliance_check",
        reportType: "rights_matrix",
      });
      const { intent, normalizations } = applySensibleDefaults(
        seed,
        "Map data subject rights across the DPA."
      );
      assert.equal(intent.reportType, "rights_matrix");
      assert.equal(
        normalizations.some((entry) => entry.field === "reportType"),
        false
      );
    });
  });

  describe("audit shape", () => {
    it("returns empty normalizations for fully-populated high-confidence intent", () => {
      const seed = highConfidenceIntent();
      const { normalizations } = applySensibleDefaults(seed, "Review the agreement.");
      assert.deepEqual(normalizations, []);
    });
  });

  describe("low-confidence outputForm defaulting", () => {
    it("derives outputForm and records low_confidence normalization", () => {
      const seed = highConfidenceIntent({
        outputForm: "brief_summary",
        reportType: "regime_compliance_memo",
        depth: "standard",
        operation: "compliance_check",
        confidence: { scope: 0.9, operation: 0.9, standard: 0.9, outputForm: 0.3 },
      });
      const { intent, normalizations } = applySensibleDefaults(
        seed,
        "Perform a GDPR Article 28 review."
      );
      assert.equal(intent.outputForm, "memo");
      assert.equal(normalizations.length, 1);
      assert.equal(normalizations[0]!.field, "outputForm");
      assert.equal(normalizations[0]!.from, "brief_summary");
      assert.equal(normalizations[0]!.to, "memo");
      assert.equal(normalizations[0]!.reason, "low_confidence");
    });
  });
});
