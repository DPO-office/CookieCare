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
  assessmentTableMarkdown,
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

  it("replaces an LLM findings table with locked labels for that section only", () => {
    const markdown = [
      "## Processing particulars",
      "The mapped obligations are mixed.",
      "",
      "| Requirement | Status | Evidence | Finding |",
      "| :--- | :--- | :--- | :--- |",
      "| Subject matter of processing | **Gap** | Annex 2 | Confirm annex particulars. |",
      "",
      "## Conclusion",
      "Confirm the annex.",
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
        requirementAssessments: [
          {
            requirementId: "req.access",
            supportingFindingIds: ["f1"],
            status: "covered",
            summary: "Access is named.",
          },
          {
            requirementId: "art28_3_g_deletion_return",
            supportingFindingIds: ["f_del"],
            status: "conditional",
            summary: "Deletion exception is broad.",
          },
        ],
        findings: [
          finding("f1", "The processor shall assist with access requests."),
          {
            ...finding("f_del", "unless applicable local law requires storage"),
            requirementId: "art28_3_g_deletion_return",
            claim: "The deletion exception is broader than Union or Member State law.",
          },
        ],
        plan: {
          focus: { matrixRowIds: ["row.access"] },
          outputForm: "table",
          reportSpec: {
            reportType: "regime_compliance_memo",
            depth: "standard",
            sections: ["requirements_matrix", "conclusion"],
            outline: [
              {
                id: "chapeau",
                role: "chapeau_particulars",
                sectionId: "chapeau_particulars",
                heading: "Processing particulars",
                requirementIds: ["req.access"],
                source: "deterministic",
              },
            ],
          },
        },
      })
    );
    assert.equal(countMarkdownTables(out), 1);
    assert.match(out, /Present & adequate/);
    assert.doesNotMatch(out, /\|\s*Subject matter of processing\s*\|\s*\*\*Gap\*\*/);
    assert.doesNotMatch(out, /Art 28\(3\)\(g\)/);
    assert.doesNotMatch(out, /deletion exception is broader/i);
  });

  it("uses this row's quote and never an em dash for empty evidence", () => {
    const markdown = assessmentTableMarkdown(
      [
        {
          requirementId: "art28_3_b_confidentiality",
          supportingFindingIds: ["f_conf", "f_del"],
          status: "adequate",
          summary: "Staff confidentiality is present.",
        },
        {
          requirementId: "art28_3_g_deletion_return",
          supportingFindingIds: ["f_del"],
          status: "conditional",
          summary: "Deletion exception is broad.",
        },
        {
          requirementId: "duration",
          supportingFindingIds: ["f_duration"],
          status: "strong",
          summary: "Duration follows the agreement term.",
        },
      ],
      [
        {
          ...finding("f_conf", "Personnel shall keep personal data confidential."),
          requirementId: "art28_3_b_confidentiality",
          claim: "Staff are bound to confidentiality.",
        },
        {
          ...finding("f_del", "unless applicable local law requires storage"),
          requirementId: "art28_3_g_deletion_return",
          claim: "The deletion exception is broader than Union or Member State law.",
        },
        {
          ...finding("f_duration", ""),
          requirementId: "duration",
          claim: "Duration follows the agreement term.",
          evidence: [],
        },
      ]
    );
    assert.match(markdown, /Personnel shall keep personal data confidential/);
    assert.match(markdown, /Staff are bound to confidentiality/);
    const confidentialityRow = markdown
      .split("\n")
      .find((line) => /confidentiality/i.test(line));
    assert.ok(confidentialityRow);
    assert.doesNotMatch(confidentialityRow!, /deletion exception is broader/i);
    assert.doesNotMatch(confidentialityRow!, /unless applicable local law/i);
    assert.match(markdown, /No verbatim extract/);
    assert.doesNotMatch(markdown, /\| — \|/);
    assert.doesNotMatch(markdown, /\| - \|/);
  });

  it("injects locked Present duration when outline still carries PLAN ids", () => {
    const quote =
      "The duration of the Processing under this DPA is determined by You and as set forth in the Agreement.";
    const out = enforceAnswerStyleLayout(
      ["## Processing particulars", "", "| Duration | **Cannot determine** | No verbatim extract |", ""].join(
        "\n"
      ),
      state({
        request: {
          sessionId: "s1",
          instruction: "Review Art 28 duration.",
          documentIds: ["doc-1"],
          documentTexts: {},
          answerStyle: "tabular",
        },
        intent: {
          scope: "whole_document",
          operation: "compliance_check",
          standard: "regime_pack:gdpr",
          outputForm: "table",
          compound: false,
          subIntents: [],
          requirements: [
            {
              id: "gdpr.article28.duration",
              description: "Verify duration",
              type: "adequacy",
              priority: "required",
            },
          ],
          confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
        },
        requirementAssessments: [
          {
            requirementId: "duration",
            supportingFindingIds: ["f_duration"],
            status: "strong",
            judgement: {
              compliance: "present",
              evidenceState: "direct",
              referenceBinding: "none",
              evidenceConfidence: "high",
              draftingQuality: "clean",
              materiality: "low",
              recommendationKind: "none",
            },
            summary: "Duration is set forth in the Agreement.",
          },
        ],
        findings: [
          {
            ...finding("f_duration", quote),
            requirementId: "duration",
            claim: "Duration is set forth in the Agreement.",
          },
        ],
        plan: {
          outputForm: "table",
          reportSpec: {
            reportType: "regime_compliance_memo",
            depth: "deep",
            sections: ["executive_summary", "requirements_matrix", "conclusion"],
            outline: [
              {
                id: "analysis.particulars",
                role: "chapeau_particulars",
                sectionId: "chapeau_particulars",
                heading: "Processing particulars",
                requirementIds: ["gdpr.article28.duration"],
                source: "deterministic",
              },
            ],
          },
        },
      })
    );
    assert.match(out, /Strong|Present/);
    assert.match(out, /set forth in the Agreement/);
    assert.doesNotMatch(out, /Cannot determine/);
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
