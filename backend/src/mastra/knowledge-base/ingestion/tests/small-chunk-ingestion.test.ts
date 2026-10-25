import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { projectDoclingChunks } from "../extraction/docling-chunk-plan.js";
import { reconcileBoundaries } from "../extraction/reconcile-boundaries.js";
import { sourceLocations, type CandidateStructure } from "../extraction/structure-provider.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { buildDocumentModel } from "../extraction/document-model.js";
import { assembleLegalContext } from "../interpretation/context-assembly.js";
import type { LegalRelationRevision } from "../schemas/legal-structure.js";
import { structureChunkPrompt, splitStructureChunk } from "../extraction/structure-chunk-plan.js";
import { LlmStructureProvider } from "../extraction/llm-structure.js";
import { resolveStructureProviderConfig } from "../extraction/structure-provider.js";

test("model repeating neighbour-only segments does not abort or duplicate the owning chunk", async () => {
  const map = source(["Rule 8 deletion", "Rule 9 exception"]);
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  let calls = 0;
  const provider = new LlmStructureProvider(configuration, { generate: async input => {
    if (++calls === 1) return { output: {}, rawResponse: {}, usage: null, finishReason: "length" };
    const prompt = JSON.parse(input.prompt);
    return { output: { segments: prompt.sourceUnits.map((unit: string[], i: number) => ({
      id: String(i), kind: "unit", type: "rule", category: "main", parent: null,
      sourceAnchors: [{ sourceId: unit[0], exactQuote: unit[2], occurrence: 0 }], codeAnchor: null, titleAnchor: null,
    })), references: [], warnings: [], unresolvedItems: [] }, rawResponse: {}, usage: null };
  } });
  const result = await provider.extract({ canonicalText: map.text, textHash: map.textHash, sourceMap: map, configuration });
  assert.equal(result.candidate.segments.length, 2);
  assert.deepEqual(result.candidate.segments.map(s => map.text.slice(s.span.start, s.span.end)),
    ["Rule 8 deletion", "Rule 9 exception"]);
});

function source(texts: string[]) {
  return buildSourceMap({ body: { self_ref: "#/body", children: texts.map((_, i) => ({ $ref: `#/texts/${i}` })) },
    pages: { "1": { page_no: 1 } }, texts: texts.map((text, i) => ({ self_ref: `#/texts/${i}`,
      text, label: "paragraph", prov: [{ page_no: 1 }] })) }, 1);
}

for (const scenario of ["discard-context", "invalid-core", "invalid-core-reference", "unknown-context-id", "used-context-parent", "mixed-boundary"] as const) {
  test(`anchor ownership validation: ${scenario}`, async () => {
    const map = source(["Rule 8 deletion", "Rule 9 exception"]);
    const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
    let calls = 0;
    const provider = new LlmStructureProvider(configuration, { generate: async input => {
      if (++calls === 1) return { output: {}, rawResponse: {}, usage: null, finishReason: "length" };
      const units: string[][] = JSON.parse(input.prompt).sourceUnits;
      const core = units.find(u => u[1] === "c")!;
      const context = units.find(u => u[1] !== "c")!;
      const anchor = (unit: string[], exactQuote = unit[2]!) => ({ sourceId: unit[0]!, exactQuote, occurrence: 0 });
      const segment = (id: string, unit: string[], exactQuote?: string) => ({
        id, kind: "unit", type: "rule", category: "main", parent: null as string | null,
        sourceAnchors: [anchor(unit, exactQuote)], codeAnchor: null as ReturnType<typeof anchor> | null, titleAnchor: null,
      });
      const owned = segment("core", core, scenario === "invalid-core" ? "invented quote" : undefined);
      const neighbour = segment("neighbour", context, "invented quote");
      if (scenario === "unknown-context-id") neighbour.sourceAnchors[0]!.sourceId = "invented-id";
      if (scenario === "used-context-parent") {
        owned.parent = "neighbour";
        neighbour.codeAnchor = anchor(context, "invented parent label");
      }
      if (scenario === "mixed-boundary") owned.sourceAnchors.push(anchor(context, "invented boundary"));
      return { output: { segments: [owned, neighbour], references: [
        { mention: anchor(context, "invented reference"), targetSegmentIds: [] },
        { mention: anchor(core, scenario === "invalid-core-reference" ? "invented reference" : "Rule"), targetSegmentIds: [], targetHint: "pending" },
      ], warnings: [], unresolvedItems: [] }, rawResponse: {}, usage: null };
    } });
    const extraction = provider.extract({ canonicalText: map.text, textHash: map.textHash, sourceMap: map, configuration });
    if (scenario !== "discard-context") {
      await assert.rejects(extraction, /LLM (quote is absent|invented source ID)/);
      return;
    }
    const result = await extraction;
    assert.equal(result.candidate.segments.length, 2);
    assert.equal(result.candidate.references.length, 2);
    assert.ok(result.candidate.references.every(r => r.exactMention === "Rule"));
    assert.ok(result.candidate.warnings.some(w => w.includes("context-only references")));
    assert.deepEqual(result.candidate.segments.map(s => map.text.slice(s.span.start, s.span.end)),
      ["Rule 8 deletion", "Rule 9 exception"]);
  });
}

