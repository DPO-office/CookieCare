process.env.GOOGLE_CLOUD_PROJECT ??= "targeted-repair-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateAlignment } from "../alignment.js";
import { nextPhaseAfterCritique } from "../../../pac/transitions.js";
import { resolveAnalysisProfile } from "../../../pac/analysis-profile.js";
import { initAgentRunState } from "../../../pac/types.js";
import {
  applyPackageShapeRepair,
  repairContextFromAlignment,
} from "../../../skills/runtime/graph/apply-package-shape-repair.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CritiqueReport } from "../../../models/critique-report.js";

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  const profile = resolveAnalysisProfile("deep");
  return {
    analysisProfile: profile,
    agent: initAgentRunState("CREATE", { maxTurns: profile.maxTurns, turn: 0 }),
    request: {
      sessionId: "repair_test",
      instruction: "Analyse this NDA for key risks",
      documentIds: ["doc1"],
      documentTexts: { doc1: "Confidentiality clause sample text." },
      thinkingMode: "deep",
    },
    workspace: { sessionId: "repair_test", documents: [] },
    findings: [
      {
        findingId: "keep-me",
        kind: "compliance",
        category: "unrelated",
        status: "present",
        claim: "Unrelated successful finding",
        evidence: [],
        taxonomyVersion: "1.1.0",
        requirementId: "other.requirement",
        workUnitId: "wu-other",
      },
      {
        findingId: "drop-me",
        kind: "compliance",
        category: "nda_gap",
        status: "present",
        claim: "Rule-shaped NDA finding",
        evidence: [],
        taxonomyVersion: "1.1.0",
        requirementId: "nda.confidentiality_definition",
        workUnitId: "wu-rule-1",
      },
    ],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: "1.2.0",
      riskTaxonomyVersion: "1.1.0",
    },
    activeSkillIds: ["doc-types/nda"],
    intent: {
      scope: "whole_document",
      operation: "compliance_check",
      standard: "none",
      outputForm: "memo",
      compound: false,
      subIntents: [],
      requirements: [
        {
          id: "nda.confidentiality_definition",
          description: "Confidentiality definition",
          type: "adequacy",
          priority: "required",
        },
      ],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    },
    ...overrides,
  };
}

