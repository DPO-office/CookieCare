process.env.GOOGLE_CLOUD_PROJECT ??= "report-spec-validator-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateReportSpec } from "../validators/report-spec.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CritiqueIssue, FixItem } from "../../../models/critique-report.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";

function state(output: string): AnalysisState {
  return {
    plan: {
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["executive_summary", "key_findings", "conclusion"],
        outline: [
          {
            id: "executive_summary",
            role: "executive_summary",
            sectionId: "executive_summary",
            heading: "Executive Summary",
            requirementIds: [],
            source: "deterministic",
          },
          {
            id: "analysis.confidentiality",
            role: "key_findings",
            sectionId: "key_findings",
            heading: "Confidentiality",
            requirementIds: ["nda.confidentiality_definition"],
            source: "deterministic",
          },
          {
            id: "conclusion",
            role: "conclusion",
            sectionId: "conclusion",
            heading: "Conclusion",
            requirementIds: [],
            source: "deterministic",
          },
        ],
      },
    },
    requirementAssessments: [
      {
        requirementId: "nda.confidentiality_definition",
        supportingFindingIds: [],
        status: "covered",
        summary: "Covered.",
      } satisfies RequirementAssessment,
    ],
    findings: [],
    renderedOutput: output,
  } as unknown as AnalysisState;
}

describe("validateReportSpec", () => {
  it("requests retrySectionIds for a missing outline heading", () => {
    const output = [
      "## Executive Summary",
      "Review of the NDA.",
      "",
      "## Conclusion",
      "The definition is covered.",
    ].join("\n");
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateReportSpec(state(output), results, fixes);
    const outlineFail = results.find((r) => r.itemId === "outline-analysis:contract");
    assert.equal(outlineFail?.status, "fail");
    const renderFix = fixes.find((f) => f.sourceItemId === "outline-analysis:contract");
    assert.deepEqual(renderFix?.retrySectionIds, ["analysis.confidentiality"]);
  });

  it("requests retrySectionIds for an empty outline section body", () => {
    const output = [
      "## Executive Summary",
      "Review of the NDA.",
      "",
      "## Confidentiality",
      "",
      "## Conclusion",
      "The definition is covered.",
    ].join("\n");
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateReportSpec(state(output), results, fixes);
    const outlineFail = results.find((r) => r.itemId === "outline-analysis:contract");
    assert.equal(outlineFail?.status, "fail");
    const renderFix = fixes.find((f) => f.sourceItemId === "outline-analysis:contract");
    assert.deepEqual(renderFix?.retrySectionIds, ["analysis.confidentiality"]);
  });
});
