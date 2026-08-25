import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSharedEvidence } from "../extract-shared-evidence.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { ClauseObject } from "../../../models/clause-object.js";

function unit(clauseTypes: string[] = ["confidentiality"]): AnalysisWorkUnit {
  return {
    workUnitId: "wu-shared",
    tool: "extract_shared_evidence",
    input: { docId: "d1", packageId: "pkg.confidentiality", clauseTypes },
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "pending",
  };
}

function stateWithClauses(clauses: ClauseObject[]): AnalysisState {
  return {
    workspace: {
      sessionId: "s1",
      documents: [
        {
          docId: "d1",
          role: "target",
          fullText: clauses.map((c) => c.text).join("\n"),
          segments: [],
          clauses,
        },
      ],
    },
  } as unknown as AnalysisState;
}

describe("extractSharedEvidence", () => {
  it("passes the complete clause text instead of a 600-character stub", () => {
    const body = "Personnel of the Processor shall be bound by a duty of confidentiality. ".repeat(30);
    assert.ok(body.length > 600);
    const clauses: ClauseObject[] = [
      {
        clauseId: "c1",
        clauseType: "confidentiality",
        locator: {
          docId: "d1",
          structuralPath: "clause-3.6",
          charRange: [0, body.length],
        },
        text: body,
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
    ];
    const { state } = extractSharedEvidence(stateWithClauses(clauses), unit(), []);
    const item = state.sharedEvidence?.["pkg.confidentiality"]?.items[0];
    assert.ok(item);
    assert.equal(item.quotedText.length, body.length);
    assert.equal(item.quotedText, body);
  });

  it("forwards truncated and logicalEndOffset onto the bundle item", () => {
    const prefix = "x".repeat(1200);
    const clauses: ClauseObject[] = [
      {
        clauseId: "c1",
        clauseType: "confidentiality",
        locator: {
          docId: "d1",
          structuralPath: "clause-3.6",
          charRange: [0, prefix.length],
        },
        text: prefix,
        taxonomyVersion: "test",
        evidenceStatus: "found",
        matchReason: "heading:confidentiality",
        truncated: true,
        logicalEndOffset: 20_000,
      },
    ];
    const { state } = extractSharedEvidence(stateWithClauses(clauses), unit(), []);
    const item = state.sharedEvidence?.["pkg.confidentiality"]?.items[0];
    assert.equal(item?.truncated, true);
    assert.equal(item?.logicalEndOffset, 20_000);
    assert.equal(item?.matchReason, "heading:confidentiality");
  });
});
