process.env.GOOGLE_CLOUD_PROJECT ??= "critique-lite-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";

const { runCritiqueLite } = await import(
  "../../capabilities/critique/run-critique-lite.js"
);
const { runCritique } = await import(
  "../../capabilities/critique/run-critique.js"
);
const { replaceRenderMarker } = await import(
  "../../capabilities/reporting/render-output.js"
);

const TEXT =
  "The processor shall use personal data only for the documented business purpose.";

function unit(): AnalysisWorkUnit {
  return {
    workUnitId: "wu-pkg-eval-test",
    tool: "evaluate_package",
    input: {
      packageId: "test.package",
      requirementIds: ["req"],
      capabilityIds: [],
    },
    dependsOn: ["wu-pkg-ev-test"],
    outputSchema: "Finding[]",
    status: "done",
  };
}

function finding(
  id: string,
  requirementId: string,
  overrides: Partial<Finding> = {}
): Finding {
  return {
    findingId: id,
    kind: "compliance",
    category: "other_known_risk",
    status: "present",
    claim: "The agreement contains a documented purpose restriction.",
    evidence: [
      {
        locator: {
          docId: "doc1",
          structuralPath: "paragraph-1",
          charRange: [0, TEXT.length],
        },
        quotedText: TEXT,
        sourceRole: "target",
      },
    ],
    severity: "medium",
    taxonomyVersion: "test",
    workUnitId: "wu-pkg-eval-test",
    visibility: "user_facing",
    requirementId,
    ...overrides,
  };
}

function assessment(
  requirementId: string,
  supportingFindingIds: string[],
  status: RequirementAssessment["status"] = "covered"
): RequirementAssessment {
  return {
    requirementId,
    supportingFindingIds,
    summary: "Test assessment",
    status,
  };
}

function state(
  findings: Finding[],
  assessments: RequirementAssessment[],
  instruction = "Review this agreement"
): AnalysisState {
  return {
    request: {
      sessionId: "critique-lite-test",
      instruction,
      documentIds: ["doc1"],
      documentTexts: { doc1: TEXT },
    },
    workspace: {
      sessionId: "critique-lite-test",
      documents: [
        {
          docId: "doc1",
          role: "target",
          fullText: TEXT,
          segments: [],
          clauses: [],
        },
      ],
    },
    intent: {
      scope: "whole_document",
      operation: "compliance_check",
      standard: "none",
      outputForm: "memo",
      compound: false,
      subIntents: [],
      requirements: [],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    },
    plan: {
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
      workUnits: [
        {
          ...unit(),
          workUnitId: "wu-render",
          tool: "render_output",
          input: { schemaId: "memo" },
          status: "done",
        },
        unit(),
      ],
      missingClarifications: [],
      outputForm: "memo",
      rendererSchemaId: "memo",
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["scope", "requirements_detail", "conclusion"],
      },
      pinnedVersions: {
        clauseTaxonomyVersion: "test",
        riskTaxonomyVersion: "test",
      },
    },
    findings,
    requirementAssessments: assessments,
    renderedOutput:
      "# Test report\n\n## Scope\n\nReview complete.\n\n## Requirements detail\n\nPurpose restriction is documented.\n\n## Conclusion\n\nDone.",
    activeSkills: [
      {
        skillId: "_global",
        axis: "global",
        label: "Global",
        version: "test",
        appliesToDocTypes: [],
        triggerPhrases: [],
        promptLibraryIds: [],
        defaultOperation: "risk_flag",
        riskCategories: [
          {
            category: "other_known_risk",
            displayLabel: "Other risk",
            guidance: "test",
          },
        ],
        regimeRules: [],
        clauseTypes: [],
        expectedClauses: [],
      },
    ],
    activeSkillIds: ["_global"],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: "test",
      riskTaxonomyVersion: "test",
    },
  };
}