test("native chunk projection retains omitted source and splits large blocks with exact UTF-16 positions", () => {
  const map = source(["Chapter II", "Rule 8 " + "records 😀 ".repeat(2500), "footer"]);
  const plan = projectDoclingChunks(map, [
    { text: "rendered text", docItems: ["#/texts/1"], headings: ["Chapter II"] },
    { text: "more rendered text", docItems: ["#/texts/1"], headings: ["Chapter II"] },
  ], 3500);
  const owned = plan.chunks.flatMap(c => c.sourceUnits!.filter(u => c.coreSourceIds.includes(u.id)));
  assert.equal(new Set(owned.map(u => u.id)).size, owned.length);
  assert.equal(owned.map(u => u.text).join(""), map.spans.map(s => map.text.slice(s.start, s.end)).join(""));
  assert.ok(owned.every(u => u.text === map.text.slice(u.start, u.end)));
  assert.ok(plan.chunks.every(c => c.assembledInputCharacters <= 24_000));
  assert.ok(owned.some(u => u.continuesBefore));
  assert.equal(plan.method, "docling_hybrid_source_projection");
  assert.ok(plan.warnings!.some(w => w.includes("#/texts/2")));
  const splittable = plan.chunks.find(c => c.coreSourceIds.length > 1)!;
  const children = splitStructureChunk(map, splittable, 3500, 24_000);
  assert.deepEqual(children.flatMap(c => c.coreSourceIds), splittable.coreSourceIds);
  assert.ok(children.every(c => JSON.parse(structureChunkPrompt(map, c)).sourceUnits.length > 0));
});

test("small request planning preserves table headers as context rather than dropping original cells", () => {
  const map = source(["Category", "Period", ...Array.from({ length: 15 }, (_, i) => `row ${i} ` + "value ".repeat(200))]);
  map.spans.forEach((span, i) => Object.assign(span, { kind: "table_cell", itemRef: "#/tables/0",
    row: i < 2 ? 0 : i - 1, column: i === 1 ? 1 : 0, isHeader: i < 2 }));
  const plan = projectDoclingChunks(map, [{ text: "table", docItems: ["#/tables/0"], headings: ["Schedule"] }], 3500);
  assert.ok(plan.chunks.length > 1);
  const later = plan.chunks[1]!;
  assert.ok(later.contextBefore.includes("src:0"));
  assert.ok(later.contextBefore.includes("src:1"));
});

function candidate(map: ReturnType<typeof source>): CandidateStructure {
  const a = map.spans[0]!, b = map.spans[1]!;
  const segment = (id: string, span: { start: number; end: number }, flags: object) => ({
    id, kind: "unit", type: "rule", category: "main", parent: null, children: [], span,
    code: { start: 0, end: 6 }, title: null, sourceSpans: sourceLocations(map, span), ...flags,
  });
  return { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: "fixture",
    promptVersion: "fixture", processingStrategy: "fixture", warnings: [], unresolvedItems: [],
    segments: [segment("chunk_a:rule", a, { continuesAfterChunk: true }),
      segment("chunk_b:rule", b, { startsBeforeChunk: true })], references: [] };
}

