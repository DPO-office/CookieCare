process.env.GOOGLE_CLOUD_PROJECT ??= "release-decision-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CritiqueReport, ReleaseDecision } from "../../../models/critique-report.js";
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

function critiqueWithRelease(
  release: ReleaseDecision,
  isGreen: boolean
): CritiqueReport {
  return {
    release,
    isGreen,
    iteration: 1,
    results: [],
    fixPlan: [],
    skeletonMismatch: false,
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
    assert.equal(
      resolveStoppedReason({} as AnalysisState, critiqueWithRelease(release, true)),
      "green"
    );
  });

  it("releases with limitations when soft coverage gaps exist but memo body is shippable", () => {
    const release = composeReleaseDecision({
      state: {
        agent: initAgentRunState("CREATE"),
        request: { sessionId: "s", instruction: "test", documentIds: [], documentTexts: {} },
        workspace: { sessionId: "s", documents: [] },
        findings: [],
        draftTasks: [],
        metadata: { timestamp: "", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
        activeSkillIds: [],
        renderedOutput: "# Data-subject rights review\n\n## 2. Rights Matrix / Mapping\n\nSubstance.",
      },
      coverage: {
        total: 2,
        covered: 1,
        entries: [
          { requirementId: "gdpr.article15.compliance", state: "covered" },
          { requirementId: "dsr.response_timeframes", state: "needs_replan" },
        ],
        notCovered: [],
        needsReplan: ["dsr.response_timeframes"],
      },
      alignment: {
        issues: [
          {
            kind: "wrong_package",
            action: "replan",
            requirementId: "dsr.response_timeframes",
            detail: "No analysis package",
          },
        ],
      },
      placeholder: { detected: false },
      structurallyValid: false,
      executionComplete: true,
      fixPlan: [],
      skeletonMismatch: false,
    });
    assert.equal(release.verdict, "release_with_limitations");
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
        plan: { intent: { requirements: [{ id: "r1", description: "", type: "other", priority: "required" }], scope: "whole_document", operation: "compliance_check", standard: "none", outputForm: "memo", compound: false, subIntents: [], confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 } }, workUnits: [], missingClarifications: [], outputForm: "memo", rendererSchemaId: "memo", pinnedVersions: { clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" } },
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
      resolveStoppedReason({} as AnalysisState, critiqueWithRelease(release, false)),
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
        plan: { intent: { requirements: [], scope: "whole_document", operation: "compliance_check", standard: "none", outputForm: "memo", compound: false, subIntents: [], confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 } }, workUnits: [], missingClarifications: [], outputForm: "memo", rendererSchemaId: "memo", pinnedVersions: { clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" }, requirementExecutionPaths: [] },
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
      resolveStoppedReason({} as AnalysisState, critiqueWithRelease(release, false)),
      "green_partial"
    );
  });
});