describe("Critique Lite trigger policy", () => {
  it("A: clean normal run has no Deep Critique targets", () => {
    const result = runCritiqueLite(
      state([finding("f1", "req")], [assessment("req", ["f1"])])
    );
    assert.equal(result.structurallyValid, true);
    assert.equal(result.deepCritiqueRequired, false);
  });

  it("A2: clean normal run completes with zero Critique LLM calls", async () => {
    const result = await runCritique(
      state([finding("f1", "req")], [assessment("req", ["f1"])])
    );
    assert.equal(result.critique?.deepCritiqueRequired, false);
    assert.equal(result.critique?.metrics?.critiqueLLMCalls, 0);
    assert.equal(result.critique?.executionComplete, true);
  });

  it("A3: presentation-only re-render uses its own release contract", async () => {
    const current = state(
      [finding("f1", "old-requirement")],
      [assessment("old-requirement", ["f1"])]
    );
    current.intent!.requirements = [
      {
        id: "old-requirement",
        description: "Previously locked requirement",
        type: "verification",
        priority: "required",
      },
    ];
    current.plan = {
      ...current.plan!,
      skipCritique: true,
      workUnits: [
        {
          workUnitId: "wu-render",
          tool: "render_output",
          input: {
            schemaId: "table",
            followUpKind: "presentation_change",
          },
          dependsOn: [],
          outputSchema: "string",
          status: "done",
        },
      ],
    };

    const result = await runCritique(current);

    assert.equal(result.critique?.release?.verdict, "release");
    assert.equal(result.critique?.structurallyValid, true);
    assert.equal(result.critique?.release?.requirementCoverage.total, 0);
    assert.deepEqual(result.critique?.release?.alignment.issues, []);
    assert.equal(result.critique?.metrics?.critiqueLLMCalls, 0);
  });

  it("A4: presentation-only re-render with empty output is withheld", async () => {
    const current = state([finding("f1", "req")], [assessment("req", ["f1"])]);
    current.renderedOutput = "";
    current.plan = {
      ...current.plan!,
      skipCritique: true,
      workUnits: [
        {
          workUnitId: "wu-render",
          tool: "render_output",
          input: { followUpKind: "presentation_change" },
          dependsOn: [],
          outputSchema: "string",
          status: "done",
        },
      ],
    };

    const result = await runCritique(current);

    assert.equal(result.critique?.release?.verdict, "withhold");
    assert.equal(result.critique?.release?.placeholderReport.kind, "empty_body");
  });

  it("A5: repeated render markers replace instead of duplicate", () => {
    const prior = finding("f_render_wu-render", "req", {
      kind: "summary_point",
      visibility: "internal",
      claim: "Prior render marker",
      evidence: [],
    });
    const current = {
      ...prior,
      claim: "Current render marker",
    };

    const replaced = replaceRenderMarker([finding("f1", "req"), prior], current);

    assert.equal(
      replaced.filter((item) => item.findingId === "f_render_wu-render").length,
      1
    );
    assert.equal(
      replaced.find((item) => item.findingId === "f_render_wu-render")?.claim,
      "Current render marker"
    );
  });

  it("B: invalid quote/locator creates a targeted deterministic repair only", () => {
    const bad = finding("f1", "req", {
      evidence: [
        {
          locator: {
            docId: "doc1",
            structuralPath: "missing",
            charRange: [0, 5],
          },
          quotedText: "not in the document",
          sourceRole: "target",
        },
      ],
    });
    const result = runCritiqueLite(state([bad], [assessment("req", ["f1"])]));
    assert.equal(result.structurallyValid, false);
    assert.ok(result.fixPlan.some((fix) => fix.workUnitId === bad.workUnitId));
    assert.equal(result.deepCritiqueRequired, false);
  });

  it("C: conflicting evidence targets only that requirement", () => {
    const present = finding("f-present", "req");
    const missing = finding("f-missing", "req", {
      status: "absent_expected",
      evidence: [],
    });
    const result = runCritiqueLite(
      state(
        [present, missing],
        [assessment("req", ["f-present", "f-missing"], "partial")]
      )
    );
    assert.deepEqual(
      result.deepCritiqueTargets.map((target) => target.requirementId),
      ["req"]
    );
    assert.equal(result.deepCritiqueTargets[0]?.reason, "conflicting_evidence");
  });

  it("D: high-materiality conclusion targets only the high finding", () => {
    const normal = finding("f-normal", "normal");
    const high = finding("f-high", "high", { severity: "high" });
    const result = runCritiqueLite(
      state(
        [normal, high],
        [
          assessment("normal", ["f-normal"]),
          assessment("high", ["f-high"]),
        ]
      )
    );
    assert.deepEqual(
      result.deepCritiqueTargets.map((target) => target.findingId),
      ["f-high"]
    );
  });

  it("E: nine good requirements do not join one suspicious target", () => {
    const findings: Finding[] = [];
    const assessments: RequirementAssessment[] = [];
    for (let index = 0; index < 9; index++) {
      const requirementId = `good-${index}`;
      const findingId = `f-good-${index}`;
      findings.push(finding(findingId, requirementId));
      assessments.push(assessment(requirementId, [findingId]));
    }
    findings.push(
      finding("f-bad-present", "bad"),
      finding("f-bad-gap", "bad", {
        status: "absent_expected",
        evidence: [],
      })
    );
    assessments.push(
      assessment("bad", ["f-bad-present", "f-bad-gap"], "partial")
    );
    const result = runCritiqueLite(state(findings, assessments));
    assert.equal(result.deepCritiqueTargets.length, 1);
    assert.equal(result.deepCritiqueTargets[0]?.requirementId, "bad");
  });

  it("F: explicit rigorous request creates requirement-level targets", () => {
    const result = runCritiqueLite(
      state(
        [finding("f1", "req")],
        [assessment("req", ["f1"])],
        "Perform a rigorous clause-by-clause compliance review"
      )
    );
    assert.equal(result.deepCritiqueTargets.length, 1);
    assert.equal(
      result.deepCritiqueTargets[0]?.reason,
      "explicit_rigor_request"
    );
    assert.equal(result.deepCritiqueTargets[0]?.requirementId, "req");
  });
});
