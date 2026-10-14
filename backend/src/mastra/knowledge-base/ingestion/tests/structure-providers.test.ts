import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { KanonStructureProvider, kanonProviderConfiguration } from "../extraction/kanon.js";
import { LlmStructureProvider } from "../extraction/llm-structure.js";
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
    KB_STRUCTURE_LLM_MODEL: "gemini-test" }).model, "gemini-test");
  assert.throws(() => resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "other" }), /Invalid option/);
  assert.throws(() => resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" }),
    /KB_STRUCTURE_LLM_MODEL/);
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
    KB_STRUCTURE_LLM_MODEL: "gemini-test" });
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
    KB_STRUCTURE_LLM_MODEL: "gemini-test" });
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
  assert.throws(() => createAuthorizedProductionStructureProvider(configuration),
    /disabled in the production worker/);
});
