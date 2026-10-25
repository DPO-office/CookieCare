import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { nativeDoclingChunks, projectDoclingChunks } from "../src/mastra/knowledge-base/ingestion/extraction/docling-chunk-plan.js";
import { LLM_STRUCTURE_SYSTEM_PROMPT, LLM_STRUCTURE_RESPONSE_SCHEMA, LlmStructureProvider } from "../src/mastra/knowledge-base/ingestion/extraction/llm-structure.js";
import { DigitalOceanStructureClient } from "../src/mastra/knowledge-base/ingestion/extraction/do-structure.js";
import { resolveStructureProviderConfig } from "../src/mastra/knowledge-base/ingestion/extraction/structure-provider.js";
import { detectReferences } from "../src/mastra/knowledge-base/ingestion/extraction/reference-detection.js";
import { reconstructSource } from "../src/mastra/knowledge-base/ingestion/extraction/reconstruct.js";
import { buildDocumentModel } from "../src/mastra/knowledge-base/ingestion/extraction/document-model.js";
import { validateReconstruction } from "../src/mastra/knowledge-base/ingestion/extraction/validate-reconstruction.js";

config({ path: "../.env", quiet: true });
const { values } = parseArgs({ options: { source: { type: "string" }, output: { type: "string" },
  live: { type: "boolean" }, "local-docling": { type: "boolean" } }, strict: true });
if (!values.source || !values.output) throw new Error("--source <frozen-run-directory> --output <new-directory> required");
if (path.resolve(values.source) === path.resolve(values.output)) throw new Error("Use a separate output directory");
if (values["local-docling"]) delete process.env.DOCLING_SERVICE_URL;
const read = async (name: string) => JSON.parse(await readFile(path.join(values.source!, name), "utf8"));
const map = await read("source-map.json"), document = await read("docling.json");
await mkdir(values.output, { recursive: true });
const save = async (name: string, data: unknown) => writeFile(path.join(values.output!, name), JSON.stringify(data, null, 2));
const native = await nativeDoclingChunks(document);
const fixed = LLM_STRUCTURE_SYSTEM_PROMPT.length + JSON.stringify(LLM_STRUCTURE_RESPONSE_SCHEMA).length;
const plan = projectDoclingChunks(map, native, fixed);
const owned = plan.chunks.flatMap(c => c.sourceUnits!.filter(u => c.coreSourceIds.includes(u.id)));
const coveredCharacters = owned.reduce((sum, unit) => sum + unit.text.length, 0);
const sourceCharacters = map.spans.reduce((sum: number, span: { start: number; end: number }) => sum + span.end - span.start, 0);
const summary = { sourceTextHash: map.textHash, sourceCharacters, coveredCharacters,
  exactSourceCoverage: coveredCharacters === sourceCharacters && owned.every(u => map.text.slice(u.start, u.end) === u.text),
  nativeChunks: native.length, requests: plan.chunks.length,
  maximumRequestCharacters: Math.max(...plan.chunks.map(c => c.assembledInputCharacters)),
  nativeTokenBudget: plan.nativeMaxTokens, tokenizer: plan.tokenizer,
  warningCount: plan.warnings?.length ?? 0, liveModelRun: !!values.live };
await save("chunk-plan.json", plan); await save("planning-report.json", summary);
console.log(JSON.stringify(summary));
if (values.live) {
  const configuration = resolveStructureProviderConfig({ ...process.env, KB_STRUCTURE_PROVIDER: "llm" });
  const provider = new LlmStructureProvider(configuration, new DigitalOceanStructureClient(), nativeDoclingChunks);
  const started = Date.now();
  try {
    const result = await provider.extract({ canonicalText: map.text, textHash: map.textHash,
      sourceMap: map, doclingDocument: document, configuration, checkpoints: {
        savePlan: p => save("chunk-plan.json", p),
        loadChunk: async chunk => { try { return JSON.parse(await readFile(path.join(values.output!, `${chunk.chunkId}.json`), "utf8")); } catch { return null; } },
        saveChunk: checkpoint => save(`${checkpoint.chunk.chunkId}.json`, checkpoint),
        saveAttempt: attempt => save(`attempt-${attempt.attemptId.replaceAll(":", "-")}.json`, attempt),
      } });
    const references = detectReferences(map, `source-${map.textHash}`);
    const reconstruction = reconstructSource(map, result.candidate, references);
    const model = buildDocumentModel(map, reconstruction);
    const validation = validateReconstruction(reconstruction.sourceVersionId, map, reconstruction, model);
    await save("structure-candidate.json", result.candidate);
    await save("reconstruction.json", reconstruction); await save("document-model.json", model);
    await save("validation.json", validation); await save("provider-result.json", result);
    await save("experiment.json", { status: "completed", configuration, durationMs: Date.now() - started,
      provisionCount: reconstruction.provisions.length, relationshipCount: reconstruction.relationships.length,
      validationStatus: validation.status, issues: validation.issues.length, usage: result.usage,
      usageAccounting: result.usageAccounting, legalAccuracy: "not_established" });
    console.log(`Completed: ${reconstruction.provisions.length} provisions, ${validation.issues.length} validation issues`);
  } catch (error) {
    await save("experiment.json", { status: "failed", configuration, durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error), legalAccuracy: "not_established" });
    throw error;
  }
}