test("boundary repair joins only complementary, labelled continuations and retains evidence", () => {
  const map = source(["Rule 8 delete records after", "the period in the Schedule."]);
  const result = reconcileBoundaries(map, candidate(map));
  assert.equal(result.segments.length, 1);
  assert.equal(map.text.slice(result.segments[0]!.span.start, result.segments[0]!.span.end), map.text);
  assert.equal(result.segments[0]!.continuesAfterChunk, false);
  assert.deepEqual(result.segments[0]!.reconciliation?.fragmentIds, ["chunk_a:rule", "chunk_b:rule"]);
});

test("boundary repair refuses a nearby provision with missing continuation evidence", () => {
  const map = source(["Rule 8 delete records after", "Rule 9 other obligation."]);
  const input = candidate(map); input.segments[1]!.startsBeforeChunk = false;
  const result = reconcileBoundaries(map, input);
  assert.equal(result.segments.length, 2);
  assert.ok(result.warnings.some(w => w.startsWith("unreconciled_boundary:")));
});

test("provision identities survive provider and chunk-local ID changes on the same source spans", () => {
  const map = source(["Rule 8", "records"]);
  const a = candidate(map), b = structuredClone(a);
  b.segments.forEach((s, i) => s.id = `other-chunk:${i}`);
  const refs = detectReferences(map, "v1");
  assert.deepEqual(reconstructSource(map, a, refs).provisions.map(p => p.id),
    reconstructSource(map, b, refs).provisions.map(p => p.id));
});

test("candidate context follows a Schedule row's reference rather than stopping at its parent", () => {
  const map = source(["Rule 8 refers to Third Schedule.", "Third Schedule", "Row refers to Rule 10.", "Rule 10 starts the clock."]);
  const input = candidate(map);
  input.segments = map.spans.map((span, i) => ({ id: String(i), kind: "unit",
    type: i === 1 ? "schedule" : i === 2 ? "table_row" : "rule", category: "main",
    parent: i === 2 ? "1" : null, children: [], span: i === 1 ? { start: span.start, end: map.spans[2]!.end } : span,
    code: { start: span.start, end: span.start + (i === 1 ? 14 : i === 3 ? 7 : 6) }, title: null,
    sourceSpans: sourceLocations(map, span) }));
  const draft = reconstructSource(map, input, detectReferences(map, "v1"));
  const doc = buildDocumentModel(map, draft);
  const root = draft.provisions.find(p => p.candidateSegmentId === "0")!;
  const clock = draft.provisions.find(p => p.candidateSegmentId === "3")!;
  assert.ok(doc.contextManifests.find(m => m.targetProvisionId === root.id)!.includedProvisionIds.includes(clock.id));
});

test("accepted context includes typed incoming exceptions but does not reverse generic citations", () => {
  const provisions = ["rule", "exception", "unrelated"].map(id => ({ id, revision: 1, sourceVersionId: "v1", text: id }));
  const link = (id: string, kind: string) => ({ id, revision: 1, source: { id, revision: 1 },
    target: { id: "rule", revision: 1 }, kind }) as LegalRelationRevision;
  const result = assembleLegalContext({ id: "rule", revision: 1 }, provisions,
    [link("exception", "exception_to"), link("unrelated", "refers_to")],
    new Set(provisions.map(p => `${p.id}:1`)), 1000);
  assert.equal(result.complete, true);
  assert.deepEqual(result.provisions.map(p => p.id), ["rule", "exception"]);
});

test("accepted context rejects ambiguous parent revisions rather than taking the first array entry", () => {
  const provisions = [{ id: "child", revision: 1, sourceVersionId: "v1", text: "child", parentId: "parent" },
    { id: "parent", revision: 1, sourceVersionId: "v1", text: "old" },
    { id: "parent", revision: 2, sourceVersionId: "v1", text: "new" }];
  const result = assembleLegalContext({ id: "child", revision: 1 }, provisions, [],
    new Set(["child:1", "parent:1", "parent:2"]), 1000);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("missing_or_ambiguous_parent:parent"));
});
