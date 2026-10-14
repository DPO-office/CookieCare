import { createHash } from "node:crypto";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import pg, { type Pool } from "pg";
import { z } from "zod";
import { SourceIntakeInputSchema, SourceIntakeOutputSchema } from "../contracts/intake.js";
import { KB_SCHEMA_VERSION, hashRevision } from "../schemas/common.js";
import { DOCLING_CONFIG, DOCLING_VERSION } from "../extraction/docling-pdf.js";
import { resolveStructureProviderConfig } from "../extraction/structure-provider.js";
import { classifySource } from "../steps/classify-source.js";
import { KbJobStore } from "../storage/job-store.js";
import { type ObjectStore, S3ObjectStore } from "../storage/object-store.js";
import { inspectOriginalPdf } from "../storage/pdf-metadata.js";

const JobInputSchema = z.strictObject({ jobId: z.string().min(1), leaseOwner: z.string().min(1) });
const VerifiedSchema = JobInputSchema.extend({ inputHash: z.string(), intake: SourceIntakeInputSchema });

export interface IngestionServices { pool: Pool; objects: ObjectStore; jobs: KbJobStore }
type ResolveServices = () => IngestionServices;

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function createProcessIngestionWorkflow(services: ResolveServices) {
  const verify = createStep({
    id: "verify-original-pdf-v1",
    inputSchema: JobInputSchema,
    outputSchema: VerifiedSchema,
    execute: async ({ inputData }) => {
      const { pool, objects, jobs } = services();
      const result = await pool.query(`
        SELECT j.input_hash, j.source_version_id, v.*, s.instrument_id, s.title,
          s.issuer, s.jurisdiction, s.visibility, s.owner_user_id,
          s.workspace_id, s.curator_user_id, s.authority_status
        FROM kb_ingestion_jobs j JOIN kb_source_versions v ON v.id = j.source_version_id
        JOIN kb_sources s ON s.id = v.source_id
        WHERE j.id = $1 AND j.status = 'running' AND j.lease_owner = $2
          AND j.lease_until > now() AND j.cancel_requested_at IS NULL`,
        [inputData.jobId, inputData.leaseOwner]);
      const row = result.rows[0];
      if (!row) throw new Error("Ingestion job lease is invalid");
      const stageHash = KbJobStore.stageHash(row.source_version_id, row.input_hash, "verify_original", "1");
      try {
        const stored = await objects.read(row.object_key);
        if (!stored || stored.contentType !== "application/pdf" ||
            stored.bytes.length !== Number(row.byte_size) ||
            createHash("sha256").update(stored.bytes).digest("hex") !== row.checksum) {
          throw new Error("Original PDF is missing or no longer matches its checksum");
        }
        let pdf = await jobs.completedStep<{ pageCount: number | null; readability: "readable" | "unreadable" }>(
          inputData.jobId, "verify_original", "1", stageHash);
        if (!pdf) {
          pdf = await inspectOriginalPdf(stored.bytes);
          if (row.original_page_count !== pdf.pageCount) throw new Error("Original PDF page count changed");
          pdf = await jobs.checkpoint(inputData.jobId, inputData.leaseOwner, "verify_original", "1", stageHash, pdf);
        }
        const access = row.visibility === "workspace"
          ? { visibility: "workspace" as const, ownerUserId: row.owner_user_id, workspaceId: row.workspace_id }
          : row.visibility === "curated_shared"
            ? { visibility: "curated_shared" as const, curatorUserId: row.curator_user_id }
            : { visibility: "private" as const, ownerUserId: row.owner_user_id };
        return {
          ...inputData,
          inputHash: row.input_hash,
          intake: {
            source: {
              schemaVersion: KB_SCHEMA_VERSION, id: row.source_id, instrumentId: row.instrument_id,
              title: row.title, issuer: row.issuer, jurisdiction: row.jurisdiction,
              access, authorityStatus: row.authority_status,
            },
            version: {
              schemaVersion: KB_SCHEMA_VERSION, id: row.source_version_id, sourceId: row.source_id,
              uploadRevision: row.upload_revision, objectKey: row.object_key, checksum: row.checksum,
              originalFileName: row.original_file_name, mimeType: row.mime_type,
              byteSize: Number(row.byte_size), language: row.language,
              uploadedAt: new Date(row.uploaded_at).toISOString(),
              enactedOn: dateOnly(row.enacted_on), effectiveFrom: dateOnly(row.effective_from),
              effectiveUntil: dateOnly(row.effective_until), originalPageCount: row.original_page_count,
              extractionVersion: row.extraction_version, supportStatus: row.support_status,
            },
            readability: pdf.readability,
          },
        };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "verify_original", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    },
  });

  const classify = createStep({
    id: "classify-verified-source-v1",
    inputSchema: VerifiedSchema,
    outputSchema: SourceIntakeOutputSchema,
    execute: async ({ inputData }) => {
      const { jobs } = services();
      const stageHash = KbJobStore.stageHash(inputData.intake.version.id, inputData.inputHash, "classify_intake", "1");
      try {
        const cached = await jobs.completedStep<z.infer<typeof SourceIntakeOutputSchema>>(
          inputData.jobId, "classify_intake", "1", stageHash);
        if (cached) return cached;
        const outcome = classifySource(inputData.intake);
        return jobs.checkpoint(inputData.jobId, inputData.leaseOwner, "classify_intake", "1", stageHash, outcome,
          async client => {
            await client.query("UPDATE kb_source_versions SET support_status = $2 WHERE id = $1",
              [inputData.intake.version.id, outcome.status]);
            if (outcome.reason === "unverified_authority" || outcome.reason === "pilot_requires_review") {
              await jobs.enqueuePreparation(client, inputData.jobId, inputData.intake.version.id,
                inputData.intake.version.checksum, DOCLING_VERSION, hashRevision(DOCLING_CONFIG),
                resolveStructureProviderConfig());
            }
          });
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "classify_intake", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    },
  });

  return createWorkflow({
    id: "kb-process-ingestion-v1", inputSchema: JobInputSchema, outputSchema: SourceIntakeOutputSchema,
  }).then(verify).then(classify).commit();
}

let production: IngestionServices | undefined;
export const processIngestionWorkflow = createProcessIngestionWorkflow(() => {
  if (!production) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    production = { pool, objects: S3ObjectStore.fromEnvironment(), jobs: new KbJobStore(pool) };
  }
  return production;
});
