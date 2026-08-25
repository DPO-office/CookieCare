process.env.GOOGLE_CLOUD_PROJECT ??= "answer-style-layout-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";
import { resolvePlanOutputForm } from "../../plan/build-plan.js";
import { wantsMatrixTable } from "../../../prompts/synthesis.js";
import {
  attachRightsMatrixTableArtifact,
  countMarkdownTables,
  enforceAnswerStyleLayout,
} from "../render-output.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";

function finding(id: string, quote: string): Finding {
  return {
    findingId: id,
    kind: "compliance",
    category: "other_known_risk",
    status: "present",
    claim: `${id} is named.`,
    evidence: [
      {
        locator: {
          docId: "doc-1",
          structuralPath: "p1",
          charRange: [0, quote.length],
        },
        quotedText: quote,
        sourceRole: "target",
      },
    ],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    matrixRowId: "row.access",
  };
}

function state(overrides: Record<string, unknown> = {}): AnalysisState {
  return {
    request: {
      sessionId: "s1",
      instruction: "Review the mapped obligations.",
      documentIds: ["doc-1"],
      documentTexts: {},
      answerStyle: "narrative",
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
    workspace: {},
    findings: [finding("f1", "The processor shall assist with access requests.")],
    requirementAssessments: [
      {
        requirementId: "req.access",
        supportingFindingIds: ["f1"],
        status: "covered",
        summary: "Access is named.",
      } satisfies RequirementAssessment,
    ],
    analysisArtifacts: {},
    plan: {
      focus: { matrixRowIds: ["row.access"] },
      outputForm: "memo",
    },
    ...overrides,
  } as unknown as AnalysisState;
}

describe("narrative vs tabular layout contract", () => {
  it("does not attach a rights-matrix table artifact in narrative mode", () => {
    const next = attachRightsMatrixTableArtifact(state(), state().findings ?? []);
    assert.equal(next.analysisArtifacts?.rights_matrix_table, undefined);
  });

  it("attaches a rights-matrix table artifact when tabular or the user asked for a table", () => {
    const tabular = attachRightsMatrixTableArtifact(
      state({
        request: {
          sessionId: "s1",
          instruction: "Review the mapped obligations.",
          documentIds: ["doc-1"],
          documentTexts: {},
          answerStyle: "tabular",
        },
      }),
      state().findings ?? []
    );
    assert.ok(tabular.analysisArtifacts?.rights_matrix_table);

    const asked = attachRightsMatrixTableArtifact(
      state({
        request: {
          sessionId: "s1",
          instruction: "Map the rights as a table",
          documentIds: ["doc-1"],
          documentTexts: {},
          answerStyle: "narrative",
        },
      }),
      state().findings ?? []
    );
    assert.ok(asked.analysisArtifacts?.rights_matrix_table);
    assert.equal(wantsMatrixTable(asked), true);
  });

  it("keeps at most one markdown table in narrative output", () => {
    const markdown = [
      "# Review",
      "",
      "## Summary",
      "| A | B |",
      "| --- | --- |",
      "| short | row |",
      "",
      "## Analysis",
      "| Requirement | Status | Evidence | Finding |",
      "| :--- | :--- | :--- | :--- |",
      "| Access | covered | The processor shall assist | Named in clause 8 |",
      "| Erasure | partial | Annex missing particulars | Obtain annex |",
    ].join("\n");
    const out = enforceAnswerStyleLayout(markdown, state());
    assert.equal(countMarkdownTables(out), 1);
    assert.match(out, /Requirement/);
    assert.doesNotMatch(out, /\| short \| row \|/);
  });

  it("injects an assessment table when a tabular section has no table", () => {
    const markdown = [
      "# Review",
      "",
      "## Requirements matrix",
      "The mapped obligations are mixed.",
      "",
      "## Conclusion",
      "Confirm the annex particulars.",
    ].join("\n");
    const out = enforceAnswerStyleLayout(
      markdown,
      state({
        request: {
          sessionId: "s1",
          instruction: "Present as a table",
          documentIds: ["doc-1"],
          documentTexts: {},
          answerStyle: "tabular",
        },
      })
    );
    assert.ok(countMarkdownTables(out) >= 1);
    assert.match(out, /Requirement/);
    assert.match(out, /Access/i);
    assert.match(out, /Present & adequate/);
  });

  it("preserves tabular outputForm instead of collapsing rights_matrix to memo", () => {
    const intent = {
      scope: "whole_document" as const,
      operation: "compliance_check" as const,
      standard: "none" as const,
      outputForm: "table" as const,
      compound: false,
      subIntents: [],
      requirements: [],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    };
    assert.equal(resolvePlanOutputForm(intent, "rights_matrix", "tabular"), "table");
    assert.equal(resolvePlanOutputForm(intent, "rights_matrix", "narrative"), "table");
    assert.equal(
      resolvePlanOutputForm({ ...intent, outputForm: "memo" }, "rights_matrix", "narrative"),
      "memo"
    );
  });
});
