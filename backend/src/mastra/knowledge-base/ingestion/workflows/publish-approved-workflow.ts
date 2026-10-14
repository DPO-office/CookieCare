import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { Pool } from "pg";
import { z } from "zod";
import { hashRevision } from "../schemas/common.js";
import { PublicationManifestSchema, type PublicationManifest, type SearchEntry } from "../schemas/publication.js";
import { publicationPreflight, type ApprovedRecordState, type SourceReadiness,
  type IndexReadiness } from "../publication/preflight.js";
import { buildSearchTextDrafts, embedSearchDrafts, type EmbeddingBatchProvider,
  type SearchRecord } from "../publication/search-entries.js";
import { KbArtifactStore, type ArtifactReference } from "../storage/artifact-store.js";
import { KbJobStore } from "../storage/job-store.js";

const Input = z.strictObject({ jobId: z.string().min(1), leaseOwner: z.string().min(1) });
const Artifact = z.object({ id: z.string(), jobId: z.string(), stage: z.string(), stageVersion: z.string(),
  inputHash: z.string(), kind: z.string(), objectKey: z.string(), contentHash: z.string(),
  byteSize: z.number(), contentType: z.literal("application/json") });
const Planned = Input.extend({ publicationId: z.string(), indexVersion: z.string(),
  inputHash: z.string(), planArtifact: Artifact });
const Indexed = Planned.extend({ entriesArtifact: Artifact, entryCount: z.number().int().nonnegative() });
const Output = z.strictObject({ publicationId: z.string(), indexVersion: z.string(),
  entryCount: z.number().int().nonnegative(), status: z.literal("active") });

export interface PublicationPlan {
  manifest: PublicationManifest;
  records: SearchRecord[];
}

/** Implementations must read facts from storage and recheck them under the activation lock. */
export interface PublicationGateway {
  loadPlan(publicationId: string): Promise<PublicationPlan>;
  writeIndexes(publicationId: string, entries: SearchEntry[]): Promise<void>;
  loadPreflightFacts(publicationId: string): Promise<{
    manifest: PublicationManifest; sources: SourceReadiness[];
    records: ApprovedRecordState[]; index: IndexReadiness;
  }>;
  /** Must lock the publication and job, verify the live lease and approvals, then activate atomically. */
  activateIfUnchanged(input: { publicationId: string; manifestHash: string;
    approvedScopeHash: string; jobId: string; leaseOwner: string }): Promise<void>;
}

export interface PublishServices {
  pool: Pool;
  jobs: KbJobStore;
  artifacts: KbArtifactStore;
  embedding: EmbeddingBatchProvider;
  gateway: PublicationGateway;
}

