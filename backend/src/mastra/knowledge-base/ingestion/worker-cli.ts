import pg from "pg";
import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { KbIngestionWorker } from "./worker.js";
import { KbJobStore } from "./storage/job-store.js";
import { KbArtifactStore, S3ArtifactObjectStore } from "./storage/artifact-store.js";
import { DoclingPdfExtractor } from "./extraction/docling-pdf.js";
import { createAuthorizedProductionStructureProvider } from "./extraction/structure-provider-factory.js";
import { S3ObjectStore } from "./storage/object-store.js";
import { KbUploadService } from "./storage/upload-service.js";
import { migrateKnowledgeBase } from "./storage/migrate.js";
import { createProcessIngestionWorkflow } from "./workflows/process-ingestion-workflow.js";
import { createPrepareSourceWorkflow } from "./workflows/prepare-source-workflow.js";
import { doclingServiceSettings } from "../../../services/docling-client.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (process.env.NODE_ENV === "production") {
  doclingServiceSettings();
  if ((process.env.DOCLING_SERVICE_TOKEN?.length ?? 0) < 32) {
    throw new Error("DOCLING_SERVICE_TOKEN must be at least 32 characters");
  }
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrateKnowledgeBase(pool);
} catch (error) {
  await pool.end();
  throw error;
}
const objects = S3ObjectStore.fromEnvironment();
const jobs = new KbJobStore(pool);
const uploads = new KbUploadService(pool, objects);
const workflow = createProcessIngestionWorkflow(() => ({ pool, objects, jobs }));
const artifactStore = new KbArtifactStore(pool, S3ArtifactObjectStore.fromEnvironment(), jobs);
const extractor = new DoclingPdfExtractor();
const prepareWorkflow = createPrepareSourceWorkflow(() => ({ pool, objects, jobs,
  artifacts: artifactStore, extractor,
  providerFactory: createAuthorizedProductionStructureProvider }));
const mastra = new Mastra({
  storage: new PostgresStore({ id: "cookiecare-kb-worker", connectionString: process.env.DATABASE_URL }),
  workflows: { processIngestionWorkflow: workflow, prepareSourceWorkflow: prepareWorkflow },
});
const worker = new KbIngestionWorker(jobs, { intake: mastra.getWorkflow("processIngestionWorkflow"),
  prepare_source: mastra.getWorkflow("prepareSourceWorkflow") },
  Number(process.env.KB_WORKER_CONCURRENCY ?? 2));
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const reconcile = setInterval(() => {
  void uploads.reconcile().catch(error => console.error("KB reconciliation failed:", error));
}, 60_000);
try {
  await uploads.reconcile();
  await worker.runUntilStopped(controller.signal);
} finally {
  clearInterval(reconcile);
  await pool.end();
}
