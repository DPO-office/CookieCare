/**
 * PLAN phase — scope classification correction and deterministic standard
 * concept → registry resolution.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  namesDocumentSection,
  refineScope,
  requestsRiskAnalysis,
} from "../intent-heuristics.js";
import { applySensibleDefaults } from "../intent-sensible-defaults.js";
import type { IntentClassification } from "../../../models/intent.js";
import {
  normalizeStandard,
  resolveStandardConceptToRegistry,
} from "../resolve-standard.js";
import { resetSkillRegistryForTests } from "../../../skills/registry.js";

describe("PLAN scope classification", () => {
  it("A: legal-article review of a document stays whole_document", () => {
    assert.equal(
      refineScope("named_section", "Review the DPA for GDPR Article 28 compliance."),
      "whole_document"
    );
  });

  it("B: an explicitly named document section stays named_section", () => {
    assert.equal(
      refineScope("named_section", "Review only the Security section of the DPA."),
      "named_section"
    );
  });

  it("C: a numbered document section stays named_section", () => {
    assert.equal(
      refineScope("named_section", "Review Section 4.2 of the DPA."),
      "named_section"
    );
  });

  it("D: multiple legal articles across the document stay whole_document", () => {
    assert.equal(
      refineScope(
        "named_section",
        "Review Article 28 and Article 32 compliance across the DPA."
      ),
      "whole_document"
    );
  });

  it("never overrides a correct non-section scope", () => {
    assert.equal(refineScope("whole_document", "Review Section 4.2 of the DPA."), "whole_document");
    assert.equal(
      refineScope("cross_document", "Compare Article 28 across the two DPAs."),
      "cross_document"
    );
    assert.equal(
      refineScope("cross_cutting_theme", "Review the Security section."),
      "cross_cutting_theme"
    );
  });

  it("namesDocumentSection distinguishes sections from legal articles", () => {
    assert.equal(namesDocumentSection("Review only the Security section of the DPA."), true);
    assert.equal(namesDocumentSection("Review Section 4.2 of the DPA."), true);
    assert.equal(namesDocumentSection("analyze the Termination clause"), true);
    assert.equal(namesDocumentSection("Review the DPA for GDPR Article 28 compliance."), false);
    assert.equal(
      namesDocumentSection(
        "Verify all mandatory Article 28(3) clauses are present and adequate."
      ),
      false
    );
  });
});

describe("PLAN standard resolution", () => {
  it("A: GDPR Article 28 concept resolves to the existing GDPR regime pack", () => {
    resetSkillRegistryForTests();
    const result = resolveStandardConceptToRegistry("GDPR Article 28");
    assert.equal(result.standard, "regime_pack:regimes/data-protection/gdpr");
  });

  it("B: bare GDPR concept resolves to the existing GDPR regime pack", () => {
    resetSkillRegistryForTests();
    const result = resolveStandardConceptToRegistry("GDPR");
    assert.equal(result.standard, "regime_pack:regimes/data-protection/gdpr");
  });

  it("C: no standard concept leaves the standard as none", () => {
    resetSkillRegistryForTests();
    assert.equal(resolveStandardConceptToRegistry(undefined).standard, "none");
    assert.equal(resolveStandardConceptToRegistry("").standard, "none");
  });

  it("D: an unknown concept is never fabricated into a registry id", () => {
    resetSkillRegistryForTests();
    const result = resolveStandardConceptToRegistry("Totally Made Up Regime XYZ");
    assert.equal(result.standard, "none");
    assert.equal(result.unresolved, "Totally Made Up Regime XYZ");
  });

  it("resolves overlapping keywords to the most specific pack", () => {
    resetSkillRegistryForTests();
    assert.equal(
      resolveStandardConceptToRegistry("UK GDPR / IDTA").standard,
      "regime_pack:regimes/data-protection/uk-gdpr-idta"
    );
    assert.equal(
      resolveStandardConceptToRegistry("CCPA / CPRA").standard,
      "regime_pack:regimes/data-protection/ccpa-cpra"
    );
  });

  it("normalizeStandard resolves aliases and refuses unknown ids", () => {
    resetSkillRegistryForTests();
    assert.equal(
      normalizeStandard("regime_pack:gdpr-article-28").standard,
      "regime_pack:regimes/data-protection/gdpr"
    );
    const unknown = normalizeStandard("regime_pack:made-up-pack");
    assert.equal(unknown.standard, "none");
    assert.equal(unknown.unresolved, "regime_pack:made-up-pack");
  });
});

describe("PLAN risk-analysis selection gate", () => {
  it("treats explicit risk-flag language as requesting risk analysis", () => {
    assert.equal(
      requestsRiskAnalysis("Perform Article 28 compliance review and flag all material risks.", "compliance_check"),
      true
    );
    assert.equal(requestsRiskAnalysis("Run a full risk analysis of this MSA.", "compliance_check"), true);
    assert.equal(requestsRiskAnalysis("Review it.", "risk_flag"), true);
  });

  it("does not treat a pure compliance review as requesting risk analysis", () => {
    assert.equal(
      requestsRiskAnalysis("Perform a rigorous GDPR Article 28 compliance review.", "compliance_check"),
      false
    );
  });
});

describe("intent preservation via applySensibleDefaults", () => {
  const classified: IntentClassification = {
    scope: "whole_document",
    operation: "explain_qa",
    standard: "none",
    outputForm: "memo",
    reportType: "qa_answer",
    depth: "deep",
    documentPresentation: "unified",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 0.9, operation: 0.9, standard: 0.9, outputForm: 0.9 },
    docTypeHint: "nda",
  };

  it("preserves classifier operation, depth, reportType, and outputForm", () => {
    const { intent, normalizations } = applySensibleDefaults(
      classified,
      "do the anaysis of NDA"
    );
    assert.equal(intent.operation, "explain_qa");
    assert.equal(intent.depth, "deep");
    assert.equal(intent.reportType, "qa_answer");
    assert.equal(intent.outputForm, "memo");
    assert.deepEqual(normalizations, []);
  });

  it("does not rewrite extract+identify NDA review into risk_flag", () => {
    const extractIntent: IntentClassification = {
      ...classified,
      operation: "extract",
      reportType: "qa_answer",
      outputForm: "memo",
      requirements: [
        {
          id: "nda.confidentiality.scope_of_information",
          description: "Scope",
          type: "extraction",
          priority: "required",
        },
      ],
    };
    const instruction =
      "Analyse the confidentiality and non-disclosure obligations in this NDA. Identify: the scope of confidential information.";
    const { intent } = applySensibleDefaults(extractIntent, instruction);
    assert.equal(intent.operation, "extract");
    assert.equal(intent.reportType, "qa_answer");
    assert.equal(intent.outputForm, "memo");
  });
});
