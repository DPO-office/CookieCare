process.env.GOOGLE_CLOUD_PROJECT ??= "matrix-row-generic-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { ClauseObject } from "../../../models/clause-object.js";
import type { RightsMatrixRow } from "../../../skills/runtime/catalog/types.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";

const {
  applyApplicabilityGate,
  buildMatrixEvaluationPrompt,
  matrixRowSubject,
  resolveMatrixRow,
  resolveGroundedMatrixQuote,
  resolveGroundedMatrixEvidence,
  selectRelevantClauses,
  MATRIX_ROW_MAX_OUTPUT_TOKENS,
  MATRIX_ROW_SYSTEM_INSTRUCTION,
} = await import("../evaluate-matrix-row.js");

function unit(overrides: Record<string, unknown> = {}): AnalysisWorkUnit {
  return {
    workUnitId: "wu-mx",
    tool: "evaluate_matrix_row",
    input: overrides,
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "pending",
  };
}

describe("generic matrix row metadata", () => {
  it("stamps authored findingCategory / preferredClauseTypes / regimeLabel on all GDPR rows", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    const rows = gdpr?.rightsMatrixRows ?? [];
    assert.equal(rows.length, 8);

    const expectedCategory: Record<string, string> = {
      "gdpr.right.access": "dsr_generic_no_named_rights",
      "gdpr.right.rectification": "dsr_generic_no_named_rights",
      "gdpr.right.erasure": "erasure_termination_only_gap",
      "gdpr.right.restriction": "dsr_assistance_not_operational",
      "gdpr.right.notification": "recipient_notification_gap",
      "gdpr.right.portability": "portability_format_unaddressed",
      "gdpr.right.object": "dsr_assistance_not_operational",
      "gdpr.right.automated_decisions": "automated_decision_gap",
    };

    for (const row of rows) {
      assert.equal(row.findingCategory, expectedCategory[row.rowId], row.rowId);
      assert.deepEqual(row.preferredClauseTypes, [
        "data_subject_request_handling",
        "processor_assistance_obligation",
        "data_protection",
      ]);
      assert.equal(row.regimeLabel, "GDPR");
      assert.equal(row.skillId, "regimes/data-protection/gdpr");
      const resolved = resolveMatrixRow(
        unit({
          rowId: row.rowId,
          article: row.article,
          label: row.label,
          findingCategory: row.findingCategory,
          preferredClauseTypes: row.preferredClauseTypes,
          regimeLabel: row.regimeLabel,
          matrixSkillId: row.skillId,
        }),
        []
      );
      assert.equal(resolved.findingCategory, row.findingCategory);
      assert.equal(matrixRowSubject(resolved).includes("GDPR"), true);
    }
  });

  it("applies the authored automated-decision gate with the previous copy", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    const row = gdpr?.rightsMatrixRows?.find((r) => r.rowId === "gdpr.right.automated_decisions");
    assert.ok(row?.applicabilityGate);

    const blocked = applyApplicabilityGate(
      row!.applicabilityGate,
      "The agreement only describes general assistance."
    );
    assert.ok(blocked);
    assert.equal(
      blocked!.claim,
      "The agreement contains no language showing that solely automated decision-making with legal or similarly significant effects is involved. If such processing is in scope, Article 22 exceptions and safeguards should be addressed."
    );
    assert.equal(
      blocked!.gap,
      "Insufficient evidence to confirm that Article 22 applies; add safeguards only if qualifying automated decision-making is involved."
    );

    assert.equal(
      applyApplicabilityGate(
        row!.applicabilityGate,
        "Solely automated decisions require human review."
      ),
      null
    );
  });

  it("builds a CPRA prompt with no GDPR string", () => {
    const row: RightsMatrixRow = {
      rowId: "ccpa.right.deletion",
      article: "1798.105",
      label: "Deletion",
      findingCategory: "cpra_deletion_gap",
      preferredClauseTypes: ["consumer_rights"],
      regimeLabel: "CPRA",
      skillId: "regimes/data-protection/ccpa-cpra",
    };
    const clauses: ClauseObject[] = [
      {
        clauseId: "c1",
        clauseType: "consumer_rights",
        text: "Consumer may request deletion of personal information.",
        locator: { docId: "d", structuralPath: "c1", charRange: [0, 40] },
        taxonomyVersion: "test",
      },
    ];
    const prompt = buildMatrixEvaluationPrompt({
      row,
      instruction: "Review deletion rights",
      previousAttemptFeedback: "",
      matrixSection: "",
      clauses,
    });
    assert.match(prompt, /CPRA Article 1798\.105/);
    assert.doesNotMatch(prompt, /GDPR/i);
    assert.ok(selectRelevantClauses(clauses, row.preferredClauseTypes).length > 0);
  });

  it("caps JSON completion output and keeps the judgment prompt short", () => {
    assert.equal(MATRIX_ROW_MAX_OUTPUT_TOKENS, 1200);
    assert.match(MATRIX_ROW_SYSTEM_INSTRUCTION, /short claim/);
    assert.match(MATRIX_ROW_SYSTEM_INSTRUCTION, /no essay/);
    const prompt = buildMatrixEvaluationPrompt({
      row: {
        rowId: "fixture.right.access",
        article: "1",
        label: "Access",
        findingCategory: "fixture_access_gap",
        regimeLabel: "Fixture",
      },
      instruction: "Map this right",
      previousAttemptFeedback: "",
      matrixSection: "",
      clauses: [],
    });
    assert.match(prompt, /at most two sentences/);
  });

  it("maps an exact matrix quote back to a verbatim source substring", () => {
    const source = "The Processor shall assist\n  the Controller with access requests.";
    assert.equal(
      resolveGroundedMatrixQuote(
        source,
        "the processor shall assist the controller with access requests."
      ),
      source
    );
  });

  it("replaces an ellipsized matrix quote with a contiguous source excerpt", () => {
    const source =
      "Data Protection Rights include the right to know and access Personal Data, the right to rectification and erasure, and the right not to be subject to automated decision-making.";
    const resolved = resolveGroundedMatrixQuote(
      source,
      "Data Protection Rights include...automated decision-making"
    );
    assert.equal(resolved, source.slice(0, -1));
    assert.equal(source.includes(resolved ?? "missing"), true);
    assert.equal(resolved?.includes("..."), false);
  });

  it("rejects paraphrased evidence instead of manufacturing a locator", () => {
    assert.equal(
      resolveGroundedMatrixQuote(
        "The Processor shall assist the Controller.",
        "The vendor will help the customer."
      ),
      undefined
    );
  });

  it("keeps multi-clause matrix support as separately grounded evidence", () => {
    const clauses: ClauseObject[] = [
      {
        clauseId: "rights",
        clauseType: "data_subject_request_handling",
        text: "Data Protection Rights include the right to erasure.",
        locator: { docId: "d", structuralPath: "3.3", charRange: [10, 64] },
        taxonomyVersion: "test",
      },
      {
        clauseId: "assistance",
        clauseType: "processor_assistance_obligation",
        text: "The Processor shall assist the Controller with individual requests.",
        locator: { docId: "d", structuralPath: "3.5.5", charRange: [65, 132] },
        taxonomyVersion: "test",
      },
    ];
    const evidence = resolveGroundedMatrixEvidence(clauses, {
      evidence: [
        { clauseId: "rights", quotedText: "the right to erasure" },
        {
          clauseId: "assistance",
          quotedText: "assist the Controller with individual requests",
        },
      ],
    });
    assert.equal(evidence.length, 2);
    assert.equal(evidence[0].quotedText, "the right to erasure");
    assert.equal(evidence[1].locator.structuralPath, "3.5.5");
  });

  it("drops an invented clause id while retaining independently valid support", () => {
    const clauses: ClauseObject[] = [
      {
        clauseId: "real",
        clauseType: "consumer_rights",
        text: "A consumer may request deletion.",
        locator: { docId: "d", structuralPath: "7", charRange: [0, 32] },
        taxonomyVersion: "test",
      },
    ];
    const evidence = resolveGroundedMatrixEvidence(clauses, {
      evidence: [
        { clauseId: "invented", quotedText: "Anything at all" },
        { clauseId: "real", quotedText: "request deletion" },
      ],
    });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].quotedText, "request deletion");
  });

  it("never dumps more than MATRIX_ROW_MAX_CLAUSES and truncates clause text", async () => {
    const {
      MATRIX_ROW_MAX_CLAUSES,
      MATRIX_ROW_CLAUSE_CHAR_CAP,
    } = await import("../evaluate-matrix-row.js");
    const many: ClauseObject[] = Array.from({ length: 40 }, (_, index) => ({
      clauseId: `c${index}`,
      clauseType: "other",
      text: "x".repeat(2000),
      locator: { docId: "d", structuralPath: `c${index}`, charRange: [0, 10] },
      taxonomyVersion: "test",
    }));
    const selected = selectRelevantClauses(many);
    assert.equal(selected.length, MATRIX_ROW_MAX_CLAUSES);
    const prompt = buildMatrixEvaluationPrompt({
      row: {
        rowId: "fixture.right.access",
        article: "1",
        label: "Access",
        findingCategory: "fixture_access_gap",
      },
      instruction: "Map this right",
      previousAttemptFeedback: "",
      matrixSection: "",
      clauses: selected,
    });
    assert.equal(prompt.includes("x".repeat(MATRIX_ROW_CLAUSE_CHAR_CAP + 1)), false);
  });

  it("times out a hung completion without waiting for it", async () => {
    const { withMatrixRowTimeout, isMatrixRowTimeout } = await import(
      "../evaluate-matrix-row.js"
    );
    const hung = new Promise<string>(() => undefined);
    await assert.rejects(
      () => withMatrixRowTimeout(hung, 20),
      (err: unknown) => isMatrixRowTimeout(err)
    );
  });
});
