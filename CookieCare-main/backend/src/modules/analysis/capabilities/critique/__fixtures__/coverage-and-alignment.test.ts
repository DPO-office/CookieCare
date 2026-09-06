process.env.GOOGLE_CLOUD_PROJECT ??= "critique-coverage-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisPlan, AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import { initAgentRunState } from "../../../pac/types.js";
import { validateRequirementCoverage } from "../coverage.js";
import { validateAlignment } from "../alignment.js";
import { validateRequirements } from "../validators/requirements.js";

type FixtureOverrides = Omit<Partial<AnalysisState>, "plan"> & {
  plan?: Partial<AnalysisPlan>;
};

function baseState(overrides: FixtureOverrides = {}): AnalysisState {
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
  } as AnalysisState;
}

describe("coverage and alignment", () => {
  it("accepts package-native child findings referenced by a PLAN umbrella assessment", () => {
    const requestId = "gdpr.article28_3.processor_obligations";
    const nativeId = "art28_3_a_instructions";
    const intent = {
      ...baseState().intent!,
      requirements: [
        {
          id: requestId,
          description: "Verify all mandatory processor obligations",
          type: "adequacy" as const,
          priority: "required" as const,
        },
      ],
    };
    const workUnit: AnalysisWorkUnit = {
      workUnitId: "wu-mandatory",
      tool: "evaluate_package",
      input: {
        packageId: "gdpr.art28.3.mandatory_clauses",
        requirementIds: [nativeId],
      },
      requirementIds: [requestId],
      dependsOn: [],
      outputSchema: "Finding[]",
      status: "done",
    };
    const state = baseState({
      intent,
      findings: [
        {
          findingId: "f-instructions",
          kind: "compliance",
          category: "processor_terms_incomplete",
          status: "present",
          claim: "The processor acts only on documented instructions.",
          evidence: [],
          taxonomyVersion: "1.1.0",
          requirementId: nativeId,
          requestRequirementIds: [requestId],
          packageId: "gdpr.art28.3.mandatory_clauses",
          workUnitId: workUnit.workUnitId,
        },
      ],
      requirementAssessments: [
        {
          requirementId: requestId,
          supportingFindingIds: ["f-instructions"],
          summary: "One mandatory component is present.",
          status: "conditional",
        },
      ],
      plan: {
        intent,
        workUnits: [workUnit],
        missingClarifications: [],
        outputForm: "memo",
        requirementExecutionPaths: [
          {
            requirementId: requestId,
            status: "supported",
            packageId: "gdpr.art28.3.mandatory_clauses",
          },
        ],
        requirementBindings: [
          {
            requestRequirementId: requestId,
            nativeRequirementId: nativeId,
            packageId: "gdpr.art28.3.mandatory_clauses",
            relation: "child",
            source: "capability",
          },
        ],
      },
    });

    const coverage = validateRequirementCoverage(state);
    assert.equal(coverage.covered, 1);
    assert.deepEqual(coverage.notCovered, []);

    const results: Parameters<typeof validateRequirements>[3] = [];
    const fixes: Parameters<typeof validateRequirements>[4] = [];
    const targets: Parameters<typeof validateRequirements>[5] = [];
    validateRequirements(state, state.findings, [workUnit], results, fixes, targets);
    assert.equal(
      results.find((item) => item.itemId === `requirement-refs:${requestId}`)?.status,
      "pass"
    );
  });

  it("matches PLAN and locked assessments through canonical requirement identity", () => {
    const fixture = baseState({
      intent: {
        ...baseState().intent!,
        requirements: [
          {
            id: "gdpr.article28.data_categories_and_subjects",
            description: "Data categories and subjects",
            type: "adequacy",
            priority: "required",
          },
        ],
      },
      requirementAssessments: [
        {
          requirementId: "gdpr.article28.categories_of_data_and_subjects",
          supportingFindingIds: ["f-categories"],
          summary: "Covered",
          status: "covered",
        },
      ],
      findings: [
        {
          findingId: "f-categories",
          kind: "compliance",
          category: "data_categories",
          status: "present",
          claim: "Categories are specified.",
          evidence: [],
          taxonomyVersion: "1.1.0",
          requirementId: "data_categories",
          workUnitId: "wu-categories",
        },
      ],
      plan: {
        intent: {
          ...baseState().intent!,
          requirements: [
            {
              id: "gdpr.article28.data_categories_and_subjects",
              description: "Data categories and subjects",
              type: "adequacy",
              priority: "required",
            },
          ],
        },
        workUnits: [
          {
            workUnitId: "wu-categories",
            tool: "evaluate_package",
            input: {
              packageId: "gdpr.art28.particulars",
              requirementIds: ["gdpr.article28.categories_of_data_and_subjects"],
            },
            requirementIds: ["gdpr.article28.categories_of_data_and_subjects"],
            dependsOn: [],
            outputSchema: "Finding[]",
            status: "done",
          },
        ],
        missingClarifications: [],
        outputForm: "memo",
        requirementExecutionPaths: [
          {
            requirementId: "gdpr.article28.data_categories_and_subjects",
            status: "supported",
            packageId: "gdpr.art28.particulars",
          },
        ],
      },
    });
    const coverage = validateRequirementCoverage(fixture);
    assert.equal(coverage.covered, 1);
    assert.deepEqual(coverage.notCovered, []);
  });

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
