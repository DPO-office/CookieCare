process.env.GOOGLE_CLOUD_PROJECT ??= "synthesis-ceiling-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAnalysisProfile } from "../../../pac/analysis-profile.js";
import {
  resolveSectionMaxOutputTokens,
  resolveSynthesisMaxOutputTokens,
} from "../../../utils/resolve-synthesis-ceiling.js";
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
    assert.ok(tokens <= 3600, `expected <= lite hardCap, got ${tokens}`);
  });

  it("deep standard scales above base into the mid range", () => {
    const state = baseState("deep");
    const tokens = resolveSynthesisMaxOutputTokens(state, standardSpec);
    assert.ok(tokens > 1800, `deep must exceed base, got ${tokens}`);
    assert.ok(tokens >= 2800 && tokens <= 6400, `got ${tokens}`);
    assert.equal(state.analysisProfile?.synthesisCeilingFactor, 1.75);
    assert.equal(state.analysisProfile?.synthesisHardCap, 6400);
  });

  it("per-section budget does not starve analysis when many outline items exist", () => {
    const state = baseState("deep");
    const item = {
      id: "analysis.matrix",
      role: "requirements_matrix" as const,
      sectionId: "requirements_matrix" as const,
      heading: "Requirements matrix",
      requirementIds: ["req.a"],
      source: "deterministic" as const,
    };
    const manySections: ReportSpec = {
      ...standardSpec,
      depth: "deep",
      sections: [
        "executive_summary",
        "requirements_matrix",
        "material_gaps",
        "missing_materials",
        "recommendations",
        "conclusion",
      ],
      outline: Array.from({ length: 10 }, (_, i) => ({
        ...item,
        id: `analysis.${i}`,
        heading: `Section ${i}`,
      })),
    };
    const tokens = resolveSectionMaxOutputTokens(state, manySections, item);
    assert.ok(tokens >= 1800, `analysis floor expected, got ${tokens}`);
    assert.ok(tokens <= 6400);
    // Old bug: totalCeiling/10 would land near 400.
    assert.ok(tokens > 600, `must not divide total by section count; got ${tokens}`);
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
    assert.ok(bumped <= 6400);
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

    assert.equal(nextPhaseAfterCritique(state, critique), "DONE");
    assert.equal(profile.maxTier2Attempts, 0);
  });
});
