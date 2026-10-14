import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSections } from "../../../models/intent.js";
import {
  buildSectionGuidanceBlock,
  enforceConclusionSectionLast,
  narrativeArcGuidance,
  normalizeReportSections,
  reportOutputContainsSection,
  reportSectionsInOrder,
} from "../../../prompts/report-sections.js";
import { buildSynthesisUserPrompt } from "../../../prompts/synthesis.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";

describe("deriveSections", () => {
  it("places scope first and conclusion last for deep compliance memos", () => {
    const sections = deriveSections("regime_compliance_memo", "deep");
    assert.equal(sections[0], "scope");
    assert.equal(sections[sections.length - 1], "conclusion");
    assert.ok(sections.includes("requirements_detail"));
    assert.ok(sections.includes("missing_materials"));
    assert.ok(!sections.includes("scope_and_conclusion"));
  });

  it("uses brief scope + conclusion for narrow depth", () => {
    assert.deepEqual(deriveSections("regime_compliance_memo", "narrow"), [
      "scope",
      "conclusion",
    ]);
  });

  it("uses answer-first evidence for narrow Q&A", () => {
    assert.deepEqual(deriveSections("qa_answer", "narrow"), [
      "key_findings",
      "evidence",
    ]);
  });
});

describe("report section guidance", () => {
  it("expands legacy combined section", () => {
    assert.deepEqual(normalizeReportSections(["scope_and_conclusion"]), [
      "scope",
      "conclusion",
    ]);
  });

  it("places conclusion last when expanding legacy combined section among analysis sections", () => {
    assert.deepEqual(
      normalizeReportSections([
        "scope_and_conclusion",
        "chapeau_particulars",
        "requirements_detail",
        "qualifications",
        "recommendations",
        "missing_materials",
      ]),
      [
        "scope",
        "chapeau_particulars",
        "requirements_detail",
        "qualifications",
        "recommendations",
        "missing_materials",
        "conclusion",
      ]
    );
  });

  it("forces conclusion last even when authored out of order", () => {
    assert.deepEqual(
      normalizeReportSections([
        "scope",
        "conclusion",
        "requirements_detail",
        "recommendations",
      ]),
      ["scope", "requirements_detail", "recommendations", "conclusion"]
    );
  });

  it("collapses executive_summary/scope and limitations/qualifications aliases", () => {
    assert.deepEqual(
      normalizeReportSections([
        "executive_summary",
        "scope",
        "key_findings",
        "limitations",
        "qualifications",
        "conclusion",
      ]),
      ["executive_summary", "key_findings", "limitations", "conclusion"]
    );
  });

  it("guides the writer to separate scope from conclusion", () => {
    const block = buildSectionGuidanceBlock(deriveSections("regime_compliance_memo", "deep"));
    assert.match(block, /open with scope only/i);
    assert.match(block, /bottom-line conclusion/i);
    assert.match(block, /Do not state the overall compliance verdict/i);
    assert.match(block, /HARD ORDERING RULE/i);
  });

  it("moves front-loaded conclusion before references for any report", () => {
    const report = [
      "# Analysis",
      "",
      "## Scope",
      "Review of the agreement.",
      "",
      "## Conclusion",
      "Partially compliant.",
      "",
      "## Requirements detail",
      "Security is covered.",
      "",
      "## Recommendations",
      "Amend confidentiality.",
      "",
      "## References",
      "[1] Clause 3.",
    ].join("\n");

    const ordered = enforceConclusionSectionLast(report);
    const conclusionAt = ordered.toLowerCase().indexOf("## conclusion");
    const requirementsAt = ordered.toLowerCase().indexOf("## requirements detail");
    const refsAt = ordered.toLowerCase().indexOf("## references");
    assert.ok(conclusionAt > requirementsAt);
    assert.ok(conclusionAt < refsAt);
  });

  it("keeps coverage limitations after conclusion", () => {
    const report = [
      "# Rights review",
      "",
      "## Scope",
      "Review.",
      "",
      "## 7. Bottom Line",
      "Gaps remain.",
      "",
      "## Coverage limitations",
      "One package missing.",
      "",
      "## 8. References",
      "[1] Clause 1.",
    ].join("\n");

    const ordered = enforceConclusionSectionLast(report);
    const bottomAt = ordered.toLowerCase().indexOf("## 7. bottom line");
    const limitsAt = ordered.toLowerCase().indexOf("## coverage limitations");
    const refsAt = ordered.toLowerCase().indexOf("## 8. references");
    assert.ok(bottomAt < limitsAt);
    assert.ok(limitsAt < refsAt);
  });

  it("detects flexible section headings in rendered output", () => {
    const report = [
      "## Review scope",
      "This memo reviews the DPA against GDPR Article 28.",
      "",
      "## Requirements detail",
      "Subject matter is partial.",
      "",
      "## Overall assessment",
      "The agreement is partially compliant.",
    ].join("\n");

    assert.equal(reportOutputContainsSection(report, "scope"), true);
    assert.equal(reportOutputContainsSection(report, "requirements_detail"), true);
    assert.equal(reportOutputContainsSection(report, "conclusion"), true);
    assert.equal(
      reportSectionsInOrder(report, ["scope", "requirements_detail", "conclusion"]),
      true
    );
  });

  it("includes section architecture in synthesis prompt without BLUF-at-top instruction", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "Perform a rigorous GDPR Article 28 compliance review.",
        documentIds: [],
        documentTexts: {},
      },
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "regime_pack:regimes/data-protection/gdpr",
        standardConcept: "GDPR Article 28",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
      workspace: {},
      findings: [],
      draftTasks: [],
      metadata: {
        timestamp: "",
        clauseTaxonomyVersion: "",
        riskTaxonomyVersion: "",
      },
    } as unknown as AnalysisState;

    const prompt = buildSynthesisUserPrompt(
      state,
      [],
      [
        {
          requirementId: "gdpr.article28.subject_matter",
          supportingFindingIds: [],
          status: "partial",
          summary: "Subject matter only partially defined.",
        } as RequirementAssessment,
      ],
      {
        reportType: "regime_compliance_memo",
        depth: "deep",
        sections: deriveSections("regime_compliance_memo", "deep"),
      }
    );

    assert.match(prompt, /SECTION ARCHITECTURE/);
    assert.match(prompt, /Do not front-load the verdict/i);
    assert.doesNotMatch(prompt, /beginning with a direct bottom-line conclusion/i);
    assert.match(prompt, /1\. Scope/);
    assert.match(narrativeArcGuidance("regime_compliance_memo", "deep", deriveSections("regime_compliance_memo", "deep")), /conclusion synthesizes/i);
  });
});
