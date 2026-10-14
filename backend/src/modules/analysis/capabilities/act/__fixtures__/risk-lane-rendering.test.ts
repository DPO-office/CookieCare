import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSections } from "../../../models/intent.js";
import { buildSectionSynthesisUserPrompt } from "../../../prompts/synthesis.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";
import type { RequirementJudgement } from "../../../models/requirement-assessment.js";

function riskFinding(
  id: string,
  claim: string,
  nli: RequirementJudgement["nli"]
): Finding {
  return {
    findingId: id,
    kind: "risk",
    category: "risk",
    status: "present",
    claim,
    evidence: [],
    taxonomyVersion: "v1",
    visibility: "user_facing",
    judgement: {
      compliance: "present",
      evidenceState: "direct",
      referenceBinding: "none",
      evidenceConfidence: "high",
      materiality: nli === "contradicted" ? "low" : "high",
      nli,
      recommendationKind: "none",
    },
  };
}

function riskState(): AnalysisState {
  return {
    request: {
      sessionId: "s1",
      instruction: "What is the biggest risk in this DPA if we onboard this vendor?",
      documentIds: [],
      documentTexts: {},
      answerStyle: "narrative",
    },
    intent: {
      scope: "whole_document",
      operation: "risk_flag",
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

describe("deriveSections — operation-aware archetype (Part 3a)", () => {
  it("gives risk_flag a risk-narrative shape, not a compliance matrix", () => {
    const sections = deriveSections("risk_audit", "standard", "risk_flag");
    assert.deepEqual(sections, [
      "executive_summary",
      "risk_summary",
      "recommendations",
      "conclusion",
    ]);
    // The generic compliance skeleton must NOT be produced for a risk question.
    assert.ok(!sections.includes("requirements_detail"));
  });

  it("keeps a short direct-answer shape for a narrow risk question", () => {
    assert.deepEqual(deriveSections("risk_audit", "narrow", "risk_flag"), [
      "executive_summary",
      "conclusion",
    ]);
  });

  it("leaves the default (compliance) shape unchanged when operation is absent", () => {
    const sections = deriveSections("risk_audit", "standard");
    assert.deepEqual(sections, [
      "scope",
      "requirements_detail",
      "qualifications",
      "recommendations",
      "conclusion",
    ]);
  });

  it("does not divert a compliance_check to the risk archetype", () => {
    const sections = deriveSections("regime_compliance_memo", "standard", "compliance_check");
    assert.ok(sections.includes("requirements_detail"));
    assert.ok(!sections.includes("risk_summary"));
  });
});

describe("risk rendering — confirmed vs. checked-not-a-risk (Part 3b)", () => {
  it("lists contradicted risk propositions as reassurance, never as risks", () => {
    const findings = [
      riskFinding("f_present", "The DPA caps supplier liability below realistic exposure.", "entailed"),
      riskFinding("f_absent", "Supplier is fully liable for sub-processor breaches; caps do not apply.", "contradicted"),
    ];
    const prompt = buildSectionSynthesisUserPrompt({
      state: riskState(),
      findings,
      assessments: [],
      reportSpec: {
        reportType: "risk_audit",
        depth: "standard",
        sections: ["executive_summary", "risk_summary", "recommendations", "conclusion"],
      },
      item: {
        id: "risk.risk_summary",
        role: "risk_summary",
        sectionId: "risk_summary",
        heading: "Your biggest exposures",
        requirementIds: [],
        source: "catalog_llm",
      },
    });

    assert.match(prompt, /CONFIRMED RISKS/);
    assert.match(prompt, /caps supplier liability below realistic exposure/);
    assert.match(prompt, /CHECKED — NOT A RISK/);
    assert.match(prompt, /present as reassurance, never as problems/);
    // The contradicted proposition must sit under the reassurance heading, not
    // be presented as a confirmed risk.
    const confirmedIdx = prompt.indexOf("CONFIRMED RISKS");
    const clearedIdx = prompt.indexOf("CHECKED — NOT A RISK");
    const absentIdx = prompt.indexOf("Supplier is fully liable for sub-processor breaches");
    assert.ok(clearedIdx > confirmedIdx);
    assert.ok(absentIdx > clearedIdx);
  });

  it("surfaces the risk material into the lead answer section in the risk lane", () => {
    const findings = [
      riskFinding("f_present", "Unlimited indemnity flows one way against the customer.", "entailed"),
    ];
    const prompt = buildSectionSynthesisUserPrompt({
      state: riskState(),
      findings,
      assessments: [],
      reportSpec: {
        reportType: "risk_audit",
        depth: "standard",
        sections: ["executive_summary", "risk_summary", "recommendations", "conclusion"],
      },
      item: {
        id: "risk.executive_summary",
        role: "executive_summary",
        sectionId: "executive_summary",
        heading: "Your biggest exposure",
        requirementIds: [],
        source: "catalog_llm",
      },
    });
    // includeRisks now covers the opening section for risk_flag, so the direct
    // answer can name the biggest exposure.
    assert.match(prompt, /MATERIAL RISKS/);
    assert.match(prompt, /Unlimited indemnity flows one way/);
  });
});
