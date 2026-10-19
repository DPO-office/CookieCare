import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { KanonStructureProvider, kanonProviderConfiguration } from "../extraction/kanon.js";
import { LlmStructureProvider } from "../extraction/llm-structure.js";
import { planStructureChunks } from "../extraction/structure-chunk-plan.js";
import { createAuthorizedProductionStructureProvider, createStructureProvider } from
  "../extraction/structure-provider-factory.js";
import { resolveStructureProviderConfig } from "../extraction/structure-provider.js";

const document = {
  schema_name: "DoclingDocument", version: "1", pages: { "1": { page_no: 1 } },
  body: { self_ref: "#/body", children: [{ $ref: "#/texts/0" }] },
  furniture: { self_ref: "#/furniture", children: [] }, tables: [],
  texts: [{ self_ref: "#/texts/0", text: "Article 1\nScope", label: "paragraph",
    prov: [{ page_no: 1 }] }],
};

test("provider selection defaults to Kanon and rejects unknown values", () => {
  assert.equal(resolveStructureProviderConfig({}).provider, "kanon");
  assert.equal(resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm",
    KB_STRUCTURE_LLM_MODEL: "glm-5.3" }).model, "glm-5.3");
  assert.throws(() => resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "other" }), /Invalid option/);
  assert.equal(resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" }).model, "glm-5.3");
});

test("Kanon and LLM adapters return the same provider-neutral candidate contract", async () => {
  const map = buildSourceMap(document, 1);
  const kanonConfiguration = kanonProviderConfiguration();
  const kanon = new KanonStructureProvider({ enrich: async text => ({ results: [{ index: 0,
    document: { version: "ilgs@1", text, segments: [{ id: "s1", kind: "unit",
      type: "article", category: "main", parent: null, children: [],
      span: { start: 0, end: [...text].length }, code: null, title: null }], crossreferences: [] } }] }) },
  kanonConfiguration);
  const llmConfiguration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm",
    KB_STRUCTURE_LLM_MODEL: "glm-5.3" });
  const llm = new LlmStructureProvider(llmConfiguration, { generate: async () => ({
    output: { segments: [{ id: "s1", kind: "unit", type: "article", category: "main",
      parent: null, sourceAnchors: [{ sourceId: "src:0", exactQuote: map.text, occurrence: 0 }],
      codeAnchor: null, titleAnchor: null }], references: [], unresolvedItems: [], warnings: [] },
    rawResponse: { test: true }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  }) });
  const [kanonResult, llmResult] = await Promise.all([
    kanon.extract({ canonicalText: map.text, textHash: map.textHash, sourceMap: map,
      configuration: kanonConfiguration }),
    llm.extract({ canonicalText: map.text, textHash: map.textHash, sourceMap: map,
      configuration: llmConfiguration }),
  ]);
  for (const result of [kanonResult, llmResult]) {
    assert.deepEqual(Object.keys(result.candidate).sort(), ["model", "processingStrategy", "promptVersion",
      "provider", "references", "schemaVersion", "segments", "textHash", "unresolvedItems", "warnings"]);
    assert.equal(result.candidate.segments[0]?.sourceSpans[0]?.physicalPage, 1);
    assert.equal(result.candidate.textHash, map.textHash);
  }
  assert.notEqual(kanonResult.candidate.provider, llmResult.candidate.provider);
  assert.notEqual(kanonConfiguration.configurationHash, llmConfiguration.configurationHash);
});

test("LLM adapter rejects invented source anchors and never falls back to Kanon", async () => {
  const map = buildSourceMap(document, 1);
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm",
    KB_STRUCTURE_LLM_MODEL: "glm-5.3" });
  let llmCalls = 0;
  const provider = createStructureProvider(configuration, { llmClient: { generate: async () => {
    llmCalls++;
    return { output: { segments: [{ id: "s1", kind: "unit", type: "article", category: null,
      parent: null, sourceAnchors: [{ sourceId: "invented", exactQuote: "Article 1", occurrence: 0 }],
      codeAnchor: null, titleAnchor: null }], references: [], unresolvedItems: [], warnings: [] },
      rawResponse: {}, usage: null };
  } } });
  await assert.rejects(provider.extract({ canonicalText: map.text, textHash: map.textHash,
    sourceMap: map, configuration }), /invented source ID/);
  assert.equal(llmCalls, 1);
  assert.throws(() => createAuthorizedProductionStructureProvider(configuration, {}),
    /DO_MODEL_ACCESS_KEY/);
  assert.equal(createAuthorizedProductionStructureProvider(configuration,
    { DO_MODEL_ACCESS_KEY: "fixture" }).configuration.provider, "llm");
});