describe("targeted repair classification and package-shape", () => {
  it("emits targeted_redo for wrong_execution_shape", () => {
    const state = baseState({
      plan: {
        intent: baseState().intent!,
        workUnits: [
          {
            workUnitId: "wu-rule-1",
            tool: "check_against_rule",
            input: { ruleId: "nda.some_rule" },
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
          },
          {
            workUnitId: "wu-render",
            tool: "render_output",
            input: {},
            dependsOn: [],
            outputSchema: "string",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        requirementExecutionPaths: [
          {
            requirementId: "nda.confidentiality_definition",
            status: "supported",
            packageId: "nda.structural_review",
          },
        ],
      },
    });
    const alignment = validateAlignment(state);
    const shape = alignment.issues.find((i) => i.kind === "wrong_execution_shape");
    assert.ok(shape);
    assert.equal(shape!.action, "targeted_redo");
  });

  it("emits targeted_redo for not_supported when current skills can run a package", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda");
    assert.ok(nda);
    const state = baseState({
      activeSkills: [nda!],
      activeSkillIds: ["doc-types/nda"],
      plan: {
        intent: baseState().intent!,
        workUnits: [],
        missingClarifications: [],
        outputForm: "memo",
        focus: {
          ruleIds: [],
          matrixRowIds: [],
          riskCategoryIds: [],
          instructionText: "Analyse this NDA for key risks",
        },
        requirementExecutionPaths: [
          {
            requirementId: "nda.confidentiality_definition",
            status: "not_supported",
            reason: "No package",
          },
        ],
      },
    });
    const alignment = validateAlignment(state);
    const issue = alignment.issues.find((i) => i.kind === "wrong_package");
    assert.ok(issue);
    assert.equal(issue!.action, "targeted_redo");
  });

  it("does not loop on GDPR not_supported when only NDA skills are active", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda");
    assert.ok(nda);
    const intent = {
      ...baseState().intent!,
      requirements: [
        {
          id: "gdpr.article28.3.completeness",
          description: "Art 28(3) completeness",
          type: "coverage" as const,
          priority: "required" as const,
        },
      ],
    };
    const state = baseState({
      activeSkills: [nda!],
      activeSkillIds: ["doc-types/nda"],
      intent,
      plan: {
        intent,
        workUnits: [
          {
            workUnitId: "wu-render",
            tool: "render_output",
            input: {},
            dependsOn: [],
            outputSchema: "string",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        focus: {
          ruleIds: [],
          matrixRowIds: [],
          riskCategoryIds: [],
          instructionText: "Analyse this NDA",
        },
        requirementExecutionPaths: [
          {
            requirementId: "gdpr.article28.3.completeness",
            status: "not_supported",
            reason: 'No analysis package for coverage requirement "gdpr.article28.3.completeness"',
          },
        ],
      },
    });
    const alignment = validateAlignment(state);
    assert.equal(
      alignment.issues.some((i) => i.action === "targeted_redo" || i.action === "replan"),
      false,
      "unsatisfiable GDPR gap must not drive ACT or PLAN"
    );

    const critique = {
      isGreen: false,
      iteration: 1,
      results: [],
      fixPlan: [],
      skeletonMismatch: false,
      metrics: { replanCount: 0 },
      release: {
        verdict: "release_with_limitations",
        reasons: ["coverage_gap"],
        alignment: { issues: alignment.issues },
        placeholderReport: { detected: false },
        requirementCoverage: {
          total: 1,
          covered: 0,
          entries: [],
          notCovered: [],
          needsReplan: ["gdpr.article28.3.completeness"],
        },
      },
    } as unknown as CritiqueReport;
    assert.equal(nextPhaseAfterCritique(state, critique), "DONE");
  });

  it("keeps replan when package skill is not active", () => {
    const state = baseState({
      activeSkillIds: [],
      activeSkills: [],
      plan: {
        intent: baseState().intent!,
        workUnits: [],
        missingClarifications: [],
        outputForm: "memo",
        requirementExecutionPaths: [
          {
            requirementId: "nda.confidentiality_definition",
            status: "supported",
            packageId: "nda.structural_review",
          },
        ],
      },
    });
    const alignment = validateAlignment(state);
    const issue = alignment.issues.find(
      (i) => i.kind === "wrong_package" && i.action === "replan"
    );
    assert.ok(issue, "missing skill must force full replan");
  });

  it("targeted_redo + fixPlan → ACT; alignment replan → PLAN", () => {
    const state = baseState();
    const actCritique = {
      isGreen: false,
      iteration: 1,
      results: [],
      fixPlan: [
        {
          workUnitId: "wu-render",
          instruction: "Targeted package-shape repair then re-render",
          sourceItemId: "alignment:targeted_redo",
        },
      ],
      skeletonMismatch: false,
      metrics: { replanCount: 0 },
      release: {
        alignment: {
          issues: [
            {
              kind: "wrong_execution_shape",
              action: "targeted_redo",
              packageId: "nda.structural_review",
              requirementId: "nda.confidentiality_definition",
              detail: "shape",
            },
          ],
        },
      },
    } as unknown as CritiqueReport;
    assert.equal(nextPhaseAfterCritique(state, actCritique), "DONE");

    const planCritique = {
      ...actCritique,
      fixPlan: [],
      skeletonMismatch: false,
      release: {
        alignment: {
          issues: [
            {
              kind: "wrong_package",
              action: "replan",
              packageId: "nda.structural_review",
              requirementId: "nda.confidentiality_definition",
              detail: "skill missing",
            },
          ],
        },
      },
    } as unknown as CritiqueReport;
    assert.equal(nextPhaseAfterCritique(state, planCritique), "DONE");
  });

  it("applyPackageShapeRepair injects evaluate_package and preserves unrelated findings", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda");
    assert.ok(nda);

    const state = baseState({
      activeSkills: [nda!],
      activeSkillIds: ["doc-types/nda"],
      plan: {
        intent: baseState().intent!,
        workUnits: [
          {
            workUnitId: "wu-classify",
            tool: "classify_document",
            input: { docId: "doc1" },
            dependsOn: [],
            outputSchema: "string",
            status: "done",
          },
          {
            workUnitId: "wu-extract",
            tool: "extract_clauses",
            input: { docId: "doc1", clauseTypes: [], skillIds: ["doc-types/nda"] },
            dependsOn: ["wu-classify"],
            outputSchema: "ClauseObject[]",
            status: "done",
          },
          {
            workUnitId: "wu-rule-1",
            tool: "check_against_rule",
            input: { ruleId: "nda.some_rule", docId: "doc1" },
            dependsOn: ["wu-extract"],
            outputSchema: "Finding[]",
            status: "done",
          },
          {
            workUnitId: "wu-render",
            tool: "render_output",
            input: { schemaId: "memo" },
            dependsOn: ["wu-rule-1"],
            outputSchema: "string",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        reportSpec: {
          reportType: "regime_compliance_memo",
          depth: "standard",
          sections: ["scope", "requirements_detail", "conclusion"],
        },
        focus: {
          ruleIds: [],
          matrixRowIds: [],
          riskCategoryIds: [],
          instructionText: "Analyse this NDA for key risks",
        },
        requirementExecutionPaths: [
          {
            requirementId: "nda.confidentiality_definition",
            status: "supported",
            packageId: "nda.structural_review",
          },
        ],
      },
      repairContext: {
        analysisId: "repair_test",
        kind: "package_shape",
        affectedRequirementIds: ["nda.confidentiality_definition"],
        affectedPackageIds: ["nda.structural_review"],
        critiqueIssueDetails: ["Expected package execution"],
        preserveFindingsOutsideAffected: true,
      },
    });

    const ctx = repairContextFromAlignment(state, [
      {
        action: "targeted_redo",
        requirementId: "nda.confidentiality_definition",
        packageId: "nda.structural_review",
        detail: "shape",
      },
    ]);
    assert.equal(ctx?.kind, "package_shape");

    const repaired = applyPackageShapeRepair(state);
    const tools = repaired.plan?.workUnits.map((u) => u.tool) ?? [];
    assert.ok(
      tools.includes("evaluate_package") || tools.includes("inventory_provisions"),
      `expected package units, got ${tools.join(",")}`
    );
    assert.ok(
      repaired.findings.some((f) => f.findingId === "keep-me"),
      "unrelated finding must be preserved"
    );
    assert.equal(
      repaired.findings.some((f) => f.findingId === "drop-me"),
      false,
      "affected requirement finding should be dropped"
    );
    assert.equal(repaired.fixPlan?.targetedOnly, true);
    assert.ok((repaired.fixPlan?.items.length ?? 0) > 0);
  });

  it("package-shape repair is a no-op when the requirement stays unsupported", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda");
    assert.ok(nda);
    const intent = {
      ...baseState().intent!,
      requirements: [
        {
          id: "gdpr.article28.3.completeness",
          description: "Art 28(3) completeness",
          type: "coverage" as const,
          priority: "required" as const,
        },
      ],
    };
    const keepFinding = {
      findingId: "keep-me",
      kind: "compliance" as const,
      category: "unrelated",
      status: "present" as const,
      claim: "Unrelated successful finding",
      evidence: [],
      taxonomyVersion: "1.1.0",
      requirementId: "other.requirement",
      workUnitId: "wu-other",
    };
    const state = baseState({
      activeSkills: [nda!],
      activeSkillIds: ["doc-types/nda"],
      intent,
      findings: [keepFinding],
      plan: {
        intent,
        workUnits: [
          {
            workUnitId: "wu-extract",
            tool: "extract_clauses",
            input: { docId: "doc1" },
            dependsOn: [],
            outputSchema: "ClauseObject[]",
            status: "done",
          },
          {
            workUnitId: "wu-pkg-eval-nda.structural_review",
            tool: "evaluate_package",
            input: { packageId: "nda.structural_review", docId: "doc1" },
            dependsOn: ["wu-extract"],
            outputSchema: "Finding[]",
            status: "done",
          },
          {
            workUnitId: "wu-render",
            tool: "render_output",
            input: { schemaId: "memo" },
            dependsOn: ["wu-pkg-eval-nda.structural_review"],
            outputSchema: "string",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        focus: {
          ruleIds: [],
          matrixRowIds: [],
          riskCategoryIds: [],
          instructionText: "Analyse this NDA",
        },
        requirementExecutionPaths: [
          {
            requirementId: "gdpr.article28.3.completeness",
            status: "not_supported",
            reason: "No analysis package",
          },
        ],
      },
      repairContext: {
        analysisId: "repair_test",
        kind: "package_shape",
        affectedRequirementIds: ["gdpr.article28.3.completeness"],
        affectedPackageIds: [],
        critiqueIssueDetails: ["No analysis package"],
        preserveFindingsOutsideAffected: true,
      },
    });

    const repaired = applyPackageShapeRepair(state);
    assert.equal(repaired.findings.length, 1);
    assert.equal(repaired.findings[0]?.findingId, "keep-me");
    assert.equal(
      repaired.plan?.workUnits.find((u) => u.tool === "evaluate_package")?.status,
      "done",
      "must not re-flag an already-successful package evaluation"
    );
    assert.equal(repaired.fixPlan, undefined);
  });
});