/** Fixed order: freeze approved input, index it, verify current facts, then activate. */
export function createPublishApprovedWorkflow(resolve: () => PublishServices) {
  const plan = createStep({ id: "freeze-approved-publication-v1", inputSchema: Input,
    outputSchema: Planned, execute: async ({ inputData }) => {
      const { pool, jobs, artifacts, gateway } = resolve();
      const found = await pool.query<{ publication_id: string; input_hash: string }>(`
        SELECT publication_id, input_hash FROM kb_ingestion_jobs
        WHERE id = $1 AND job_type = 'publish_approved' AND status = 'running'
          AND lease_owner = $2 AND lease_until > now() AND cancel_requested_at IS NULL`,
      [inputData.jobId, inputData.leaseOwner]);
      const job = found.rows[0];
      if (!job?.publication_id) throw new Error("Publication job lease is invalid");
      const stageHash = KbJobStore.stageHash(job.publication_id, job.input_hash, "publication_plan", "1");
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
          "publication_plan", "1", stageHash);
        let planArtifact: ArtifactReference;
        if (cached) { await artifacts.readVerified(cached); planArtifact = cached; }
        else {
          const value = await gateway.loadPlan(job.publication_id);
          const manifest = PublicationManifestSchema.parse(value.manifest);
          const { manifestHash, ...payload } = manifest;
          if (manifest.id !== job.publication_id || manifest.state !== "building" ||
              manifestHash !== hashRevision(payload) ||
              manifest.approvedRecords.length === 0 || !value.records.length) {
            throw new Error("Publication plan is incomplete or not building");
          }
          const approved = new Set(manifest.approvedRecords.map(entry =>
            `${entry.kind}:${entry.record.id}:${entry.record.revision}`));
          for (const record of value.records) {
            if (!approved.has(`${record.kind}:${record.id}:${record.revision}`) ||
                !manifest.sourceVersionIds.includes(record.sourceVersionId)) {
              throw new Error("Search record is outside approved publication scope");
            }
          }
          planArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "publication_plan", "1", stageHash, "publication_plan", value);
        }
        const frozen = await artifacts.readVerified(planArtifact) as PublicationPlan;
        return { ...inputData, publicationId: job.publication_id, indexVersion: frozen.manifest.indexVersion,
          inputHash: job.input_hash, planArtifact };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "publication_plan", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });
  const index = createStep({ id: "index-approved-search-text-v1", inputSchema: Planned,
    outputSchema: Indexed, execute: async ({ inputData }) => {
      const { jobs, artifacts, embedding, gateway } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.publicationId, inputData.inputHash,
        "publication_entries", "1");
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
          "publication_entries", "1", stageHash);
        let entriesArtifact: ArtifactReference;
        if (cached) { await artifacts.readVerified(cached); entriesArtifact = cached; }
        else {
          const frozen = await artifacts.readVerified(inputData.planArtifact) as PublicationPlan;
          const drafts = buildSearchTextDrafts(inputData.indexVersion, frozen.records);
          const entries = await embedSearchDrafts(drafts, embedding);
          if (entries.length !== drafts.length) throw new Error("Embedding coverage is incomplete");
          entriesArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "publication_entries", "1", stageHash, "search_entries", entries);
        }
        const entries = await artifacts.readVerified(entriesArtifact) as SearchEntry[];
        await gateway.writeIndexes(inputData.publicationId, entries);
        return { ...inputData, entriesArtifact, entryCount: entries.length };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "publication_entries", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });
  const activate = createStep({ id: "verify-and-activate-publication-v1", inputSchema: Indexed,
    outputSchema: Output, execute: async ({ inputData }) => {
      const { jobs, artifacts, gateway } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.publicationId, inputData.inputHash,
        "publication_activation", "1");
      try {
        const facts = await gateway.loadPreflightFacts(inputData.publicationId);
        const check = publicationPreflight(facts.manifest, facts.sources, facts.records, facts.index);
        if (!check.ready || check.manifest.indexVersion !== inputData.indexVersion) {
          throw new Error(`Publication preflight failed: ${check.issues.map(issue => issue.code).join(", ")}`);
        }
        const frozen = await artifacts.readVerified(inputData.planArtifact) as PublicationPlan;
        const scope = (manifest: PublicationManifest) => ({ sourceVersionIds: manifest.sourceVersionIds,
          reviewedScope: manifest.reviewedScope, approvedRecords: manifest.approvedRecords,
          indexVersion: manifest.indexVersion });
        const approvedScopeHash = hashRevision(scope(frozen.manifest));
        if (approvedScopeHash !== hashRevision(scope(check.manifest))) {
          throw new Error("Approved publication scope changed during indexing");
        }
        await gateway.activateIfUnchanged({ publicationId: inputData.publicationId,
          manifestHash: check.manifest.manifestHash, approvedScopeHash,
          jobId: inputData.jobId, leaseOwner: inputData.leaseOwner });
        await jobs.checkpoint(inputData.jobId, inputData.leaseOwner,
          "publication_activation", "1", stageHash,
          { publicationId: inputData.publicationId, manifestHash: check.manifest.manifestHash });
        return { publicationId: inputData.publicationId, indexVersion: inputData.indexVersion,
          entryCount: inputData.entryCount, status: "active" as const };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "publication_activation", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });
  return createWorkflow({ id: "kb-publish-approved-v1", inputSchema: Input, outputSchema: Output })
    .then(plan).then(index).then(activate).commit();
}
