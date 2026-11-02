import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { sourceLocations, type CandidateStructure } from "../extraction/structure-provider.js";
import { discoverContainerSkeleton, inferDocumentGrammar, computeAncestorBreadcrumbAt } from "../extraction/document-grammar.js";
import { LlmStructureProvider } from "../extraction/llm-structure.js";
import { resolveStructureProviderConfig } from "../extraction/structure-provider.js";

test("Layer 2: split Chapter headings merge with title spans, ignore Gazette mastheads, and enclose Sections", () => {
  const raw = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1, size: { width: 595, height: 842 } } },
    body: {
      self_ref: "#/body",
      children: Array.from({ length: 7 }, (_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      { self_ref: "#/texts/0", text: "PART II - Section 1", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/1", text: "CHAPTER I", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/2", text: "PRELIMINARY", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/3", text: "1. (1) This Act may be called the Sample Data Act, 2023 under section 2.", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/4", text: "CHAPTER II", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/5", text: "SPECIAL PROVISIONS", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/6", text: "2. (1) The provisions of section 1 shall apply to every fiduciary.", label: "text", prov: [{ page_no: 1 }] },
    ],
  };

  const map = buildSourceMap(raw, 1);
  const skeleton = discoverContainerSkeleton(map);
  assert.equal(skeleton.length, 2, "Gazette PART II - Section 1 is ignored; exactly 2 chapters discovered");
  assert.equal(skeleton[0]?.number, "i");
  assert.equal(map.text.slice(skeleton[0]!.titleRange!.start, skeleton[0]!.titleRange!.end), "PRELIMINARY");
  assert.equal(skeleton[1]?.number, "ii");
  assert.equal(map.text.slice(skeleton[1]!.titleRange!.start, skeleton[1]!.titleRange!.end), "SPECIAL PROVISIONS");

  // Simulate LLM emitting CHAPTER I as "unknown" and SPECIAL PROVISIONS as a separate bogus chapter
  const candidate: CandidateStructure = {
    schemaVersion: 1,
    textHash: map.textHash,
    provider: "llm",
    model: "glm-5.3",
    promptVersion: "test",
    processingStrategy: "chunked",
    segments: [
      { id: "unk_ch1", kind: "unit", type: "unknown", category: null, parent: null, children: [],
        span: { start: map.spans[1]!.start, end: map.spans[1]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[1]!) },
      { id: "sec1", kind: "container", type: "section", category: null, parent: null, children: [],
        span: { start: map.spans[3]!.start, end: map.spans[3]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[3]!) },
      { id: "ch2_num", kind: "container", type: "chapter", category: null, parent: null, children: [],
        span: { start: map.spans[4]!.start, end: map.spans[4]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[4]!) },
      { id: "ch2_bogus_title", kind: "container", type: "chapter", category: null, parent: null, children: [],
        span: { start: map.spans[5]!.start, end: map.spans[5]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[5]!) },
      { id: "sec2", kind: "container", type: "section", category: null, parent: null, children: [],
        span: { start: map.spans[6]!.start, end: map.spans[6]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[6]!) },
    ],
    references: [],
    unresolvedItems: [],
    warnings: [],
  };

  const draft = reconstructSource(map, candidate, detectReferences(map, "v1"));
  const chapters = draft.provisions.filter(p => p.kind === "chapter");
  assert.equal(chapters.length, 2, "duplicate title-only chapter collapsed and unknown CHAPTER I promoted");
  assert.equal(chapters[0]?.label, "CHAPTER I — PRELIMINARY");
  assert.equal(chapters[1]?.label, "CHAPTER II — SPECIAL PROVISIONS");

  const sec1 = draft.provisions.find(p => p.canonicalCitation === "Section 1");
  const sec2 = draft.provisions.find(p => p.canonicalCitation === "Section 2");
  assert.equal(sec1?.parentId, chapters[0]?.id);
  assert.equal(sec2?.parentId, chapters[1]?.id);
});

