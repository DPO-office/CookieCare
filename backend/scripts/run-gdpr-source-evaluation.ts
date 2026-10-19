import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { config as loadEnv } from "dotenv";
import { DOCLING_CONFIG, DOCLING_VERSION, DoclingPdfExtractor } from
  "../src/mastra/knowledge-base/ingestion/extraction/docling-pdf.js";
import { buildSourceMap } from "../src/mastra/knowledge-base/ingestion/extraction/source-map.js";
import { ReviewDatasetSchema } from "../src/mastra/knowledge-base/ingestion/evaluation/dataset-contracts.js";

loadEnv({ path: "../.env", quiet: true });
loadEnv({ path: ".env", quiet: true, override: true });
// This evaluation keeps the PDF on the local machine even when a service URL is configured.
delete process.env.DOCLING_SERVICE_URL;
delete process.env.DOCLING_SERVICE_TOKEN;

const fixture = "src/mastra/knowledge-base/ingestion/evaluation/fixtures/gdpr-review-v1/dataset.json";
const outputDir = "evaluation-runs/gdpr-oj-2016-en-review-v1/docling-1.41.0";
const dataset = ReviewDatasetSchema.parse(JSON.parse(await readFile(fixture, "utf8")));
const pdfPath = (dataset.source as { local_path?: string }).local_path;
if (!pdfPath) throw new Error("Dataset does not specify the source PDF path");
const pdf = await readFile(pdfPath);
const hash = createHash("sha256").update(pdf).digest("hex");
if (hash !== dataset.source.sha256 || pdf.length !== dataset.source.byte_size)
  throw new Error("Local PDF does not match the reviewed dataset manifest");

const started = performance.now();
const document = await new DoclingPdfExtractor().extract(pdf, "CELEX_32016R0679_EN_TXT.pdf");
const sourceMap = buildSourceMap(document, dataset.source.page_count);
const manifest = { datasetId: dataset.dataset_id, sourceSha256: hash,
  parser: "docling.rs", parserVersion: DOCLING_VERSION, parserConfig: DOCLING_CONFIG,
  extractionMode: "local",
  sourceTextHash: sourceMap.textHash, canonicalCharacters: sourceMap.text.length,
  mappedPages: sourceMap.pages.filter(page => page.status === "mapped").length,
  pageCount: sourceMap.pages.length, spanCount: sourceMap.spans.length,
  mapStatus: sourceMap.status, warnings: sourceMap.warnings,
  durationMs: Math.round(performance.now() - started) };
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, "docling.json"), `${JSON.stringify(document)}\n`),
  writeFile(join(outputDir, "source-map.json"), `${JSON.stringify(sourceMap)}\n`),
  writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
