process.env.GOOGLE_CLOUD_PROJECT ??= "matrix-row-generic-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { ClauseObject } from "../../../models/clause-object.js";
import type { RightsMatrixRow } from "../../../skills/types.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/registry.js";

const {
  applyApplicabilityGate,
  buildMatrixEvaluationPrompt,
  matrixRowSubject,
  resolveMatrixRow,
  selectRelevantClauses,
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
      "gdpr.right.rectification": "dsr_assistance_not_operational",
      "gdpr.right.erasure": "erasure_termination_only_gap",
      "gdpr.right.restriction": "dsr_assistance_not_operational",
      "gdpr.right.notification": "dsr_assistance_not_operational",
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
});