test("Layer 2: US CCPA-style decimal section numbers (1798.100) and (a)->(1)->(A)->(i) hierarchy are inferred automatically", () => {
  const raw = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1, size: { width: 612, height: 792 } } },
    body: {
      self_ref: "#/body",
      children: Array.from({ length: 6 }, (_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      { self_ref: "#/texts/0", text: "TITLE 1.81.5 — CALIFORNIA CONSUMER PRIVACY ACT", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/1", text: "1798.100. (a) A business that controls the collection of a consumer's personal information shall inform consumers:", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/2", text: "(1) The categories of personal information to be collected and the purposes:", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/3", text: "(A) Whether that information is sold or shared:", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/4", text: "(i) To third-party advertising networks.", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/5", text: "1798.105. (a) A consumer shall have the right to request that a business delete any personal information under Section 1798.100.", label: "text", prov: [{ page_no: 1 }] },
    ],
  };

  const map = buildSourceMap(raw, 1);
  const grammar = inferDocumentGrammar(map);
  assert.equal(grammar.supportsDecimalNumbers, true);
  assert.deepEqual(grammar.hierarchyOrder, ["lower_alpha", "num_paren", "upper_alpha", "lower_roman"]);

  const candidate: CandidateStructure = {
    schemaVersion: 1,
    textHash: map.textHash,
    provider: "llm",
    model: "glm-5.3",
    promptVersion: "test",
    processingStrategy: "chunked",
    segments: [
      { id: "s100", kind: "container", type: "section", category: null, parent: null, children: [],
        span: { start: map.spans[1]!.start, end: map.spans[4]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, { start: map.spans[1]!.start, end: map.spans[4]!.end }) },
      { id: "s100_a", kind: "unit", type: "subsection", category: null, parent: "s100", children: [],
        span: { start: map.spans[1]!.start, end: map.spans[1]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[1]!) },
      { id: "s100_a_1", kind: "unit", type: "point", category: null, parent: "s100", children: [],
        span: { start: map.spans[2]!.start, end: map.spans[2]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[2]!) },
      { id: "s100_a_1_A", kind: "unit", type: "subparagraph", category: null, parent: "s100", children: [],
        span: { start: map.spans[3]!.start, end: map.spans[3]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[3]!) },
      { id: "s100_a_1_A_i", kind: "unit", type: "subparagraph", category: null, parent: "s100", children: [],
        span: { start: map.spans[4]!.start, end: map.spans[4]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[4]!) },
      { id: "s105", kind: "container", type: "section", category: null, parent: null, children: [],
        span: { start: map.spans[5]!.start, end: map.spans[5]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[5]!) },
    ],
    references: [],
    unresolvedItems: [],
    warnings: [],
  };

  const draft = reconstructSource(map, candidate, detectReferences(map, "v1"));
  const citations = new Set(draft.provisions.map(p => p.canonicalCitation));
  assert.ok(citations.has("Section 1798.100"));
  assert.ok(citations.has("Section 1798.100(a)"));
  assert.ok(citations.has("Section 1798.100(a)(1)"));
  assert.ok(citations.has("Section 1798.100(a)(1)(a)"));
  assert.ok(citations.has("Section 1798.100(a)(1)(a)(i)"));
  assert.ok(citations.has("Section 1798.105"));
});

test("Layer 2: EU GDPR-style Article + bare numeric paragraphs (1. -> (a)) resolve cleanly", () => {
  const raw = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1, size: { width: 595, height: 842 } } },
    body: {
      self_ref: "#/body",
      children: Array.from({ length: 3 }, (_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      { self_ref: "#/texts/0", text: "Article 6", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/1", text: "1. Processing shall be lawful only if and to the extent that at least one applies:", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/2", text: "(a) the data subject has given consent to the processing of personal data.", label: "text", prov: [{ page_no: 1 }] },
    ],
  };

  const map = buildSourceMap(raw, 1);
  const candidate: CandidateStructure = {
    schemaVersion: 1,
    textHash: map.textHash,
    provider: "llm",
    model: "glm-5.3",
    promptVersion: "test",
    processingStrategy: "chunked",
    segments: [
      { id: "art6", kind: "container", type: "article", category: null, parent: null, children: [],
        span: { start: map.spans[0]!.start, end: map.spans[2]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, { start: map.spans[0]!.start, end: map.spans[2]!.end }) },
      { id: "art6_1", kind: "unit", type: "paragraph", category: null, parent: "art6", children: [],
        span: { start: map.spans[1]!.start, end: map.spans[1]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[1]!) },
      { id: "art6_1_a", kind: "unit", type: "point", category: null, parent: "art6", children: [],
        span: { start: map.spans[2]!.start, end: map.spans[2]!.end }, code: null, title: null,
        sourceSpans: sourceLocations(map, map.spans[2]!) },
    ],
    references: [],
    unresolvedItems: [],
    warnings: [],
  };

  const draft = reconstructSource(map, candidate, detectReferences(map, "v1"));
  const citations = new Set(draft.provisions.map(p => p.canonicalCitation));
  assert.ok(citations.has("Article 6"));
  assert.ok(citations.has("Article 6(1)"));
  assert.ok(citations.has("Article 6(1)(a)"));
});

