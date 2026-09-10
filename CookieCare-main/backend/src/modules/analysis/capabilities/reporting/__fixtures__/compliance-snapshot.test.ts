import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { ComplianceOutstandingCheck } from "../../../models/compliance-report.js";
import { buildStructuralNodes, type StructuralNode } from "../../../segmentation/structural-nodes.js";
import type { RenderedEvidence, RenderedReport, RenderedRow } from "../../act/phase7-render.js";
import { buildComplianceSnapshot } from "../compliance-snapshot.js";

function setup(texts: Record<string, string>, titles: Record<string, string> = {}) {
  const state: AnalysisState = {
    request: { sessionId: "snapshot-test", instruction: "Check the contract.",
      documentIds: Object.keys(texts), documentTexts: { ...texts } },
    workspace: { sessionId: "snapshot-test", documents: Object.entries(texts).map(([docId, fullText]) => ({
      docId, fullText, title: titles[docId] ?? `${docId} agreement`, role: "target", segments: [], clauses: [],
    })) },
    findings: [], draftTasks: [],
    metadata: { timestamp: "2026-09-07", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
  };
  const nodes = new Map(Object.entries(texts).map(([documentId, fullText]) =>
    [documentId, buildStructuralNodes({ documentId, fullText })]));
  return { state, nodes };
}

function row(evidence: RenderedEvidence[], overrides: Partial<RenderedRow> = {}): RenderedRow {
  return {
    rowId: "R-security", requirementId: "security", canonicalKey: "security",
    lockedAssessmentId: "lock-security", legalCitation: "Article 28(3)(c)", title: "Security",
    status: "present", statusLabel: "Present", recommendedAction: "None.",
    supportedElementIds: ["E-security"], missingElementIds: [], evidence,
    whatTheDocumentProvides: "Safeguards.", whatIsMissingOrUnclear: "Nothing identified.",
    whyItMatters: "Protects data.", conclusion: "Present.", ruleVersion: "rule-v7",
    documentHash: "original-lock-hash", ...overrides,
  };
}

function report(rows: RenderedRow[]): RenderedReport {
  return { rows, supplementalRequests: [], bottomLine: [], reconciliation: {
    lockedAssessmentIds: rows.map((item) => item.lockedAssessmentId),
    renderedAssessmentIds: rows.map((item) => item.lockedAssessmentId), missing: [], duplicates: [],
  } };
}

function quote(nodes: Map<string, StructuralNode[]>, docId: string, text: string, occurrence = 0): RenderedEvidence {
  const all = nodes.get(docId)!;
  const source = all.find((node) => node.kind === "document")!.rawText;
  const start = source.indexOf(text, occurrence);
  assert.ok(start >= 0);
  const end = start + text.length;
  const node = all.filter((item) => item.sourceOffsets[0] <= start && end <= item.sourceOffsets[1])
    .sort((a, b) => (a.sourceOffsets[1] - a.sourceOffsets[0]) - (b.sourceOffsets[1] - b.sourceOffsets[0]))[0];
  return { documentId: docId, spanId: node.spanId, quote: text,
    structuralPath: node.structuralPath, charRange: [start, end] };
}

describe("buildComplianceSnapshot source verification", () => {
  it("clones locked rows and checks workspace text, preserving status, rule versions and lock hashes", () => {
    const text = "Section 4.1.1 Security\nWe protect personal data.";
    const { state, nodes } = setup({ main: text });
    state.request.documentTexts.main = "Stale request text";
    const original = report([row([quote(nodes, "main", "We protect personal data.")])]);
    const before = structuredClone(original);
    const outstanding: ComplianceOutstandingCheck[] = [
      { requirementId: "audit", title: "Audit", reason: "No accepted lock.", kind: "rejected" },
    ];
    const dependencies = [{ requirementId: "security", reference: "Schedule B", reason: "Not provided." }];
    const snapshot = buildComplianceSnapshot(state, original, nodes, outstanding, dependencies);
    assert.deepEqual(original, before);
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.documents[0].contentHash, createHash("sha256").update(text).digest("hex"));
    assert.equal(snapshot.rows[0].documentHash, "original-lock-hash");
    assert.equal(snapshot.rows[0].ruleVersion, "rule-v7");
    assert.equal(snapshot.rows[0].status, "present");
    assert.equal(snapshot.rows[0].evidence[0].citationId, "E1");
    assert.equal(snapshot.rows[0].evidence[0].quote, "We protect personal data.");
    assert.match(snapshot.limitations[0].message, /Schedule B.*Not provided/);
    original.rows[0].evidence[0].charRange[0] = 99;
    original.rows[0].supportedElementIds.push("mutation");
    original.rows[0].title = "Changed";
    outstanding[0].reason = "Changed";
    dependencies[0].reason = "Changed";
    assert.equal(snapshot.rows[0].title, "Security");
    assert.deepEqual(snapshot.rows[0].supportedElementIds, ["E-security"]);
    assert.equal(snapshot.rows[0].evidence[0].charRange[0], text.indexOf("We protect"));
    assert.equal(snapshot.outstandingChecks[0].reason, "No accepted lock.");
    assert.deepEqual(snapshot, buildComplianceSnapshot(state, before, nodes,
      [{ requirementId: "audit", title: "Audit", reason: "No accepted lock.", kind: "rejected" }],
      [{ requirementId: "security", reference: "Schedule B", reason: "Not provided." }]));
  });

  it("recovers misleading quote ranges only inside the canonical source node", () => {
    const { state, nodes } = setup({ main: "Preamble\nClause 7.2(b) The processor assists with audits." });
    const evidence = quote(nodes, "main", "assists with audits");
    evidence.charRange = [0, 5];
    const result = buildComplianceSnapshot(state, report([row([evidence])]), nodes, [], []);
    const checked = result.rows[0].evidence[0];
    assert.ok(checked);
    assert.equal(state.workspace.documents[0].fullText.slice(...checked.charRange), evidence.quote);
    assert.match(checked.pointer, /Clause 7\.2\(b\)/);
    assert.deepEqual(result.limitations, []);
  });

  it("uses exact source offsets before a misleading structural path or node", () => {
    const { state, nodes } = setup({ main: "Clause 1 First duty.\nClause 9 Second duty." });
    const wrong = quote(nodes, "main", "First duty.");
    const correct = quote(nodes, "main", "Second duty.");
    const result = buildComplianceSnapshot(state, report([row([
      { ...wrong, quote: correct.quote, charRange: correct.charRange },
    ])]), nodes, [], []);
    assert.match(result.rows[0].evidence[0].pointer, /Clause 9/);
    assert.equal(result.rows[0].evidence[0].structuralPath, correct.structuralPath);
  });

  it("recovers a Phase 3 seed with a canonical structural path", () => {
    const { state, nodes } = setup({ main: "Preamble\n4.1.1. Security safeguards apply." });
    const evidence = quote(nodes, "main", "Security safeguards apply.");
    const node = nodes.get("main")!.find((item) => item.spanId === evidence.spanId)!;
    evidence.spanId = `main::section::${node.sourceOffsets[0]}-${node.sourceOffsets[1]}`;
    evidence.charRange = [0, 2];
    const result = buildComplianceSnapshot(state, report([row([evidence])]), nodes, [], []);
    assert.match(result.rows[0].evidence[0].pointer, /Clause 4\.1\.1/);
    assert.deepEqual(result.limitations, []);
  });

  it("rejects missing documents, cross-document locators, fabricated quotes and unknown locations", () => {
    const { state, nodes } = setup({ main: "Clause 7 Shared duty.", other: "Clause 7 Shared duty." });
    const valid = quote(nodes, "main", "Shared duty.");
    const invalid: RenderedEvidence[] = [
      { ...valid, documentId: "missing" },
      { ...valid, documentId: "other" },
      { ...valid, quote: "Invented duty." },
      { ...valid, spanId: "unknown", structuralPath: "document/clause-999", charRange: [0, 2] },
      { ...valid, quote: "   " },
    ];
    const result = buildComplianceSnapshot(state, report([row(invalid)]), nodes, [], []);
    assert.deepEqual(result.rows[0].evidence, []);
    assert.equal(result.rows[0].status, "present");
    assert.equal(result.rows[0].statusLabel, "Present");
    assert.ok(result.limitations.length >= 2);
    assert.ok(result.limitations.every((item) => item.requirementIds.includes("security")));
  });

  it("rejects stale canonical nodes and text that exists only elsewhere in the source", () => {
    const { state, nodes } = setup({ main: "Clause 1 First duty.\nClause 2 Second duty." });
    const original = quote(nodes, "main", "First duty.");
    const relocated = { ...original, quote: "Second duty.", charRange: [0, 2] as [number, number] };
    const stale = { ...original, charRange: [0, 2] as [number, number] };
    nodes.get("main")!.find((item) => item.spanId === stale.spanId)!.rawText = "Changed node text";
    const result = buildComplianceSnapshot(state, report([row([relocated, stale])]), nodes, [], []);
    assert.equal(result.rows[0].evidence.length, 0);
    assert.ok(result.limitations.length);
  });

  it("does not silently choose among repeated quotes when quote ranges are misleading", () => {
    const { state, nodes } = setup({ main: "Clause 7 Same duty. Same duty." });
    const exact = quote(nodes, "main", "Same duty.");
    const ambiguous = { ...exact, charRange: [0, 1] as [number, number] };
    const result = buildComplianceSnapshot(state, report([row([ambiguous, exact])]), nodes, [], []);
    assert.equal(result.rows[0].evidence.length, 1);
    assert.deepEqual(result.rows[0].evidence[0].charRange, exact.charRange);
    assert.ok(result.limitations.length);
  });

  it("returns exact source characters after normalizing whitespace, preserving UTF-16 offsets", () => {
    const { state, nodes } = setup({ main: "😀 Preamble\nClause 3 Café\r\nData  stays\there." });
    const exact = quote(nodes, "main", "Data  stays\there.");
    const normalized = { ...exact, quote: "Data stays here." };
    const result = buildComplianceSnapshot(state, report([row([exact, normalized])]), nodes, [], []);
    assert.equal(result.rows[0].evidence.length, 2);
    assert.deepEqual(result.rows[0].evidence[0].charRange, exact.charRange);
    assert.equal(result.rows[0].evidence[1].quote, exact.quote);
    assert.deepEqual(result.rows[0].evidence[1].charRange, exact.charRange);
  });

  it("maps PDF typography, collapsed whitespace and case back to the original source substring", () => {
    const raw = "The “Processor”\u00a0\u00a0SHALL\r\nassist—with audits… promptly.";
    const text = `Clause 7.2(b) ${raw}`;
    const { state, nodes } = setup({ main: text });
    const root = nodes.get("main")!.find((node) => node.kind === "document")!;
    const evidence: RenderedEvidence = { documentId: "main", spanId: root.spanId,
      structuralPath: root.structuralPath, charRange: [0, text.length],
      quote: 'the "processor" shall assist-with audits... promptly.' };
    const result = buildComplianceSnapshot(state, report([row([evidence])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].quote, raw);
    assert.deepEqual(result.rows[0].evidence[0].charRange, [text.indexOf("The"), text.length]);
    assert.match(result.rows[0].evidence[0].pointer, /Clause 7\.2\(b\)/);
    assert.deepEqual(result.limitations, []);
  });

  it("handles case expansions and whole-string lowercase without shifting source offsets", () => {
    const text = "Clause 2 İSTANBUL ΟΣ 😀 DATA.";
    const { state, nodes } = setup({ main: text });
    const evidence = quote(nodes, "main", "İSTANBUL ΟΣ 😀 DATA.");
    evidence.quote = "i\u0307stanbul ος 😀 data.";
    evidence.charRange = [0, text.length];
    const result = buildComplianceSnapshot(state, report([row([evidence])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].quote, "İSTANBUL ΟΣ 😀 DATA.");
    assert.deepEqual(result.rows[0].evidence[0].charRange, [9, text.length]);
  });

  it("rejects ambiguous normalized locations and partial typography expansions", () => {
    const { state, nodes } = setup({ main: "Clause 2 SAME  DUTY; Same\tduty; Wait…" });
    const evidence = quote(nodes, "main", "SAME  DUTY");
    const result = buildComplianceSnapshot(state, report([row([
      { ...evidence, quote: "same duty", charRange: [0, 1] },
      { ...evidence, quote: "Wait.", charRange: [0, 1] },
    ])]), nodes, [], []);
    assert.equal(result.rows[0].evidence.length, 0);
    assert.ok(result.limitations.length);
  });

  it("keeps normalized recovery inside the canonical node", () => {
    const { state, nodes } = setup({ main: "Clause 1 First duty.\nClause 2 SECOND  DUTY." });
    const wrongNode = quote(nodes, "main", "First duty.");
    const result = buildComplianceSnapshot(state, report([row([
      { ...wrongNode, quote: "second duty.", charRange: [0, 2] },
    ])]), nodes, [], []);
    assert.equal(result.rows[0].evidence.length, 0);
  });

  it("preserves conflicting and incomplete statuses while source-checking every supplied quote", () => {
    const { state, nodes } = setup({ main: "Clause 1 Assistance is required.\nClause 2 Assistance is excluded." });
    const evidence = [quote(nodes, "main", "Assistance is required."), quote(nodes, "main", "Assistance is excluded.")];
    const statuses: RenderedRow["status"][] = ["present", "partial", "gap", "cannot_determine",
      "not_applicable", "conflicting", "judgment_required", "verification_incomplete"];
    const result = buildComplianceSnapshot(state,
      report(statuses.map((status) => row(evidence, { status }))), nodes, [], []);
    assert.deepEqual(result.rows.map((item) => item.status), statuses);
    assert.ok(result.rows.every((item) => item.evidence.length === 2));
  });

  it("identifies omitted document IDs from canonical spans and assigns citations by source location", () => {
    const { state, nodes } = setup({ a: "Clause 7 Same duty.", b: "Clause 7 Same duty." });
    const first = quote(nodes, "a", "Same duty.");
    delete first.documentId;
    const second = quote(nodes, "b", "Same duty.");
    const result = buildComplianceSnapshot(state, report([
      row([first, second]), row([first], { rowId: "R-second", requirementId: "other" }),
    ]), nodes, [], []);
    assert.deepEqual(result.rows[0].evidence.map((item) => item.citationId), ["E1", "E2"]);
    assert.equal(result.rows[1].evidence[0].citationId, "E1");
    assert.equal(result.rows[0].evidence[0].documentId, "a");
    assert.equal(result.rows[0].evidence[0].pointer, "Clause 7");
    assert.equal(result.rows[0].evidence[1].pointer, "Clause 7");
    assert.notEqual(result.rows[0].evidence[0].documentTitle, result.rows[0].evidence[1].documentTitle);
    assert.equal(result.documents.length, 2);
  });

  it("hashes every full workspace document including documents with no accepted evidence", () => {
    const { state, nodes } = setup({ main: "abc", unused: "", reference: "xyz" });
    const result = buildComplianceSnapshot(state, report([]), nodes, [], []);
    assert.equal(result.documents[0].contentHash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(result.documents[1].contentHash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(result.documents.length, 3);
    assert.deepEqual(result.rows, []);
  });

  it("carries resolved workspace roles with explicit request roles taking precedence", () => {
    const { state, nodes } = setup({ main: "Contract", playbook: "Rules", prior: "Old contract", pending: "Text" });
    state.workspace.documents[0].role = "primary";
    state.workspace.documents[1].role = "target";
    state.workspace.documents[2].role = "prior_version";
    state.workspace.documents[3].role = "unknown";
    state.request.documentRoles = { playbook: "reference", pending: "target" };
    const result = buildComplianceSnapshot(state, report([]), nodes, [], []);
    assert.deepEqual(result.documents.map((doc) => doc.role), ["primary", "reference", "prior_version", "target"]);
    assert.equal(state.workspace.documents[1].role, "target");
    assert.equal(state.workspace.documents[3].role, "unknown");
  });

  it("preserves and detaches explicit reviewed documents for evidence-free absence findings", () => {
    const { state, nodes } = setup({ main: "Contract", other: "Another target" });
    const absenceRow = { ...row([], { status: "gap", statusLabel: "Gap" }), reviewedDocumentIds: ["main"] };
    const emptyCoverageRow = { ...row([]), reviewedDocumentIds: [] as string[] };
    const noCoverageRow = row([quote(nodes, "other", "Another target")]);
    const result = buildComplianceSnapshot(state,
      report([absenceRow, emptyCoverageRow, noCoverageRow]), nodes, [], []);
    assert.deepEqual(result.rows[0].reviewedDocumentIds, ["main"]);
    assert.deepEqual(result.rows[1].reviewedDocumentIds, []);
    assert.ok(!("reviewedDocumentIds" in result.rows[2]));
    assert.equal(result.rows[0].status, "gap");
    absenceRow.reviewedDocumentIds.push("other");
    emptyCoverageRow.reviewedDocumentIds.push("main");
    assert.deepEqual(result.rows[0].reviewedDocumentIds, ["main"]);
    assert.deepEqual(result.rows[1].reviewedDocumentIds, []);
  });

  it("coalesces shared dependencies while retaining every affected requirement", () => {
    const { state, nodes } = setup({ main: "Text" });
    const result = buildComplianceSnapshot(state, report([]), nodes, [], [
      { requirementId: "a", reference: "Schedule B", reason: "Missing." },
      { requirementId: "b", reference: "Schedule B", reason: "Missing." },
      { requirementId: "a", reference: "Schedule B", reason: "Missing." },
    ]);
    assert.equal(result.limitations.length, 1);
    assert.deepEqual(result.limitations[0].requirementIds, ["a", "b"]);
  });
});

describe("source-authored clause pointers", () => {
  for (const label of ["Section 4.1.1", "Clause 7.2(b)", "Schedule A", "Appendix 2", "Annex IV"]) {
    it(`retains ${label} without interpreting structural hashes as numbering`, () => {
      const { state, nodes } = setup({ main: `${label} Security obligations.` });
      const evidence = quote(nodes, "main", "Security obligations.");
      const result = buildComplianceSnapshot(state, report([row([evidence])]), nodes, [], []);
      const pointer = result.rows[0].evidence[0].pointer;
      assert.equal(pointer, label);
      assert.ok(!pointer.includes(evidence.spanId));
      assert.doesNotMatch(pointer, /page|para@|clause-[a-f0-9]|::/i);
    });
  }

  it("combines a source-authored nested subpart with its clause and schedule ancestors", () => {
    const text = "Schedule A\nClause 7.2 Duties\n(b) The processor assists.\n(i) It responds promptly.";
    const { state, nodes } = setup({ main: text });
    const original = nodes.get("main")!;
    const schedule = original.find((item) => item.kind === "schedule")!;
    const clause = original.find((item) => item.rawText === "Clause 7.2 Duties")!;
    const subpart = original.find((item) => item.rawText === "(b) The processor assists.")!;
    const inner = original.find((item) => item.rawText === "(i) It responds promptly.")!;
    clause.rawText = text.slice(clause.sourceOffsets[0]);
    clause.sourceOffsets[1] = text.length;
    clause.parentSpanId = schedule.spanId;
    subpart.rawText = text.slice(subpart.sourceOffsets[0]);
    subpart.sourceOffsets[1] = text.length;
    subpart.parentSpanId = clause.spanId;
    inner.parentSpanId = subpart.spanId;
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", "It responds promptly.")])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].pointer, "Schedule A / Clause 7.2(b)(i)");
  });

  it("uses an actual heading ancestor for an unnumbered passage", () => {
    const { state, nodes } = setup({ main: "# Data security\nWe maintain safeguards." });
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", "We maintain safeguards.")])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].pointer, "Heading “Data security”");
  });

  it("omits broad heading ancestors when a numbered clause identifies the passage", () => {
    const { state, nodes } = setup({ main: "APPLICATION OF THIS DPA\nClause 12.3 Transfers require safeguards." });
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", "Transfers require safeguards.")])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].pointer, "Clause 12.3");
  });

  for (const container of ["Schedule 2", "Annex B"]) {
    it(`preserves ${container} while removing headings around a numbered clause`, () => {
      const { state, nodes } = setup({ main: `${container}\nAPPLICATION OF THIS DPA\nClause 3(b) Transfers require safeguards.` });
      const result = buildComplianceSnapshot(state,
        report([row([quote(nodes, "main", "Transfers require safeguards.")])]), nodes, [], []);
      assert.equal(result.rows[0].evidence[0].pointer, `${container} / Clause 3(b)`);
    });
  }

  it("uses only the closest actual heading when nested headings cover unnumbered text", () => {
    const text = "# APPLICATION OF THIS DPA\n## Data security\nWe maintain safeguards.";
    const { state, nodes } = setup({ main: text });
    const sections = nodes.get("main")!.filter((node) => node.kind === "section");
    const outer = sections[0];
    const inner = sections[1];
    outer.rawText = text;
    outer.sourceOffsets = [0, text.length];
    inner.parentSpanId = outer.spanId;
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", "We maintain safeguards.")])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].pointer, "Heading “Data security”");
  });

  it("does not promote an unrelated heading later inside the quote to its pointer", () => {
    const text = "This duty has no number.\nSection 99 Unrelated heading\nAnother duty.";
    const { state, nodes } = setup({ main: text });
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", text)])]), nodes, [], []);
    assert.match(result.rows[0].evidence[0].pointer, /Unnumbered passage/);
    assert.doesNotMatch(result.rows[0].evidence[0].pointer, /99|Unrelated heading|page/i);
  });

  it("does not scan a multiline canonical node for a later numbered heading", () => {
    const text = "We protect data.\nClause 77 Unrelated later clause.";
    const { state, nodes } = setup({ main: text });
    const root = nodes.get("main")!.find((item) => item.kind === "document")!;
    nodes.set("main", [root, { ...root, kind: "paragraph", spanId: "main::paragraph::12345",
      structuralPath: "document/para@12345", parentSpanId: root.spanId }]);
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", "We protect data.\nClause 77 Unrelated later clause.")])]), nodes, [], []);
    assert.match(result.rows[0].evidence[0].pointer, /Unnumbered passage/);
    assert.doesNotMatch(result.rows[0].evidence[0].pointer, /77|12345/);
  });

  it("keeps repeated clause numbers distinct even when document titles match", () => {
    const { state, nodes } = setup({ a: "Clause 7 Duty.", b: "Clause 7 Duty." }, { a: "Agreement", b: "Agreement" });
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "a", "Duty."), quote(nodes, "b", "Duty.")])]), nodes, [], []);
    assert.equal(result.rows[0].evidence[0].pointer, "Clause 7");
    assert.equal(result.rows[0].evidence[1].pointer, "Clause 7");
    assert.equal(result.rows[0].evidence[0].documentTitle, "Agreement (document 1)");
    assert.equal(result.rows[0].evidence[1].documentTitle, "Agreement (document 2)");
    assert.deepEqual(result.documents.map((doc) => doc.title), ["Agreement (document 1)", "Agreement (document 2)"]);
  });

  it("uses stable reviewed-document labels instead of missing titles or technical IDs", () => {
    const { state, nodes } = setup({ "file-abc123": "Clause 1 Duty.", "file-def456": "Clause 2 Duty.", named: "Clause 3 Duty." });
    state.workspace.documents[0].title = undefined;
    state.workspace.documents[1].title = "file-def456";
    state.workspace.documents[2].title = "  ";
    state.request.documentTitles = { "file-abc123": "file-abc123", named: "Uploaded agreement" };
    const evidence = [...nodes.keys()].map((docId) => quote(nodes, docId, "Duty."));
    const result = buildComplianceSnapshot(state, report([row(evidence)]), nodes, [], []);
    const titles = ["Reviewed document 1", "Reviewed document 2", "Uploaded agreement"];
    assert.deepEqual(result.documents.map((doc) => doc.title), titles);
    assert.deepEqual(result.rows[0].evidence.map((item) => item.documentTitle), titles);
    assert.doesNotMatch(result.scope, /file-abc123|file-def456/);
    assert.deepEqual(result.rows[0].evidence.map((item) => item.pointer), ["Clause 1", "Clause 2", "Clause 3"]);
    assert.deepEqual(buildComplianceSnapshot(state, report([row([...evidence].reverse())]), nodes, [], []).documents, result.documents);
  });

  it("numbers repeated titles by workspace index even when evidence order differs", () => {
    const { state, nodes } = setup({ a: "Clause 1 Duty.", b: "Clause 1 Duty.", c: "Clause 1 Duty." },
      { a: "Another agreement", b: "Agreement", c: "  Agreement  " });
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "c", "Duty."), quote(nodes, "b", "Duty.")])]), nodes, [], []);
    assert.deepEqual(result.rows[0].evidence.map((item) => item.documentTitle), ["Agreement (document 3)", "Agreement (document 2)"]);
  });

  it("keeps an unnumbered excerpt short and sourced, with no generated page field", () => {
    const text = `The processor ${"maintains safeguards ".repeat(15)}at all times.`;
    const { state, nodes } = setup({ main: text });
    const result = buildComplianceSnapshot(state,
      report([row([quote(nodes, "main", text)])]), nodes, [], []);
    const checked = result.rows[0].evidence[0];
    assert.equal(checked.pointer, `Unnumbered passage: “${Array.from(text).slice(0, 96).join("")}…”`);
    assert.equal(checked.quote, text);
    assert.deepEqual(checked.charRange, [0, text.length]);
    assert.ok(!("pageNumber" in checked));
    assert.doesNotMatch(checked.pointer, /characters|offset|page|main agreement/i);
  });

  it("uses a canonical excerpt when no structural graph exists, keeping offsets internal", () => {
    const { state } = setup({ main: "Plain text without numbering." });
    const result = buildComplianceSnapshot(state, report([row([{
      documentId: "main", spanId: "main::section::0-29", quote: "Plain text",
      structuralPath: "document/para@999", charRange: [0, 10],
    }])]), new Map(), [], []);
    assert.equal(result.rows[0].evidence[0].pointer, "Unnumbered passage: “Plain text”");
    assert.deepEqual(result.rows[0].evidence[0].charRange, [0, 10]);
    assert.ok(!("pageNumber" in result.rows[0].evidence[0]));
    assert.doesNotMatch(result.rows[0].evidence[0].pointer, /characters|offset|page|999/i);
    assert.equal(result.rows[0].evidence[0].structuralPath, "document");
  });
});
