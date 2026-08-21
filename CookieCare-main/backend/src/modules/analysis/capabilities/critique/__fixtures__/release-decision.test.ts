process.env.GOOGLE_CLOUD_PROJECT ??= "release-decision-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../models/analysis-state.js";
import { initAgentRunState } from "../../../pac/types.js";
import { composeReleaseDecision } from "../release-decision.js";
import { resolveStoppedReason } from "../../../pac/transitions.js";
import { renderLimitationsReport } from "../../reporting/limitations-report.js";

function emptyCoverage() {
  return {
    total: 1,
    covered: 1,
    entries: [{ requirementId: "r1", state: "covered" as const }],
    notCovered: [],
    needsReplan: [],
  };
}

describe("release decision", () => {
  it("releases when coverage complete and structure valid", () => {
    const release = composeReleaseDecision({
      state: {
        agent: initAgentRunState("CREATE"),
        request: { sessionId: "s", instruction: "test", documentIds: [], documentTexts: {} },
        workspace: { sessionId: "s", documents: [] },
        findings: [],
        draftTasks: [],
        metadata: { timestamp: "", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
        activeSkillIds: [],
        renderedOutput: "# Report\n\nSubstance.",
      },
      coverage: emptyCoverage(),
      alignment: { issues: [] },
      placeholder: { detected: false },
      structurallyValid: true,
      executionComplete: true,
      fixPlan: [],
      skeletonMismatch: false,
    });
    assert.equal(release.verdict, "release");
    assert.equal(resolveStoppedReason({} as AnalysisState, { release, fixPlan: [], isGreen: true }), "green");
  });

  it("withholds on placeholder output and maps to blocked", () => {
    const release = composeReleaseDecision({
      state: {
        agent: initAgentRunState("CREATE"),
        request: { sessionId: "s", instruction: "test", documentIds: [], documentTexts: {} },
        workspace: { sessionId: "s", documents: [] },
        findings: [],
        draftTasks: [],
        metadata: { timestamp: "", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
        activeSkillIds: [],
        renderedOutput: "No analysis package available for this request.",
        plan: { intent: { requirements: [{ id: "r1", description: "", type: "other", priority: "required" }], scope: "whole_document", operation: "compliance_check", standard: "none", outputForm: "memo", compound: false, subIntents: [], confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 } }, workUnits: [], missingClarifications: [], outputForm: "memo" },
      },
      coverage: emptyCoverage(),
      alignment: { issues: [] },
      placeholder: {
        detected: true,
        kind: "placeholder_text",
        detail: "placeholder",
      },
      structurallyValid: true,
      executionComplete: true,
      fixPlan: [],
      skeletonMismatch: false,
    });
    assert.equal(release.verdict, "withhold");
    assert.equal(
      resolveStoppedReason({} as AnalysisState, { release, fixPlan: [], isGreen: false }),
      "blocked"
    );
    const report = renderLimitationsReport(
      {
        request: { sessionId: "s", instruction: "Analyse NDA", documentIds: [], documentTexts: {} },
        workspace: { sessionId: "s", documents: [] },
        findings: [],
        draftTasks: [],
        metadata: { timestamp: "", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
        activeSkillIds: ["doc-types/nda"],
        plan: { intent: { requirements: [], scope: "whole_document", operation: "compliance_check", standard: "none", outputForm: "memo", compound: false, subIntents: [], confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 } }, workUnits: [], missingClarifications: [], outputForm: "memo", requirementExecutionPaths: [] },
      } as AnalysisState,
      release
    );
    assert.match(report, /could not be released/i);
    assert.doesNotMatch(report, /No analysis package available/);
  });

  it("partial release maps to green_partial", () => {
    const release = composeReleaseDecision({
      state: {
        agent: initAgentRunState("CREATE"),
        request: { sessionId: "s", instruction: "test", documentIds: [], documentTexts: {} },
        workspace: { sessionId: "s", documents: [] },
        findings: [],
        draftTasks: [],
        metadata: { timestamp: "", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
        activeSkillIds: [],
        renderedOutput: "# Partial report",
      },
      coverage: {
        total: 2,
        covered: 1,
        entries: [],
        notCovered: ["r2"],
        needsReplan: [],
      },
      alignment: { issues: [] },
      placeholder: { detected: false },
      structurallyValid: true,
      executionComplete: true,
      fixPlan: [],
      skeletonMismatch: false,
    });
    assert.equal(release.verdict, "release_with_limitations");
    assert.equal(
      resolveStoppedReason({} as AnalysisState, { release, fixPlan: [], isGreen: false }),
      "green_partial"
    );
  });
});
