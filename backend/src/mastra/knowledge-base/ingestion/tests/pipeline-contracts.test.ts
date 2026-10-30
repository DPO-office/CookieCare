import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { sourceLocations, type CandidateStructure } from "../extraction/structure-provider.js";
import { structureSourceUnits, materialize, structureChunkPrompt } from "../extraction/structure-chunk-plan.js";
import { reconstructSource, citationPaths } from "../extraction/reconstruct.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { enrichSemanticRelationships } from "../extraction/semantic-relationships.js";
import { groundedQuote } from "../extraction/graph-evidence.js";
import { buildDocumentModel } from "../extraction/document-model.js";
import { deterministicGraphCheck, FocusedGraphJudge } from "../evaluation/focused-graph-judge.js";
import type { JudgeInput } from "../evaluation/review-dataset.js";

function fixture(items: Array<{ text: string; type: string; marker?: string; parent?: number; title?: string }>) {
  const raw = { body: { self_ref: "#/body", children: items.map((_, i) => ({ $ref: `#/texts/${i}` })) },
    pages: { "1": {} }, texts: items.map((item, i) => ({ self_ref: `#/texts/${i}`, text: item.text,
      label: item.marker ? "list_item" : "text", marker: item.marker, enumerated: Boolean(item.marker), prov: [{ page_no: 1 }] })) };
  const map = buildSourceMap(raw, 1);
  const candidate: CandidateStructure = { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: "mock",
    promptVersion: "mock", processingStrategy: "mock", references: [], warnings: [], unresolvedItems: [],
    segments: items.map((item, i) => {
      const span = map.spans[i]!;
      const titleStart = item.title ? span.start + item.text.indexOf(item.title) : null;
      return { id: `s${i}`, kind: "unit", type: item.type, category: null, parent: item.parent === undefined ? null : `s${item.parent}`,
        children: [], span: { start: span.start, end: span.end }, code: null,
        title: titleStart === null ? null : { start: titleStart, end: titleStart + item.title!.length },
        sourceSpans: sourceLocations(map, span) };
    }) };
  return { raw, map, candidate, draft: () => reconstructSource(map, candidate, detectReferences(map, "test-source")) };
}

test("Docling marker stays separate from immutable text and reaches the chunk prompt", () => {
  const f = fixture([{ text: "(1) A duty.", marker: "18.", type: "subsection" }]);
  assert.equal(f.map.text, "(1) A duty.");
  const units = structureSourceUnits(f.map);
  const chunk = materialize(f.map, "one", units, [], [], 0);
  const prompt = JSON.parse(structureChunkPrompt(f.map, chunk));
  assert.equal(prompt.chunk.sourcePages[0].marker, "18.");
  assert.equal(prompt.sourceUnits[0][2], f.map.text);
});

test("missing section container and sentence labels resolve both relative-list targets", () => {
  const f = fixture([
    { text: "7. Other duties.", type: "section" }, { text: "8. Other duties.", type: "section" },
    { text: "9. (1) A first duty.", type: "subsection", title: "A first duty." },
    { text: "(2) A second duty.", type: "subsection", title: "A second duty." },
    { text: "(3) A third duty.", type: "subsection", title: "A third duty." },
    { text: "(4) The provisions of sub-sections (1) and (3) do not apply.", type: "subsection" },
    { text: "(5) Subject to notification, sub-sections (1) and (3) do not apply.", type: "subsection" },
    { text: "10. Next duties.", type: "section" },
  ]);
  const d = f.draft(), byId = new Map(d.provisions.map(p => [p.id, p]));
  assert.equal(d.provisions.filter(p => p.canonicalCitation === "Section 9").length, 1);
  assert.ok(!d.provisions.some(p => p.canonicalCitation === "Section 9(a)"));
  for (const number of [4, 5]) {
    const source = d.provisions.find(p => p.canonicalCitation === `Section 9(${number})`)!;
    const targets = d.relationships.filter(r => r.sourceProvisionId === source.id && r.status === "proposed")
      .flatMap(r => r.targetProvisionIds.map(id => byId.get(id)?.canonicalCitation));
    assert.deepEqual(targets.sort(), ["Section 9(1)", "Section 9(3)"]);
  }
});

test("source markers recover sections and descriptive chapter aliases normalize", () => {
  const f = fixture([{ text: "1. Start.", type: "section" }, { text: "2. Duties.", type: "section" },
    { text: "3. Duties.", type: "section" }, { text: "CHAPTER IV", type: "chapterheading" },
    { text: "(1) Establish a Board.", marker: "18.", type: "subsection" },
    { text: "(1) Appoint members.", marker: "19.", type: "subsection" }]);
  const d = f.draft();
  assert.ok(d.provisions.some(p => p.kind === "chapter" && p.text.startsWith("CHAPTER IV")));
  assert.ok(d.provisions.some(p => p.canonicalCitation === "Section 18(1)"));
  assert.ok(d.provisions.some(p => p.canonicalCitation === "Section 19"));
});

test("explicit lists and nested clauses preserve every address level", () => {
  assert.deepEqual(citationPaths("sections 10 and 11").map(p => p.number), ["10", "11"]);
  assert.deepEqual(citationPaths("clause (a) of sub-section (7) of section 8"),
    [{ kind: "section", number: "8", subpoints: ["7", "a"] }]);
  assert.deepEqual(citationPaths("paragraphs (2) and (4) of article 6").map(p => p.kind), ["article", "article"]);
});

