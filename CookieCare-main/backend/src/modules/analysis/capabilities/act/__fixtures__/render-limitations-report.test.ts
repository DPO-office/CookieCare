process.env.GOOGLE_CLOUD_PROJECT ??= "render-limitations-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../models/analysis-state.js";
import { renderLimitationsReport } from "../render-limitations-report.js";

describe("render limitations report", () => {
  it("withhold report does not leak pre-render body", () => {
    const release = {
      verdict: "withhold" as const,
      reasons: ["placeholder_output" as const],
      requirementCoverage: {
        total: 1,
        covered: 0,
        entries: [],
        notCovered: ["r1"],
        needsReplan: [],
      },
      alignment: { issues: [] },
      placeholderReport: {
        detected: true,
        kind: "placeholder_text" as const,
        detail: "Placeholder detected",
      },
    };
    const state = {
      request: {
        sessionId: "s",
        instruction: "Analyse this NDA",
        documentIds: [],
        documentTexts: {},
      },
      workspace: { sessionId: "s", documents: [] },
      findings: [],
      draftTasks: [],
      metadata: {
        timestamp: "",
        clauseTaxonomyVersion: "1",
        riskTaxonomyVersion: "1",
      },
      activeSkillIds: ["doc-types/nda"],
      renderedOutput: "SECRET BROKEN MEMO WITH Art 28 TABLE",
      plan: {
        intent: {
          requirements: [],
          scope: "whole_document",
          operation: "compliance_check",
          standard: "none",
          outputForm: "memo",
          compound: false,
          subIntents: [],
          confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
        },
        workUnits: [],
        missingClarifications: [],
        outputForm: "memo",
        requirementExecutionPaths: [],
      },
    } as AnalysisState;

    const report = renderLimitationsReport(state, release);
    assert.match(report, /Scope/);
    assert.match(report, /Why this cannot be presented/);
    assert.match(report, /Suggested next step/);
    assert.doesNotMatch(report, /SECRET BROKEN MEMO/);
    assert.doesNotMatch(report, /Art 28/);
  });

  it("partial release wraps existing output with limitations header", () => {
    const release = {
      verdict: "release_with_limitations" as const,
      reasons: ["coverage_gap" as const],
      requirementCoverage: {
        total: 2,
        covered: 1,
        entries: [],
        notCovered: ["r2"],
        needsReplan: [],
      },
      alignment: { issues: [] },
      placeholderReport: { detected: false },
    };
    const wrapped = renderLimitationsReport(
      {
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
          timestamp: "",
          clauseTaxonomyVersion: "1",
          riskTaxonomyVersion: "1",
        },
        activeSkillIds: [],
      } as AnalysisState,
      release,
      { wrapExisting: "## NDA findings\n\nConfidentiality is defined." }
    );
    assert.match(wrapped, /Limitations/);
    assert.match(wrapped, /Confidentiality is defined/);
  });
});
