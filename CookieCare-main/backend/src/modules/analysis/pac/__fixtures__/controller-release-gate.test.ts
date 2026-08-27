import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../models/analysis-state.js";
import { initAgentRunState } from "../types.js";
import { resolveStoppedReason, nextPhaseAfterCritique } from "../transitions.js";
import { renderLimitationsReport } from "../../capabilities/reporting/limitations-report.js";
import { shouldHoldUserFacingOutput } from "../../utils/pac-log.js";
import type { CritiqueReport, ReleaseDecision } from "../../models/critique-report.js";

function critiqueWithRelease(release: ReleaseDecision): CritiqueReport {
  return {
    isGreen: release.verdict === "release",
    iteration: 1,
    results: [],
    fixPlan: [],
    skeletonMismatch: false,
    release,
  };
}

describe("PAC release gate transitions", () => {
  it("holds user-facing tokens until PAC is DONE", () => {
    const state = { agent: initAgentRunState("CREATE") } as AnalysisState;
    assert.equal(shouldHoldUserFacingOutput(state), true);
    state.agent!.phase = "ACT";
    assert.equal(shouldHoldUserFacingOutput(state), true);
    state.agent!.phase = "AUDIT";
    assert.equal(shouldHoldUserFacingOutput(state), true);
    state.agent!.phase = "CRITIQUE";
    assert.equal(shouldHoldUserFacingOutput(state), true);
    state.agent!.phase = "DONE";
    assert.equal(shouldHoldUserFacingOutput(state), false);
  });
  it("blocked withhold never preserves misleading renderedOutput in limitations report", () => {
    const release: ReleaseDecision = {
      verdict: "withhold",
      reasons: ["placeholder_output"],
      requirementCoverage: {
        total: 1,
        covered: 0,
        entries: [],
        notCovered: ["r1"],
        needsReplan: [],
      },
      alignment: { issues: [] },
      placeholderReport: { detected: true, kind: "placeholder_text" },
    };
    const state = {
      agent: initAgentRunState("CREATE"),
      request: {
        sessionId: "s",
        instruction: "Analyse NDA",
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
      renderedOutput: "FAKE SUCCESS MEMO",
    } as AnalysisState;

    const limited = renderLimitationsReport(state, release);
    assert.doesNotMatch(limited, /FAKE SUCCESS MEMO/);
    assert.equal(resolveStoppedReason(state, critiqueWithRelease(release)), "blocked");
  });

  it("green_partial for release_with_limitations", () => {
    const release: ReleaseDecision = {
      verdict: "release_with_limitations",
      reasons: ["coverage_gap"],
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
    assert.equal(
      resolveStoppedReason({} as AnalysisState, critiqueWithRelease(release)),
      "green_partial"
    );
  });

  it("replan when alignment issue action is replan even with empty fixPlan", () => {
    const critique = critiqueWithRelease({
      verdict: "withhold",
      reasons: ["alignment_mismatch"],
      requirementCoverage: {
        total: 1,
        covered: 0,
        entries: [],
        notCovered: [],
        needsReplan: ["r1"],
      },
      alignment: {
        issues: [
          {
            kind: "wrong_package",
            action: "replan",
            detail: "wrong package",
          },
        ],
      },
      placeholderReport: { detected: false },
    });
    assert.equal(nextPhaseAfterCritique({ agent: initAgentRunState("CREATE") } as AnalysisState, critique), "DONE");
  });
});
