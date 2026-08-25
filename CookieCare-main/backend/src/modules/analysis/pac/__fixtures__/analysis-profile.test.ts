process.env.GOOGLE_CLOUD_PROJECT ??= "analysis-profile-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LLMTask } from "../../../../llm/config/model-specs.js";
import {
  DEFAULT_THINKING_MODE,
  resolveAnalysisProfile,
  resolveThinkingMode,
} from "../analysis-profile.js";
import { AnalysisRequestSchema } from "../../api/schema.js";
import { nextPhaseAfterCritique } from "../transitions.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { CritiqueReport } from "../../models/critique-report.js";
import { initAgentRunState } from "../types.js";

describe("analysis profile / thinkingMode", () => {
  it("defaults omitted mode to lite", () => {
    assert.equal(resolveThinkingMode(undefined), DEFAULT_THINKING_MODE);
    assert.equal(resolveThinkingMode("nope"), "lite");
    assert.equal(resolveThinkingMode("lite"), "lite");
    assert.equal(resolveThinkingMode("deep"), "deep");
  });

  it("lite keeps evaluate/synthesis at least low and skips deep critique", () => {
    const profile = resolveAnalysisProfile("lite");
    assert.equal(profile.maxTurns, 1);
    assert.equal(profile.enableDeepCritique, false);
    assert.equal(profile.maxTier2Attempts, 0);
    assert.equal(profile.maxReplans, 0);
    assert.equal(profile.thinkingByTask[LLMTask.STRUCTURAL_JSON], "low");
    assert.equal(profile.thinkingByTask[LLMTask.REFINEMENT], "low");
    assert.equal(profile.thinkingByTask[LLMTask.STRUCTURAL_JSON_LITE], "minimal");
    assert.equal(profile.critiqueUsesProChecklist, false);
  });

  it("deep uses Flash medium on evaluate/synthesis and enables critique budget", () => {
    const profile = resolveAnalysisProfile("deep");
    assert.equal(profile.maxTurns, 2);
    assert.equal(profile.enableDeepCritique, true);
    assert.equal(profile.maxTier2Attempts, 1);
    assert.equal(profile.maxReplans, 1);
    assert.equal(profile.thinkingByTask[LLMTask.STRUCTURAL_JSON], "medium");
    assert.equal(profile.thinkingByTask[LLMTask.REFINEMENT], "medium");
    assert.equal(profile.thinkingByTask[LLMTask.STRUCTURAL_JSON_LITE], "low");
    assert.equal(profile.thinkingByTask[LLMTask.CRITIQUE_CHECKLIST], "high");
    assert.equal(profile.critiqueUsesProChecklist, true);
    assert.equal(profile.synthesisCeilingFactor, 1.75);
    assert.equal(profile.synthesisHardCap, 6400);
  });

  it("lite synthesis ceiling stays conservative", () => {
    const profile = resolveAnalysisProfile("lite");
    assert.equal(profile.synthesisCeilingFactor, 1);
    assert.equal(profile.synthesisHardCap, 3600);
  });

  it("API schema accepts thinkingMode lite|deep", () => {
    const ok = AnalysisRequestSchema.safeParse({
      instruction: "Review this DPA",
      documentIds: ["doc1"],
      thinkingMode: "deep",
    });
    assert.equal(ok.success, true);
    const bad = AnalysisRequestSchema.safeParse({
      instruction: "Review this DPA",
      documentIds: ["doc1"],
      thinkingMode: "turbo",
    });
    assert.equal(bad.success, false);
  });

  it("lite profile does not open ACT redo from critique fixes", () => {
    const profile = resolveAnalysisProfile("lite");
    const state = {
      analysisProfile: profile,
      agent: initAgentRunState("CREATE", { maxTurns: profile.maxTurns }),
      request: {
        sessionId: "s",
        instruction: "x",
        documentIds: [],
        documentTexts: {},
        thinkingMode: "lite",
      },
      workspace: { sessionId: "s", documents: [] },
      findings: [],
      draftTasks: [],
      metadata: {
        timestamp: "",
        clauseTaxonomyVersion: "",
        riskTaxonomyVersion: "",
      },
    } as AnalysisState;

    const critique = {
      isGreen: false,
      iteration: 1,
      results: [],
      fixPlan: [
        {
          workUnitId: "wu-1",
          instruction: "retry",
          sourceItemId: "x",
        },
      ],
      skeletonMismatch: false,
      metrics: { replanCount: 0 },
      release: {
        alignment: { issues: [] },
      },
    } as unknown as CritiqueReport;

    assert.equal(nextPhaseAfterCritique(state, critique), "DONE");
  });

  it("deep profile allows ACT redo when fix plan is present", () => {
    const profile = resolveAnalysisProfile("deep");
    const state = {
      analysisProfile: profile,
      agent: initAgentRunState("CREATE", { maxTurns: profile.maxTurns, turn: 0 }),
      request: {
        sessionId: "s",
        instruction: "x",
        documentIds: [],
        documentTexts: {},
        thinkingMode: "deep",
      },
      workspace: { sessionId: "s", documents: [] },
      findings: [],
      draftTasks: [],
      metadata: {
        timestamp: "",
        clauseTaxonomyVersion: "",
        riskTaxonomyVersion: "",
      },
    } as AnalysisState;

    const critique = {
      isGreen: false,
      iteration: 1,
      results: [],
      fixPlan: [
        {
          workUnitId: "wu-1",
          instruction: "retry",
          sourceItemId: "x",
        },
      ],
      skeletonMismatch: false,
      metrics: { replanCount: 0 },
      release: {
        alignment: { issues: [] },
      },
    } as unknown as CritiqueReport;

    assert.equal(nextPhaseAfterCritique(state, critique), "ACT");
  });
});