test("external instrument qualifier prevents a local section collision", () => {
  const f = fixture([{ text: "Section 16. Local transfer provision.", type: "section" },
    { text: "Section 29. Without prejudice to section 14A and section 16 of the Telecom Regulatory Authority of India Act, 1997, proceed.", type: "section" }]);
  const d = f.draft();
  for (const mention of ["section 14A", "section 16"]) {
    const relation = d.relationships.find(r => r.exactMention === mention)!;
    assert.equal(relation.status, "external_unavailable");
    assert.deepEqual(relation.targetProvisionIds, []);
    assert.match(relation.externalTarget!.instrumentHint, /Telecom/);
  }
});

test("definition opening fragments cannot claim the complete definition", () => {
  const f = fixture([{ text: 'Section 2. In this Act, "record" means a complete audit entry.', type: "section" },
    { text: "Section 3. Keep a record.", type: "section" }]);
  const start = f.map.text.indexOf('"record"'), end = f.map.text.indexOf(".", start) + 1;
  const base = f.candidate.segments[0]!;
  f.candidate.segments.push({ ...base, id: "definition", type: "definition", parent: "s0", span: { start, end },
    sourceSpans: sourceLocations(f.map, { start, end }) });
  const fragmentEnd = start + '"record" means'.length;
  f.candidate.segments.push({ ...base, id: "fragment", type: "point", parent: "definition", span: { start, end: fragmentEnd },
    sourceSpans: sourceLocations(f.map, { start, end: fragmentEnd }) });
  const d = f.draft();
  const relation = d.relationships.find(r => r.relationType === "defined_term")!;
  assert.ok(d.provisions.find(p => p.id === relation.targetProvisionId)!.text.endsWith("audit entry."));
});

test("whitespace grounding maps to source and rejects ambiguous occurrences", () => {
  assert.deepEqual(groundedQuote("A  legal\ncondition.", "A legal condition."),
    { start: 0, end: 19, text: "A  legal\ncondition." });
  assert.equal(groundedQuote("section 2; section 2", "section 2"), null);
  assert.equal(groundedQuote("must comply", "may comply"), null);
});

test("generic discovery cannot erase a specific semantic interpretation", async () => {
  const f = fixture([{ text: "Section 1. Subject to section 2, comply with all applicable duties.", type: "section" },
    { text: "Section 2. Keep a complete record of every transaction.", type: "section" }]);
  const d = f.draft();
  const result = await enrichSemanticRelationships(f.map, d, { model: "mock",
    async decide(input) { return { links: input.references.map(r => ({ relationId: r.relationId,
      kind: "depends_on", role: "controlling provision", evidenceQuote: input.sourceText })), issues: [] }; },
    async discover(input) { return { links: input.sourceText.includes("Subject to") ? [{
      exactMention: "section 2", targetCitation: "Section 2", kind: "refers_to", role: "reference",
      evidenceQuote: input.sourceText, condition: null, typeProposal: null }] : [], issues: [] }; } });
  assert.equal(result.draft.relationships.find(r => r.exactMention === "section 2")!.relationType, "depends_on");
});

test("ordinary reference cycles do not make retrieval incomplete", () => {
  const f = fixture([{ text: "Section 1. See section 2.", type: "section" },
    { text: "Section 2. See section 1.", type: "section" }]);
  const model = buildDocumentModel(f.map, f.draft());
  assert.ok(model.contextManifests.every(m => m.complete));
  assert.ok(model.contextManifests.every(m => m.omitted.length === 0));
});

test("empty focused evidence is review-required and complete-graph absence is factual", async () => {
  const input: JudgeInput = { caseId: "sample", method: "source_backed_comparison", grading: {}, evaluationScope: null,
    expected: { "inherited-condition:x": { children: ["Section 8(7)(a)"], parent_text: "unless required" } },
    forbidden: [], source: [], evidence: [{ ref: "graph", value: { provisions: [], relationships: [] } }] };
  const judge = new FocusedGraphJudge({ model: "mock", async judge() { throw new Error("Should not call the model"); } });
  const result = await judge.judge(input);
  assert.equal(result.fields[0]!.verdict, "needs_review");
  assert.match(result.fields[0]!.reason, /missing_evidence/);
  const full = { ...input, evidence: [{ ref: "graph", value: { selection: { completeGraph: true }, provisions: [], relationships: [] } }] };
  assert.equal(deterministicGraphCheck(full, "edge:a -> b", { from: "a", to: "b", relation: "explicit_reference" })?.verdict, "fail");
});


test("conflicting semantic meanings stay visible but cannot drive retrieval", async () => {
  const f = fixture([{ text: "Section 1. Subject to section 2, comply with all applicable duties.", type: "section" },
    { text: "Section 2. Keep a complete record of every transaction.", type: "section" }]);
  const result = await enrichSemanticRelationships(f.map, f.draft(), { model: "mock",
    async decide(input) { return { links: input.references.map(r => ({ relationId: r.relationId,
      kind: "depends_on", role: "controlling provision", evidenceQuote: input.sourceText.replace(/\s+/g, " ") })), issues: [] }; },
    async discover(input) { return { links: input.sourceText.includes("Subject to") ? [{
      exactMention: "section 2", targetCitation: "Section 2", kind: "exempts_from", role: "claimed exemption",
      evidenceQuote: input.sourceText, condition: null, typeProposal: null }] : [], issues: [] }; } });
  const relation = result.draft.relationships.find(r => r.exactMention === "section 2")!;
  assert.equal(relation.semanticStatus, "needs_review");
  assert.ok(relation.semanticIssues!.some(issue => /Conflicting/.test(issue)));
  const context = buildDocumentModel(f.map, result.draft).contextManifests.find(m => m.targetProvisionId === relation.sourceProvisionId)!;
  assert.equal(context.complete, false);
  assert.ok(context.unresolvedRelationshipIds.includes(relation.id));
  assert.ok(!context.includedProvisionIds.includes(relation.targetProvisionId!));
});
