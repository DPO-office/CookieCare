import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";
import { ReviewDatasetSchema } from "../src/mastra/knowledge-base/ingestion/evaluation/dataset-contracts.js";

loadDotEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
loadDotEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), override: true });

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for a persistent Mastra Studio dataset");

const path = fileURLToPath(new URL(
  "../src/mastra/knowledge-base/ingestion/evaluation/fixtures/dpdpa-2023-review-v1/dataset.json",
  import.meta.url,
));
const bytes = await readFile(path);
const dataset = ReviewDatasetSchema.parse(JSON.parse(bytes.toString("utf8")));
const datasetSha256 = createHash("sha256").update(bytes).digest("hex");
const { mastra } = await import("../src/mastra/index.js");

let target;
try {
  target = await mastra.datasets.get({ id: dataset.dataset_id });
  const existing = await target.getDetails();
  if (existing.metadata?.sourceDatasetSha256 !== datasetSha256)
    throw new Error(`Mastra dataset ${dataset.dataset_id} has a different source version; review changes before importing`);
} catch (error) {
  if (!(error instanceof Error) || !/not.found|404/i.test(error.message)) throw error;
  target = await mastra.datasets.create({
    id: dataset.dataset_id,
    name: "DPDPA Gazette Act 2023 - review cases",
    description: "Source-backed DPDPA expectations for the saved ingestion run. Human legal review is pending for every case.",
    metadata: {
      sourceDatasetSha256: datasetSha256,
      sourcePdfSha256: dataset.source.sha256,
      referenceStatus: "provisional_ai_drafted",
      humanReviewPending: true,
      schemaVersion: dataset.schema_version,
      sourceFamily: dataset.source_family,
    },
    targetType: "workflow",
    targetIds: ["kb-dpdpa-review-case-v1"],
    scorerIds: ["kb-dpdpa-provisional-accuracy-v1"],
  });
}

const current = await target.listItems({ perPage: 100 });
if (current.items.length > 0) {
  if (current.items.length !== dataset.cases.length ||
      new Set(current.items.map(item => item.externalId)).size !== dataset.cases.length ||
      current.items.some(item => !dataset.cases.some(row => row.id === item.externalId)))
    throw new Error("Mastra dataset items differ from the frozen source; inspect before modifying them");
  process.stdout.write(`Already present: ${target.id} (${current.items.length} cases)\n`);
} else {
  await target.addItems({ items: dataset.cases.map(row => ({
    externalId: row.id,
    input: { caseId: row.id, stage: row.stage, task: row.input, sourcePdfSha256: dataset.source.sha256 },
    groundTruth: { expected: row.expected, forbidden: row.must_not },
    metadata: {
      title: row.title,
      stage: row.stage,
      method: row.grading.method,
      matchPolicy: row.grading.match_policy,
      sourceRefs: row.source_refs,
      severity: row.severity,
      humanReviewStatus: row.human_review.status,
      referenceStatus: "provisional_ai_drafted",
    },
  })) });
  process.stdout.write(`Imported: ${target.id} (${dataset.cases.length} provisional cases)\n`);
}
