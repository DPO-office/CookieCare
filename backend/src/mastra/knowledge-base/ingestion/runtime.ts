import type { Pool } from "pg";
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

/** Run the durable KB queue in the API process when Spaces is configured. */
export async function startKnowledgeBaseWorker(pool: Pool): Promise<void> {
  // Validate storage before applying migrations or accepting KB jobs.
  const objects = S3ObjectStore.fromEnvironment();
  const artifactObjects = S3ArtifactObjectStore.fromEnvironment();
  await migrateKnowledgeBase(pool);

  const jobs = new KbJobStore(pool);
  const uploads = new KbUploadService(pool, objects);
  const intake = createProcessIngestionWorkflow(() => ({ pool, objects, jobs }));
  const artifacts = new KbArtifactStore(pool, artifactObjects, jobs);
  const prepare = createPrepareSourceWorkflow(() => ({ pool, objects, jobs,
    artifacts, extractor: new DoclingPdfExtractor(),
    providerFactory: createAuthorizedProductionStructureProvider }));
  const mastra = new Mastra({
    storage: new PostgresStore({ id: "cookiecare-kb-worker", connectionString: process.env.DATABASE_URL }),
    workflows: { processIngestionWorkflow: intake, prepareSourceWorkflow: prepare },
  });
  const worker = new KbIngestionWorker(jobs, {
    intake: mastra.getWorkflow("processIngestionWorkflow"),
    prepare_source: mastra.getWorkflow("prepareSourceWorkflow"),
  }, Number(process.env.KB_WORKER_CONCURRENCY ?? 2));
  const controller = new AbortController();
  await uploads.reconcile();
  const reconcile = setInterval(() => {
    void uploads.reconcile().catch(error => console.error("KB reconciliation failed:", error));
  }, 60_000);
  process.once("exit", () => {
    controller.abort();
    clearInterval(reconcile);
  });
  void worker.runUntilStopped(controller.signal).catch(error => {
    clearInterval(reconcile);
    console.error("Knowledge Base worker stopped:", error);
    process.exit(1);
  });
}