test("Layer 3: isolated single-unit retry receives active Chapter > Section > Subsection breadcrumb and recovers unknown (b)/(c)", async () => {
  const raw = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1, size: { width: 595, height: 842 } } },
    body: {
      self_ref: "#/body",
      children: Array.from({ length: 5 }, (_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      { self_ref: "#/texts/0", text: "CHAPTER IV", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/1", text: "SPECIAL PROVISIONS", label: "section_header", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/2", text: "17. (1) The provisions of section 8 shall not apply where—", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/3", text: "(a) the processing of personal data is necessary for enforcing any legal right;", label: "text", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/4", text: "(b) the processing of personal data by any court or tribunal is necessary.", label: "text", prov: [{ page_no: 1 }] },
    ],
  };

  const map = buildSourceMap(raw, 1);
  const crumbsAtB = computeAncestorBreadcrumbAt(map, map.spans[4]!.start);
  assert.ok(crumbsAtB.includes("CHAPTER IV — SPECIAL PROVISIONS"));
  assert.ok(crumbsAtB.includes("Section 17"));
  assert.ok(crumbsAtB.includes("Subsection (1)"));
  assert.ok(crumbsAtB.some(c => c.startsWith("Grammar: section ->")));

  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  const seenPrompts: Array<{ chunkId: string; headingContext?: string[] }> = [];

  const provider = new LlmStructureProvider(configuration, {
    generate: async req => {
      const parsed = JSON.parse(req.prompt) as {
        chunk: { chunkId: string; headingContext?: string[] };
        sourceUnits: Array<[string, string, string]>;
      };
      seenPrompts.push({ chunkId: parsed.chunk.chunkId, headingContext: parsed.chunk.headingContext });
      const core = parsed.sourceUnits.filter(u => u[1] === "c");
      if (parsed.chunk.chunkId === "chunk_001") {
        // Deliberately omit src:4 ("(b) ...") on first call to trigger single-unit retry chunk_001u1
        return {
          output: {
            segments: core
              .filter(u => u[0] !== "src:4")
              .map((u, idx) => ({
                id: `seg_${idx}`,
                kind: "unit",
                type: idx <= 1 ? "chapter" : idx === 2 ? "subsection" : "point",
                category: null,
                parent: null,
                sourceAnchors: [{ sourceId: u[0], exactQuote: u[2], occurrence: 0 }],
                codeAnchor: null,
                titleAnchor: null,
              })),
            references: [],
            unresolvedItems: [],
            warnings: [],
          },
          rawResponse: {},
          usage: null,
        };
      }
      // On retry chunk_001u1, simulate model returning generic type "item"
      return {
        output: {
          segments: core.map(u => ({
            id: "retry_b",
            kind: "item",
            type: "item",
            category: null,
            parent: null,
            sourceAnchors: [{ sourceId: u[0], exactQuote: u[2], occurrence: 0 }],
            codeAnchor: null,
            titleAnchor: null,
          })),
          references: [],
          unresolvedItems: [],
          warnings: [],
        },
        rawResponse: {},
        usage: null,
      };
    },
  });

  const extracted = await provider.extract({
    canonicalText: map.text,
    textHash: map.textHash,
    sourceMap: map,
    configuration,
  });

  const retryPrompt = seenPrompts.find(p => p.chunkId === "chunk_001u1");
  assert.ok(retryPrompt?.headingContext?.includes("Section 17"), "single-unit retry received Section 17 breadcrumb");
  assert.ok(retryPrompt?.headingContext?.includes("Subsection (1)"), "single-unit retry received Subsection (1) breadcrumb");

  const draft = reconstructSource(map, extracted.candidate, detectReferences(map, "v1"));
  const sec171b = draft.provisions.find(p => p.canonicalCitation === "Section 17(1)(b)");
  assert.ok(sec171b, "generic item '(b)' deterministically recovered as Section 17(1)(b)");
  assert.equal(sec171b.kind, "point");
});

