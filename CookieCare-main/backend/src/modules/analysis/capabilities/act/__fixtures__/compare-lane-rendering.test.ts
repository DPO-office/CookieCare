import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSections } from "../../../models/intent.js";
import { buildSectionSynthesisUserPrompt } from "../../../prompts/synthesis.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";

function comparisonFinding(
  id: string,
  claim: string,
  compareRole: "side_a" | "side_b",
  compareGroup = "compare_termination_rights"
): Finding {
  return {
    findingId: id,
    kind: "comparison_delta",
    category: "other_known_risk",
    status: "present",
    claim,
    evidence: [],
    taxonomyVersion: "v1",
    visibility: "user_facing",
    compareGroup,
    compareRole,
    judgement: {
      compliance: "present",
      evidenceState: "direct",
      referenceBinding: "none",
      evidenceConfidence: "high",
      materiality: "medium",
      nli: "entailed",
      recommendationKind: "none",
    },
  };
}

function compareState(): AnalysisState {
  return {
    request: {
      sessionId: "s1",
      instruction: "Is the termination clause balanced between the parties?",
      documentIds: [],
      documentTexts: {},
      answerStyle: "narrative",
    },
    intent: {
      scope: "whole_document",
      operation: "compare",
      standard: "none",
      outputForm: "memo",
      compound: false,
      subIntents: [],
      requirements: [],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    },
    workspace: {},
    findings: [],
    analysisArtifacts: {},
  } as unknown as AnalysisState;
}

describe("deriveSections — compare archetype", () => {
  it("gives compare a side-by-side shape, not a compliance matrix", () => {
    const sections = deriveSections("regime_compliance_memo", "standard", "compare");
    assert.deepEqual(sections, [
      "executive_summary",
      "comparison",
      "recommendations",
      "conclusion",
    ]);
    assert.ok(!sections.includes("requirements_detail"));
  });

  it("keeps a short direct-answer shape for a narrow comparison question", () => {
    assert.deepEqual(deriveSections("regime_compliance_memo", "narrow", "compare"), [
      "executive_summary",
      "conclusion",
    ]);
  });
});

describe("compare rendering — pairs side_a/side_b back into one comparison", () => {
  it("groups paired findings by compareGroup and labels both sides", () => {
    const findings = [
      comparisonFinding(
        "f_a",
        "The customer may terminate for convenience on 30 days' notice.",
        "side_a"
      ),
      comparisonFinding(
        "f_b",
        "The vendor may only terminate for the customer's uncured material breach.",
        "side_b"
      ),
    ];
    const prompt = buildSectionSynthesisUserPrompt({
      state: compareState(),
      findings,
      assessments: [],
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["executive_summary", "comparison", "recommendations", "conclusion"],
      },
      item: {
        id: "compare.comparison",
        role: "comparison",
        sectionId: "comparison",
        heading: "Termination rights favor the customer",
        requirementIds: [],
        source: "catalog_llm",
      },
    });

    assert.match(prompt, /COMPARISON MATERIAL/);
    assert.match(prompt, /Side A: The customer may terminate for convenience/);
    assert.match(prompt, /Side B: The vendor may only terminate for the customer's uncured/);
  });

  it("names a side as not established rather than dropping it silently", () => {
    const findings = [
      comparisonFinding("f_a", "The customer may assign the agreement freely.", "side_a"),
    ];
    const prompt = buildSectionSynthesisUserPrompt({
      state: compareState(),
      findings,
      assessments: [],
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["executive_summary", "comparison", "recommendations", "conclusion"],
      },
      item: {
        id: "compare.comparison",
        role: "comparison",
        sectionId: "comparison",
        heading: "Assignment rights",
        requirementIds: [],
        source: "catalog_llm",
      },
    });

    assert.match(prompt, /Side B: \(not independently established\)/);
  });

  it("surfaces comparison material into the lead answer section in the compare lane", () => {
    const findings = [
      comparisonFinding("f_a", "The customer may terminate for convenience.", "side_a"),
      comparisonFinding("f_b", "The vendor has no termination-for-convenience right.", "side_b"),
    ];
    const prompt = buildSectionSynthesisUserPrompt({
      state: compareState(),
      findings,
      assessments: [],
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["executive_summary", "comparison", "recommendations", "conclusion"],
      },
      item: {
        id: "compare.executive_summary",
        role: "executive_summary",
        sectionId: "executive_summary",
        heading: "Termination rights favor the customer",
        requirementIds: [],
        source: "catalog_llm",
      },
    });
    assert.match(prompt, /COMPARISON MATERIAL/);
    assert.match(prompt, /The customer may terminate for convenience/);
  });
});
