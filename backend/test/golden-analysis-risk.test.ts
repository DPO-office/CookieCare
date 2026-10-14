import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkExpectedClauses } from "../src/modules/analysis/capabilities/act/operations/check-clause-coverage.js";
import { segmentDocument } from "../src/modules/analysis/segmentation/segment-document.js";
import { getSkillById } from "../src/modules/analysis/skills/runtime/catalog/registry.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";
import type { AnalysisWorkUnit } from "../src/modules/analysis/models/analysis-plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(
      __dirname,
      "../src/modules/analysis/eval/fixtures/short-msa-risk.json"
    ),
    "utf8"
  )
);

function baseState(docText: string): AnalysisState {
  const docId = "doc-golden";
  const segmented = segmentDocument(docId, docText, { role: "primary" });
  segmented.docType = "msa";
  segmented.clauses = [
    {
      clauseId: "c-indemnity",
      clauseType: "indemnity",
      text: "Customer shall indemnify Provider",
      locator: { docId, structuralPath: "3", charRange: [0, 40] },
      taxonomyVersion: "1.2.0",
    },
    {
      clauseId: "c-termination",
      clauseType: "termination",
      text: "Either party may terminate",
      locator: { docId, structuralPath: "4", charRange: [0, 30] },
      taxonomyVersion: "1.2.0",
    },
  ];

  const skill = getSkillById("general-review")!;
  return {
    request: {
      sessionId: "sess-golden",
      instruction: fixture.instruction,
      documentIds: [docId],
      documentTexts: { [docId]: docText },
    },
    workspace: { sessionId: "sess-golden", documents: [segmented] },
    findings: [],
    draftTasks: [],
    activeSkills: [skill],
    activeSkillIds: [skill.skillId],
    mergedExpectedClauses: skill.expectedClauses,
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: "1.2.0",
      riskTaxonomyVersion: "1.1.0",
    },
  };
}

describe("golden analysis risk (general-review expectedClauses)", () => {
  it("flags missing limitation_of_liability per skill checklist", () => {
    const state = baseState(fixture.document);
    const unit: AnalysisWorkUnit = {
      workUnitId: "wu-check-expected",
      tool: "check_expected_clauses",
      input: { docId: "doc-golden", skillIds: ["general-review"] },
      dependsOn: ["wu-extract"],
      outputSchema: "Finding[]",
      status: "pending",
    };

    const { findings } = checkExpectedClauses(state, unit, []);
    const absent = findings.filter((f) => f.status === "absent_expected");
    const missingLoL = absent.find(
      (f) => f.category === "missing_limitation_of_liability"
    );
    assert.ok(missingLoL, "expected absent missing_limitation_of_liability finding");
    assert.ok(
      fixture.expectedAbsentCategories.every((cat: string) =>
        absent.some((f) => f.category === cat)
      )
    );
  });

  it("does not flag absent for extracted clause types", () => {
    const state = baseState(fixture.document);
    const unit: AnalysisWorkUnit = {
      workUnitId: "wu-check-expected",
      tool: "check_expected_clauses",
      input: { docId: "doc-golden", skillIds: ["general-review"] },
      dependsOn: [],
      outputSchema: "Finding[]",
      status: "pending",
    };

    const { findings } = checkExpectedClauses(state, unit, []);
    const absentIndemnity = findings.find(
      (f) => f.status === "absent_expected" && f.claim.includes("indemnity")
    );
    assert.equal(absentIndemnity, undefined);
  });
});
