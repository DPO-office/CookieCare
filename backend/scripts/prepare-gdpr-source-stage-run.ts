import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ReviewDatasetSchema, ReviewRunSchema } from
  "../src/mastra/knowledge-base/ingestion/evaluation/dataset-contracts.js";
import type { SourceMap } from "../src/mastra/knowledge-base/ingestion/extraction/source-map.js";

const fixtureDir = "src/mastra/knowledge-base/ingestion/evaluation/fixtures/gdpr-review-v1";
const outputDir = "evaluation-runs/gdpr-oj-2016-en-review-v1/docling-1.41.0";
const dataset = ReviewDatasetSchema.parse(JSON.parse(await readFile(join(fixtureDir, "dataset.json"), "utf8")));
const template = ReviewRunSchema.parse(JSON.parse(await readFile(join(fixtureDir, "run-results.template.json"), "utf8")));
const sourceMap = JSON.parse(await readFile(join(outputDir, "source-map.json"), "utf8")) as SourceMap;
const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8")) as {
  sourceSha256: string; durationMs: number; sourceTextHash: string };
if (manifest.sourceSha256 !== dataset.source.sha256 || sourceMap.textHash !== manifest.sourceTextHash ||
  sourceMap.pages.length !== dataset.source.page_count) throw new Error("Source extraction does not match the dataset");

const unicodeSpans = sourceMap.spans.filter(span => span.page !== null && [33, 34, 35].includes(span.page))
  .map(span => ({ page: span.page, itemRef: span.itemRef,
    text: sourceMap.text.slice(span.start, span.end) }));
const run = { ...template, run_id: "gdpr-docling-local-1.41.0-first-pass",
  provider: "local_docling", model: "docling.rs-1.41.0", prompt_version: null,
  pipeline_version: "kb-source-extraction-v1", reasoning_setting: null,
  model_assignments: [],
  artifacts: { page_inventory: { pages: sourceMap.pages },
    unicode_source_output: { spans: unicodeSpans } },
  metrics: { duration_ms: manifest.durationMs, input_tokens: null,
    output_tokens: null, estimated_cost_usd: 0 },
  results: template.results.map(result => result.case_id === "GDPR-S1-02"
    ? { ...result, status: "completed", evidence_refs: ["page_inventory#"] }
    : result.case_id === "GDPR-S2-10"
      ? { ...result, status: "completed", evidence_refs: ["unicode_source_output#"] }
      : result),
};
ReviewRunSchema.parse(run);
await writeFile(join(outputDir, "run-results.source-stage.json"), `${JSON.stringify(run, null, 2)}\n`);
process.stdout.write(JSON.stringify({ runId: run.run_id,
  casesWithEvidence: run.results.filter(result => result.evidence_refs.length).map(result => result.case_id),
  unicodeSpans: unicodeSpans.length }, null, 2));
