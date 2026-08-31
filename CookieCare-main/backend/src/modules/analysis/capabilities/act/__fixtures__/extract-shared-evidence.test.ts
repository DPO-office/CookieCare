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

  it("keeps more than 12 matching clauses instead of first-N document order", () => {
    const clauses: ClauseObject[] = Array.from({ length: 18 }, (_, i) => ({
      clauseId: `c${i}`,
      clauseType: "processor_terms",
      locator: {
        docId: "d1",
        structuralPath: `clause-${i}`,
        charRange: [i * 10, i * 10 + 8],
      },
      text: `Generic processor term ${i}.`,
      taxonomyVersion: "test",
      evidenceStatus: "found" as const,
    }));
    const { state } = extractSharedEvidence(
      stateWithClauses(clauses),
      unit(["processor_terms"]),
      []
    );
    assert.equal(state.sharedEvidence?.["pkg.confidentiality"]?.items.length, 18);
  });

  it("ranks duration language above earlier unrelated processor terms", () => {
    const clauses: ClauseObject[] = [
      {
        clauseId: "c-ar",
        clauseType: "processor_terms",
        locator: { docId: "d1", structuralPath: "5.1.4", charRange: [0, 80] },
        text: "Under Argentine law personal data may be retained and destroyed up to two years.",
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
      {
        clauseId: "c-dur",
        clauseType: "processor_terms",
        locator: { docId: "d1", structuralPath: "2.2.a", charRange: [9000, 9120] },
        text: "The duration of the Processing is determined by You and as set forth in the Agreement.",
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
    ];
    const { state } = extractSharedEvidence(
      stateWithClauses(clauses),
      {
        ...unit(["processor_terms", "data_protection"]),
        input: {
          docId: "d1",
          packageId: "pkg.confidentiality",
          clauseTypes: ["processor_terms", "data_protection"],
          extractionTargets: ["duration", "term"],
        },
      },
      []
    );
    const items = state.sharedEvidence?.["pkg.confidentiality"]?.items ?? [];
    assert.equal(items[0]?.quotedText.includes("duration of the Processing"), true);
  });

  it("includes termination clauses in a particulars-style pool and ranks them for duration", () => {
    const clauses: ClauseObject[] = [
      {
        clauseId: "c-ng",
        clauseType: "data_protection",
        locator: { docId: "d1", structuralPath: "defs", charRange: [0, 80] },
        text: "Nigeria Data Protection Act 2023 and its Implementing Regulations apply to processing.",
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
      {
        clauseId: "c-term",
        clauseType: "termination",
        locator: { docId: "d1", structuralPath: "2.2.a", charRange: [9000, 9120] },
        text: "The duration of the Processing is determined by You and as set forth in the Agreement.",
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
    ];
    const { state } = extractSharedEvidence(
      stateWithClauses(clauses),
      {
        ...unit(["processor_terms", "data_protection"]),
        input: {
          docId: "d1",
          packageId: "pkg.particulars",
          // Full-extract pool: termination is still included even when not listed.
          clauseTypes: ["processor_terms", "data_protection"],
          extractionTargets: ["duration", "subject_matter", "nature", "purpose"],
        },
      },
      []
    );
    const items = state.sharedEvidence?.["pkg.particulars"]?.items ?? [];
    assert.ok(items.some((i) => i.clauseType === "termination"));
    assert.equal(items[0]?.clauseType, "termination");
  });

  it("keeps confidentiality and deletion types when processor_terms would fill a 12-item bag", () => {
    const processor: ClauseObject[] = Array.from({ length: 20 }, (_, i) => ({
      clauseId: `p${i}`,
      clauseType: "processor_terms",
      locator: {
        docId: "d1",
        structuralPath: `proc-${i}`,
        charRange: [i, i + 4],
      },
      text: `Processor terms filler ${i}.`,
      taxonomyVersion: "test",
      evidenceStatus: "found" as const,
    }));
    const extras: ClauseObject[] = [
      {
        clauseId: "conf",
        clauseType: "confidentiality",
        locator: { docId: "d1", structuralPath: "conf", charRange: [500, 580] },
        text: "Personnel authorised to process personal data are bound by confidentiality.",
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
      {
        clauseId: "del",
        clauseType: "deletion_on_termination",
        locator: { docId: "d1", structuralPath: "del", charRange: [600, 680] },
        text: "Upon termination the processor shall delete or return all personal data.",
        taxonomyVersion: "test",
        evidenceStatus: "found",
      },
    ];
    const { state } = extractSharedEvidence(
      stateWithClauses([...processor, ...extras]),
      unit([
        "processor_terms",
        "confidentiality",
        "deletion_on_termination",
      ]),
      []
    );
    const types = new Set(
      (state.sharedEvidence?.["pkg.confidentiality"]?.items ?? []).map((i) => i.clauseType)
    );
    assert.ok(types.has("confidentiality"));
    assert.ok(types.has("deletion_on_termination"));
    assert.ok((state.sharedEvidence?.["pkg.confidentiality"]?.items.length ?? 0) > 12);
  });
});