test("chunk planner chooses a legal boundary inside the soft-to-hard window", () => {
  const texts = ["x".repeat(70), "y".repeat(70), "Article 2", "z".repeat(70)];
  const raw = { ...document, body: { self_ref: "#/body",
    children: texts.map((_, index) => ({ $ref: `#/texts/${index}` })) },
  texts: texts.map((text, index) => ({ self_ref: `#/texts/${index}`, text,
    label: "paragraph", prov: [{ page_no: 1 }] })) };
  const map = buildSourceMap(raw, 1);
  const fixed = 10;
  const oneUnit = JSON.stringify({ textHash: map.textHash, chunk: { chunkId: "chunk_001",
    coreRange: { start: 0, end: 0 }, contextBefore: [], contextAfter: [] }, sourceUnits: [] }).length;
  const plan = planStructureChunks(map, { targetInputCharacters: fixed + oneUnit + 150,
    hardInputCharacters: fixed + oneUnit + 260, fixedInputCharacters: fixed });
  assert.equal(plan.chunks.length, 2);
  assert.deepEqual(plan.chunks[0]?.coreSourceIds, ["src:0", "src:1"]);
  assert.equal(plan.chunks[1]?.coreSourceIds[0], "src:2");
  assert.ok(plan.chunks.every(chunk => chunk.assembledInputCharacters <= plan.hardInputCharacters));
  assert.equal(plan.chunks[0]?.coreRange.start, 0);
  assert.equal(plan.chunks[0]?.coreRange.end, plan.chunks[1]?.coreRange.start);
  assert.equal(plan.chunks.at(-1)?.coreRange.end, map.text.length);
});

test("LLM adapter splits a truncated chunk and reconciles original offsets", async () => {
  const raw = { ...document, body: { self_ref: "#/body",
    children: [{ $ref: "#/texts/0" }, { $ref: "#/texts/1" }] },
  texts: ["Article 1\nScope", "Article 2\nDefinitions"].map((text, index) => ({
    self_ref: `#/texts/${index}`, text, label: "paragraph", prov: [{ page_no: 1 }] })) };
  const map = buildSourceMap(raw, 1);
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  let calls = 0;
  const provider = new LlmStructureProvider(configuration, { generate: async input => {
    calls++;
    const parsed = JSON.parse(input.prompt) as { sourceUnits: Array<[string, string, string]> };
    const core = parsed.sourceUnits.filter(unit => unit[1] === "c");
    if (calls === 1) return { output: {}, rawResponse: {}, usage: null, finishReason: "length" };
    return { output: { segments: core.map((unit, index) => ({ id: `s${index}`, kind: "unit",
      type: "article", category: "main", parent: null,
      sourceAnchors: [{ sourceId: unit[0], exactQuote: unit[2], occurrence: 0 }],
      codeAnchor: null, titleAnchor: null })), references: [], unresolvedItems: [], warnings: [] },
    rawResponse: {}, usage: null, finishReason: "stop" };
  } });
  const result = await provider.extract({ canonicalText: map.text, textHash: map.textHash,
    sourceMap: map, configuration });
  assert.equal(calls, 3);
  assert.equal(result.candidate.segments.length, 2);
  assert.deepEqual(result.candidate.segments.map(segment => map.text.slice(segment.span.start, segment.span.end)),
    ["Article 1\nScope", "Article 2\nDefinitions"]);
  assert.ok(result.candidate.segments.every(segment => segment.id.startsWith("chunk_001")));
});

test("LLM chunk checkpoints resume without repeating completed model calls", async () => {
  const map = buildSourceMap(document, 1);
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  let calls = 0;
  const saved = new Map<string, import("../extraction/structure-provider.js").StructureChunkCheckpoint>();
  const client = { generate: async () => {
    calls++;
    return { output: { segments: [{ id: "s1", kind: "unit", type: "article", category: "main",
      parent: null, sourceAnchors: [{ sourceId: "src:0", exactQuote: map.text, occurrence: 0 }],
      codeAnchor: null, titleAnchor: null }], references: [], unresolvedItems: [], warnings: [] },
    rawResponse: {}, usage: null, finishReason: "stop" };
  } };
  const checkpoints = { savePlan: async () => undefined,
    loadChunk: async (chunk: import("../extraction/structure-chunk-plan.js").StructureChunk) =>
      saved.get(chunk.inputHash) ?? null,
    saveChunk: async (checkpoint: import("../extraction/structure-provider.js").StructureChunkCheckpoint) => {
      saved.set(checkpoint.chunk.inputHash, checkpoint);
    } };
  const provider = new LlmStructureProvider(configuration, client);
  const input = { canonicalText: map.text, textHash: map.textHash, sourceMap: map,
    configuration, checkpoints };
  await provider.extract(input);
  await provider.extract(input);
  assert.equal(calls, 1);
  assert.equal(saved.size, 1);
});
