process.env.GOOGLE_CLOUD_PROJECT ??= "synthesis-ceiling-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAnalysisProfile } from "../../../pac/analysis-profile.js";
import { resolveSynthesisMaxOutputTokens } from "../../../utils/resolve-synthesis-ceiling.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { ReportSpec } from "../../../models/intent.js";
import { initAgentRunState } from "../../../pac/types.js";
import { nextPhaseAfterCritique } from "../../../pac/transitions.js";
import type { CritiqueReport } from "../../../models/critique-report.js";

function baseState(
  mode: "lite" | "deep",
  overrides: Partial<AnalysisState> = {}
): AnalysisState {
  const profile = resolveAnalysisProfile(mode);
  return {
    analysisProfile: profile,
    agent: initAgentRunState("CREATE", { maxTurns: profile.maxTurns }),
    request: {
      sessionId: "ceil_test",
      instruction: "Analyse this NDA",
      documentIds: ["doc1"],
      documentTexts: { doc1: "Sample." },
      thinkingMode: mode,
    },
    workspace: { sessionId: "ceil_test", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: "",
      clauseTaxonomyVersion: "",
      riskTaxonomyVersion: "",
    },
    requirementAssessments: [
      {
        requirementId: "nda.confidentiality_definition",
        supportingFindingIds: [],
        summary: "ok",
        status: "covered",
      },
      {
        requirementId: "nda.permitted_disclosures",
        supportingFindingIds: [],
        summary: "ok",
        status: "covered",
      },
      {
        requirementId: "nda.term",
        supportingFindingIds: [],
        summary: "ok",
        status: "partial",
      },
      {
        requirementId: "nda.remedies",
        supportingFindingIds: [],
        summary: "ok",
        status: "covered",
      },
      {
        requirementId: "nda.return",
        supportingFindingIds: [],
        summary: "ok",
        status: "covered",
      },
    ],
    ...overrides,
  };
}

const standardSpec: ReportSpec = {
  reportType: "regime_compliance_memo",
  depth: "standard",
  sections: [
    "scope",
    "requirements_detail",
    "recommendations",
    "conclusion",
  ],
};

describe("synthesis ceiling / truncation repair", () => {
  it("lite standard stays near the depth base", () => {
    const state = baseState("lite");
    const tokens = resolveSynthesisMaxOutputTokens(state, standardSpec);
    assert.ok(tokens >= 1800, `expected >= 1800, got ${tokens}`);
    assert.ok(tokens <= 2800, `expected <= lite hardCap, got ${tokens}`);
  });

  it("deep standard scales above base into the mid range", () => {
    const state = baseState("deep");
    const tokens = resolveSynthesisMaxOutputTokens(state, standardSpec);
    // base 1800 * 1.75 + complexity (~5*80 + 4*100 = 800) ≈ 3950, capped 4800
    assert.ok(tokens > 1800, `deep must exceed base, got ${tokens}`);
    assert.ok(tokens >= 2800 && tokens <= 4800, `got ${tokens}`);
    assert.equal(state.analysisProfile?.synthesisCeilingFactor, 1.75);
    assert.equal(state.analysisProfile?.synthesisHardCap, 4800);
  });

  it("truncation synthesis repair bumps ceiling once within hard cap", () => {
    const state = baseState("deep", {
      synthesisMeta: {
        truncated: true,
        maxOutputTokens: 3000,
        depth: "standard",
      },
      repairContext: {
        analysisId: "ceil_test",
        kind: "synthesis",
        affectedRequirementIds: [],
        affectedPackageIds: [],
        critiqueIssueDetails: ["truncated"],
        preserveFindingsOutsideAffected: true,
      },
      fixPlan: {
        items: [
          {
            workUnitId: "wu-render",
            instruction: "retry",
            sourceItemId: "report-output:truncated",
          },
        ],
        targetedOnly: true,
      },
    });
    const base = resolveSynthesisMaxOutputTokens(
      { ...state, synthesisMeta: { truncated: false, maxOutputTokens: 0, depth: "standard" }, repairContext: null, fixPlan: null },
      standardSpec
    );
    const bumped = resolveSynthesisMaxOutputTokens(state, standardSpec);
    assert.ok(bumped >= base, `bump ${bumped} should be >= ${base}`);
    assert.ok(bumped <= 4800);
  });

  it("truncated report contract failure routes to ACT not PLAN on deep", () => {
    const profile = resolveAnalysisProfile("deep");
    const state = baseState("deep");
    const critique = {
      isGreen: false,
      iteration: 1,
      results: [
        {
          itemId: "report-output:contract",
          status: "fail",
          evidenceVerified: false,
          workUnitId: "wu-render",
        },
      ],
      fixPlan: [
        {
          workUnitId: "wu-render",
          instruction:
            "Prior synthesis truncated; raise ceiling and complete missing ReportSpec sections",
          sourceItemId: "report-output:contract",
        },
      ],
      skeletonMismatch: false,
      metrics: { replanCount: 0 },
      release: {
        verdict: "release_with_limitations",
        reasons: [],
        requirementCoverage: {
          total: 0,
          covered: 0,
          entries: [],
          notCovered: [],
          needsReplan: [],
        },
        alignment: { issues: [] },
        placeholderReport: { detected: false },
      },
    } as unknown as CritiqueReport;

    assert.equal(nextPhaseAfterCritique(state, critique), "ACT");
    assert.equal(profile.maxTier2Attempts, 1);
  });
});
