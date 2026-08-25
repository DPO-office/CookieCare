process.env.GOOGLE_CLOUD_PROJECT ??= "matrix-focus-orchestration-test";

/**
 * Generic matrix-focus orchestration: leftover-rule dedupe, structural suppress,
 * authored meta bindings, memo renderer, and matrix table artifact.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisSkillConfig, SkillRegimeRule } from "../runtime/catalog/types.js";
import type { InstructionFocus } from "../../models/analysis-plan.js";
import type { IntentRequirement } from "../../models/intent.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import { resolvePackages } from "../runtime/graph/resolve-packages.js";
import { buildActGraphDetailed } from "../runtime/graph/build-act-graph.js";
import { extractInstructionFocus } from "../runtime/focus/extract-instruction-focus.js";
import { matchMetaRequirementBindings } from "../runtime/graph/meta-requirement-bindings.js";
import {
  buildRightsMatrixTableMarkdown,
  filterAssessmentsForMatrixFocus,
  filterFindingsForMatrixFocus,
} from "../../capabilities/reporting/render-output.js";
import { finalizeReportSpec } from "../../capabilities/reporting/finalize-report-spec.js";
import { buildFinalReportSpec } from "../../capabilities/plan/resolve-report-spec.js";
import { MATRIX_ROW_MAX_OUTPUT_TOKENS } from "../../capabilities/act/evaluate-matrix-row.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";

function rule(
  ruleId: string,
  extras: Partial<SkillRegimeRule> = {}
): SkillRegimeRule {
  return {
    ruleId,
    ruleText: `${ruleId} text`,
    checkType: "judgment",
    findingCategory: `${ruleId}_gap`,
    ruleScope: "per_document",
    appliesToClauseTypes: ["data_protection"],
    ...extras,
  };
}

function fixtureSkill(): AnalysisSkillConfig {
  return {
    skillId: "fixture/matrix-regime",
    axis: "regime",
    label: "Fixture matrix regime",
    version: "1.0.0",
    appliesToDocTypes: ["agreement"],
    triggerPhrases: [],
    promptLibraryIds: [],
    clauseTypes: ["data_protection"],
    expectedClauses: [],
    riskCategories: [
      {
        category: "fixture_timeframe_gap",
        displayLabel: "Missing response timeframe",
        guidance: "Flag missing timeframes.",
      },
    ],
    regimeRules: [
      rule("fixture.rule.access", {
        matrixLinkage: { matrixRowIds: ["fixture.right.access"] },
      }),
      rule("fixture.rule.erasure", {
        matrixLinkage: { matrixRowIds: ["fixture.right.erasure"] },
      }),
      rule("fixture.rule.timeframe"),
      rule("fixture.rule.assist", {
        matrixLinkage: { matrixRowIds: ["fixture.right.access", "fixture.right.erasure"] },
      }),
      rule("fixture.rule.structure"),
      rule("fixture.art99.companion"),
    ],
    instructionFocusMap: [
      {
        triggerPhrases: ["rights matrix"],
        focus: {
          ruleIds: ["fixture.art99.companion"],
          matrixRowIds: ["fixture.right.access", "fixture.right.erasure"],
        },
      },
    ],
    defaultOperation: "compliance_check",
    rightsMatrixRows: [
      {
        rowId: "fixture.right.access",
        article: "1",
        label: "Access",
        findingCategory: "fixture_access_gap",
      },
      {
        rowId: "fixture.right.erasure",
        article: "2",
        label: "Erasure",
        findingCategory: "fixture_erasure_gap",
      },
    ],
    metaRequirementBindings: [
      {
        match: { idIncludes: ["response_timeframe"], types: ["extraction"] },
        capabilityIds: ["fixture.rule.timeframe", "fixture_timeframe_gap"],
      },
      {
        match: { idIncludes: ["assistance_obligation"] },
        capabilityIds: ["fixture.right.access", "fixture.right.erasure"],
      },
    ],
    evidencePackages: [
      {
        id: "fixture.structural_review",
        kind: "evaluation",
        requirementIds: ["fixture.subject_matter_defined"],
        capabilityIds: ["fixture.rule.structure"],
        clauseTypes: ["data_protection"],
        extractionTargets: [],
        sourceMode: "authored",
        requirementKinds: ["adequacy", "verification"],
        packageVersion: "0.1.0",
        orchestration: {
          role: "structural_review",
          suppressWhenMatrixFocus: true,
        },
      },
      {
        id: "fixture.rights_matrix",
        requirementIds: ["data_subject_rights"],
        capabilityIds: [
          "fixture.right.access",
          "fixture.right.erasure",
          "fixture.rule.assist",
        ],
        clauseTypes: ["data_protection"],
        extractionTargets: [],
        sourceMode: "authored",
        packageVersion: "0.1.0",
        orchestration: {
          role: "matrix_owner",
          matrixDeferCapabilities: ["fixture.rule.assist"],
        },
        report: {
          reportType: "rights_matrix",
          sections: [
            "executive_summary",
            "requirements_matrix",
            "material_gaps",
            "recommendations",
            "conclusion",
          ],
          outlineExtras: [
            {
              heading: "Rights and obligations matrix",
              sectionId: "requirements_matrix",
              artifactTypes: ["rights_matrix_table"],
            },
          ],
        },
      },
    ],
  };
}

function focus(partial: Partial<InstructionFocus>): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText: "Map the rights as a table",
    ...partial,
  };
}

function intent(requirements: IntentRequirement[] = []) {
  return {
    scope: "whole_document" as const,
    operation: "compliance_check" as const,
    standard: "none" as const,
    outputForm: "memo" as const,
    compound: false,
    subIntents: [],
    requirements,
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
  };
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: "f1",
    kind: "compliance",
    category: "fixture_access_gap",
    status: "present",
    claim: "Access is named.",
    evidence: [],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    ...overrides,
  };
}

describe("matrix-focus package resolution", () => {
  it("drops matrix-linked leftover rules and keeps non-linked timeframe rules", () => {
    const skill = fixtureSkill();
    const resolution = resolvePackages(
      [skill],
      focus({
        matrixRowIds: ["fixture.right.access", "fixture.right.erasure"],
        ruleIds: [
          "fixture.rule.access",
          "fixture.rule.erasure",
          "fixture.rule.timeframe",
          "fixture.rule.assist",
        ],
        selectedPackageIds: ["fixture.rights_matrix", "fixture.structural_review"],
      })
    );
    assert.deepEqual(resolution.packages.map((item) => item.pkg.id), []);
    assert.deepEqual(resolution.leftoverMatrixRowIds.sort(), [
      "fixture.right.access",
      "fixture.right.erasure",
    ]);
    assert.equal(resolution.leftoverRuleIds.includes("fixture.rule.access"), false);
    assert.equal(resolution.leftoverRuleIds.includes("fixture.rule.erasure"), false);
    assert.equal(resolution.leftoverRuleIds.includes("fixture.rule.assist"), false);
    assert.ok(resolution.leftoverRuleIds.includes("fixture.rule.timeframe"));
    assert.ok(
      (resolution.reportPackages ?? []).some((pkg) => pkg.id === "fixture.rights_matrix")
    );
  });

  it("does not select a structural package for matrix-only requirements", () => {
    const skill = fixtureSkill();
    const matrixReq: IntentRequirement = {
      id: "assistance_obligations.access",
      description: "Processor assistance with access requests",
      type: "verification",
      priority: "required",
    };
    const gapReq: IntentRequirement = {
      id: "compliance_gaps.rights",
      description: "Material gaps in the rights table",
      type: "verification",
      priority: "required",
    };
    const resolution = resolvePackages(
      [skill],
      focus({
        matrixRowIds: ["fixture.right.access", "fixture.right.erasure"],
        ruleIds: ["fixture.rule.access"],
        selectedPackageIds: ["fixture.structural_review"],
        requirements: [
          { id: matrixReq.id, label: matrixReq.description },
          { id: gapReq.id, label: gapReq.description },
        ],
      }),
      [matrixReq, gapReq]
    );
    assert.equal(
      resolution.packages.some((item) => item.pkg.id === "fixture.structural_review"),
      false
    );
  });

  it("selects structural package when a matching structural requirement is present", () => {
    const skill = fixtureSkill();
    const structural: IntentRequirement = {
      id: "fixture.subject_matter_defined",
      description: "Whether subject matter is defined",
      type: "adequacy",
      priority: "required",
    };
    const resolution = resolvePackages(
      [skill],
      focus({
        matrixRowIds: ["fixture.right.access"],
        selectedPackageIds: ["fixture.structural_review"],
        requirements: [{ id: structural.id, label: structural.description }],
      }),
      [structural]
    );
    assert.ok(
      resolution.packages.some((item) => item.pkg.id === "fixture.structural_review")
    );
  });
});

describe("phrase-map matrix companions", () => {
  it("keeps authored companion rules when the mapped matrix is fully focused", async () => {
    const skill = fixtureSkill();
    const extracted = await extractInstructionFocus(
      "Review articles 1-2 as a rights matrix",
      [skill]
    );
    assert.ok(extracted);
    assert.ok(extracted!.matrixRowIds.includes("fixture.right.access"));
    assert.ok(extracted!.matrixRowIds.includes("fixture.right.erasure"));
    assert.ok(extracted!.ruleIds.includes("fixture.art99.companion"));
    assert.equal(extracted!.ruleIds.includes("fixture.rule.access"), false);
  });

  it("does not add companions when only a subset of the mapped matrix is focused", async () => {
    const skill = fixtureSkill();
    const extracted = await extractInstructionFocus(
      "Give me a brief overview of article 1, nothing more than that.",
      [skill]
    );
    assert.ok(extracted);
    assert.deepEqual(extracted!.matrixRowIds, ["fixture.right.access"]);
    assert.equal(extracted!.ruleIds.includes("fixture.art99.companion"), false);
  });
});

describe("authored meta-requirement bindings", () => {
  it("maps response_timeframe extraction ids via skill bindings, not resolver tables", () => {
    const skill = fixtureSkill();
    const caps = matchMetaRequirementBindings(
      {
        id: "response_timeframes.one_month",
        type: "extraction",
        label: "Identify the response timeframe",
      },
      [skill]
    );
    assert.deepEqual(caps, ["fixture.rule.timeframe", "fixture_timeframe_gap"]);
    const resolution = resolvePackages(
      [skill],
      focus({
        matrixRowIds: ["fixture.right.access"],
        requirements: [
          { id: "response_timeframes.one_month", label: "Identify the response timeframe" },
        ],
      }),
      [
        {
          id: "response_timeframes.one_month",
          description: "Identify the response timeframe",
          type: "extraction",
          priority: "required",
        },
      ]
    );
    const path = resolution.requirementPaths.find(
      (item) => item.requirementId === "response_timeframes.one_month"
    );
    assert.equal(path?.status, "supported");
    assert.ok(path?.ruleIds?.includes("fixture.rule.timeframe"));
  });
});

describe("matrix-focus ACT graph", () => {
  it("schedules one evaluate_matrix_row per focused row, no duplicate matrix-linked rules, memo renderer", () => {
    const skill = fixtureSkill();
    const graph = buildActGraphDetailed({
      docId: "doc-1",
      instruction: "Map the rights as a table",
      skills: [skill],
      intent: intent(),
      focus: focus({
        matrixRowIds: ["fixture.right.access", "fixture.right.erasure"],
        ruleIds: [
          "fixture.rule.access",
          "fixture.rule.erasure",
          "fixture.rule.timeframe",
        ],
      }),
    });
    assert.equal(graph.rendererSchemaId, "memo");
    const matrixRows = graph.workUnits.filter((unit) => unit.tool === "evaluate_matrix_row");
    assert.equal(matrixRows.length, 2);
    const leftoverRules = graph.workUnits
      .filter((unit) => unit.tool === "check_against_rule")
      .map((unit) => String(unit.input.ruleId));
    assert.equal(leftoverRules.includes("fixture.rule.access"), false);
    assert.equal(leftoverRules.includes("fixture.rule.erasure"), false);
    assert.ok(leftoverRules.includes("fixture.rule.timeframe"));
    assert.equal(
      graph.workUnits.filter((unit) => unit.tool === "evaluate_package").length,
      0
    );
  });
});

describe("matrix-focus render materials", () => {
  it("builds a rights_matrix_table artifact and omits structural findings without matrixRowId", () => {
    const skill = fixtureSkill();
    const matrixFinding = finding({
      findingId: "f-matrix",
      matrixRowId: "fixture.right.access",
      matrixAddressing: "named",
    });
    const structuralFinding = finding({
      findingId: "f-struct",
      packageId: "fixture.structural_review",
      workUnitId: "wu-pkg-eval-fixture.structural_review",
      category: "fixture_structure_gap",
      claim: "Subject matter of processing is missing.",
      requirementId: "fixture.subject_matter_defined",
    });
    const state = {
      activeSkills: [skill],
      request: { instruction: "Map the rights as a table" },
      plan: {
        focus: focus({
          matrixRowIds: ["fixture.right.access"],
        }),
        reportSpec: buildFinalReportSpec({
          intent: intent(),
          reportType: "rights_matrix",
          depth: "standard",
          sections: [
            "executive_summary",
            "requirements_matrix",
            "material_gaps",
            "recommendations",
            "conclusion",
          ],
          outlineExtras: [
            {
              heading: "Rights and obligations matrix",
              sectionId: "requirements_matrix",
              artifactTypes: ["rights_matrix_table"],
            },
          ],
          instruction: "Map the rights as a table",
        }),
      },
      findings: [matrixFinding, structuralFinding],
      requirementAssessments: [
        {
          requirementId: "fixture.right.access",
          supportingFindingIds: ["f-matrix"],
          status: "covered",
          summary: "Access is named.",
        },
        {
          requirementId: "fixture.subject_matter_defined",
          supportingFindingIds: ["f-struct"],
          status: "missing",
          summary: "Subject matter missing.",
        },
      ],
      analysisArtifacts: {},
    } as unknown as AnalysisState;

    const visible = filterFindingsForMatrixFocus(state.findings ?? [], state);
    assert.equal(visible.some((item) => item.findingId === "f-matrix"), true);
    assert.equal(visible.some((item) => item.findingId === "f-struct"), false);
    const assessments = filterAssessmentsForMatrixFocus(
      state.requirementAssessments ?? [],
      visible,
      state
    );
    assert.equal(
      assessments.some((item) => item.requirementId === "fixture.subject_matter_defined"),
      false
    );

    const table = buildRightsMatrixTableMarkdown(state, visible);
    assert.match(table, /Access/);
    assert.match(table, /Named/);

    const withArtifact: AnalysisState = {
      ...state,
      findings: visible,
      requirementAssessments: assessments,
      analysisArtifacts: {
        rights_matrix_table: {
          id: "rights_matrix_table",
          type: "rights_matrix_table",
          packageId: "fixture.rights_matrix",
          data: { markdown: table },
        },
      },
    };
    const spec = finalizeReportSpec(withArtifact);
    assert.ok(spec.sections.includes("requirements_matrix"));
    assert.ok(
      (spec.outline ?? []).some((item) =>
        (item.artifactTypes ?? []).includes("rights_matrix_table")
      )
    );
    assert.ok(
      !(spec.outline ?? []).some((item) =>
        item.requirementIds.includes("fixture.subject_matter_defined")
      )
    );
  });
});

describe("matrix-row completion cap", () => {
  it("hard-caps evaluate_matrix_row JSON completions", () => {
    assert.equal(MATRIX_ROW_MAX_OUTPUT_TOKENS, 1200);
    assert.ok(MATRIX_ROW_MAX_OUTPUT_TOKENS <= 1200);
  });
});
