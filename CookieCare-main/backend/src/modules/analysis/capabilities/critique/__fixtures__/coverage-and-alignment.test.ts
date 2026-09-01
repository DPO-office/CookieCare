process.env.GOOGLE_CLOUD_PROJECT ??= "critique-coverage-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import { initAgentRunState } from "../../../pac/types.js";
import { validateRequirementCoverage } from "../coverage.js";
import { validateAlignment } from "../alignment.js";

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "cov_test",
      instruction: "Analyse this NDA",
      documentIds: ["doc1"],
      documentTexts: { doc1: "Sample text." },
    },
    workspace: { sessionId: "cov_test", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: "1.2.0",
      riskTaxonomyVersion: "1.1.0",
    },
    activeSkills: [],
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

describe("coverage and alignment", () => {
  it("marks covered NDA requirement when assessment and finding exist", () => {
    const state = baseState({
      requirementAssessments: [
        {
          requirementId: "nda.confidentiality_definition",
          supportingFindingIds: ["f1"],
          summary: "Defined",
          status: "covered",
        },
      ],
      findings: [
        {
          findingId: "f1",
          kind: "compliance",
          category: "nda_definition_gap",
          status: "present",
          claim: "Confidential information is defined.",
          evidence: [],
          taxonomyVersion: "1.1.0",
          requirementId: "nda.confidentiality_definition",
          workUnitId: "wu1",
        },
      ],
      plan: {
        intent: baseState().intent!,
        workUnits: [
          {
            workUnitId: "wu1",
            tool: "evaluate_package",
            input: { packageId: "nda.structural_review" },
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
            requirementIds: ["nda.confidentiality_definition"],
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
    const coverage = validateRequirementCoverage(state);
    assert.equal(coverage.covered, 1);
    assert.deepEqual(coverage.notCovered, []);
  });

  it("detects wrong execution shape when inventory package planned but only rules ran", () => {
    const state = baseState({
      intent: {
        ...baseState().intent!,
        requirements: [
          {
            id: "international_data_transfer",
            description: "Transfer inventory",
            type: "extraction",
            priority: "required",
          },
        ],
      },
      activeSkillIds: ["regimes/data-protection/international-transfers"],
      plan: {
        intent: baseState().intent!,
        workUnits: [
          {
            workUnitId: "wu-rule",
            tool: "check_against_rule",
            input: { ruleId: "gdpr.art44" },
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        requirementExecutionPaths: [
          {
            requirementId: "international_data_transfer",
            status: "supported",
            packageId: "international_transfer_inventory",
          },
        ],
      },
    });
    const alignment = validateAlignment(state);
    assert.ok(
      alignment.issues.some((i) => i.kind === "wrong_execution_shape"),
      "expected wrong_execution_shape"
    );
  });

  it("detects scope creep when Article 29 scheduled under Article 28-only scope", () => {
    const state = baseState({
      plan: {
        intent: baseState().intent!,
        workUnits: [
          {
            workUnitId: "wu29",
            tool: "check_against_rule",
            input: { ruleId: "gdpr.art29.1" },
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        focus: {
          ruleIds: [],
          matrixRowIds: [],
          riskCategoryIds: [],
          instructionText: "Review Article 28 only",
          explicitScope: {
            articles: [28],
            contextArticles: [],
            allowCrossReferencedContext: true,
            allowOutOfScopeRules: false,
          },
        },
        requirementExecutionPaths: [],
      },
    });
    const alignment = validateAlignment(state);
    assert.ok(alignment.issues.some((i) => i.kind === "scope_creep"));
  });

  it("allows matrix-linked Art 28 assistance when Arts 15-22 matrix rows are in focus", () => {
    const state = baseState({
      activeSkillIds: ["regimes/data-protection/gdpr", "doc-types/dpa"],
      activeSkills: [
        {
          skillId: "regimes/data-protection/gdpr",
          regimeRules: [
            {
              ruleId: "gdpr.art28.3.e",
              label: "Assistance",
              findingCategory: "dsr_assistance_not_operational",
              matrixLinkage: {
                matrixRowIds: [
                  "gdpr.right.access",
                  "gdpr.right.erasure",
                ],
              },
            },
          ],
        } as never,
      ],
      plan: {
        intent: baseState().intent!,
        workUnits: [
          {
            workUnitId: "wu28",
            tool: "check_against_rule",
            input: { ruleId: "gdpr.art28.3.e" },
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
          },
          {
            workUnitId: "wu-m",
            tool: "evaluate_matrix_row",
            input: { rowId: "gdpr.right.access", article: "15" },
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        focus: {
          ruleIds: ["gdpr.art28.3.e"],
          matrixRowIds: ["gdpr.right.access", "gdpr.right.erasure"],
          riskCategoryIds: [],
          instructionText: "Review Articles 15-22",
          explicitScope: {
            articles: [15, 16, 17, 18, 19, 20, 21, 22],
            contextArticles: [],
            allowCrossReferencedContext: true,
            allowOutOfScopeRules: false,
          },
        },
        requirementExecutionPaths: [],
      },
    });
    const alignment = validateAlignment(state);
    assert.equal(
      alignment.issues.some((i) => i.kind === "scope_creep"),
      false,
      "matrix-linked Art 28 must not hard-withhold a DSR memo"
    );
  });

  it("detects wrong package when requirement is not_supported", () => {
    const state = baseState({
      plan: {
        intent: baseState().intent!,
        workUnits: [],
        missingClarifications: [],
        outputForm: "memo",
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
    // Skills are not hydrated on this fixture — current skills cannot promote
    // the path, so Critique must not open ACT/PLAN for an unsatisfiable gap.
    assert.equal(
      alignment.issues.some((i) => i.action === "targeted_redo" || i.action === "replan"),
      false
    );
  });
});
