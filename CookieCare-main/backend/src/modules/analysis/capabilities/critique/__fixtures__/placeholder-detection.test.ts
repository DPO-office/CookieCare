process.env.GOOGLE_CLOUD_PROJECT ??= "placeholder-detection-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import { detectPlaceholderOutput } from "../placeholder-report.js";

function stateWithOutput(output: string, assessments = []): AnalysisState {
  return {
    request: {
      sessionId: "s",
      instruction: "test",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "s", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: "1",
      riskTaxonomyVersion: "1",
    },
    activeSkillIds: [],
    renderedOutput: output,
    requirementAssessments: assessments,
    intent: {
      scope: "whole_document",
      operation: "compliance_check",
      standard: "none",
      outputForm: "memo",
      compound: false,
      subIntents: [],
      requirements: [{ id: "r1", description: "x", type: "other", priority: "required" }],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    },
  };
}

describe("placeholder detection", () => {
  it("detects known placeholder phrases", () => {
    const result = detectPlaceholderOutput(
      stateWithOutput("Not supported for this document type.")
    );
    assert.equal(result.detected, true);
    assert.equal(result.kind, "placeholder_text");
  });

  it("detects all-not_covered assessments", () => {
    const state: AnalysisState = {
      request: {
        sessionId: "s",
        instruction: "test",
        documentIds: [],
        documentTexts: {},
      },
      workspace: { sessionId: "s", documents: [] },
      findings: [],
      draftTasks: [],
      metadata: {
        timestamp: new Date().toISOString(),
        clauseTaxonomyVersion: "1",
        riskTaxonomyVersion: "1",
      },
      activeSkillIds: [],
      renderedOutput:
        "This report contains no verified requirement conclusions for the requested scope.",
      requirementAssessments: [
        {
          requirementId: "r1",
          supportingFindingIds: [],
          summary: "",
          status: "missing",
        },
      ],
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [
          { id: "r1", description: "x", type: "other", priority: "required" },
        ],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
    };
    const result = detectPlaceholderOutput(state);
    assert.equal(result.detected, true);
    assert.equal(result.kind, "all_not_covered");
  });

  it("passes substantive output", () => {
    const result = detectPlaceholderOutput(
      stateWithOutput(
        "# NDA Review\n\n## Scope\n\nThe agreement defines confidential information with standard exclusions.\n\n## Conclusion\n\nOverall adequate."
      ),
      [
        {
          requirementId: "r1",
          supportingFindingIds: ["f1"],
          summary: "Covered",
          status: "covered",
        },
      ]
    );
    assert.equal(result.detected, false);
  });
});
