import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { hashRevision } from "../schemas/common.js";
import { approvedUser, KbAccessDeniedError, requireSourcePermission, type SourceRow } from "./source-store.js";
import type { StructureProviderConfig } from "../extraction/structure-provider.js";

export interface IngestionJob {
  id: string;
  job_type: JobType;
  source_version_id: string | null;
  publication_id: string | null;
  input_hash: string;
  input_descriptor: Record<string, unknown>;
  result: unknown | null;
  waiting_reason: string | null;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  error_code: string | null;
  error_message: string | null;
  next_attempt_at: Date;
}

export const JOB_TYPES = ["intake", "prepare_source", "build_rule_drafts", "publish_approved"] as const;
export type JobType = typeof JOB_TYPES[number];

export interface EnqueueJob {
  type: Exclude<JobType, "intake">;
  sourceVersionIds: string[];
  publicationId?: string;
  /** Include all source, parser, prompt, model and configuration versions that affect output. */
  inputDescriptor: Record<string, unknown>;
  dependsOnJobIds?: string[];
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class LostJobLeaseError extends Error {
  constructor() { super("Ingestion job lease is no longer valid"); }
}

/** PostgreSQL is the durable source of truth; Mastra workflow runs are replayable. */
export class KbJobStore {
  constructor(private readonly pool: Pool) {}

  /** Internal dispatch only. The caller must authorize the requested source scope. */
  async enqueue(input: EnqueueJob): Promise<IngestionJob> {
    if (!JOB_TYPES.includes(input.type)) throw new Error("Invalid workflow job type");
    const sourceVersionIds = [...new Set(input.sourceVersionIds)].sort();
    if (!sourceVersionIds.length || sourceVersionIds.some(id => !id)) throw new Error("Job needs source versions");
    if ((input.type === "publish_approved") !== Boolean(input.publicationId)) {
      throw new Error("Only publication jobs target a publication");
    }
    const dependencies = [...new Set(input.dependsOnJobIds ?? [])].sort();
    if (dependencies.some(id => !id)) throw new Error("Invalid job dependency");
    const descriptor = JSON.parse(JSON.stringify(input.inputDescriptor)) as Record<string, unknown>;
    if (!descriptor || Array.isArray(descriptor) || typeof descriptor !== "object") {
      throw new Error("Job input descriptor must be an object");
    }
    const inputHash = hashRevision({ type: input.type, sourceVersionIds,
      publicationId: input.publicationId ?? null, descriptor, dependencies });
    const dedupeKey = `${input.type}:${inputHash}`;
    return transaction(this.pool, async client => {
      for (const sourceVersionId of sourceVersionIds) {
        const source = await client.query("SELECT 1 FROM kb_source_versions WHERE id = $1", [sourceVersionId]);
        if (!source.rowCount) throw new Error(`Unknown source version: ${sourceVersionId}`);
      }
      for (const requiredJobId of dependencies) {
        const required = await client.query("SELECT 1 FROM kb_ingestion_jobs WHERE id = $1", [requiredJobId]);
        if (!required.rowCount) throw new Error(`Unknown job dependency: ${requiredJobId}`);
      }
      const id = randomUUID();
      const inserted = await client.query<IngestionJob>(`INSERT INTO kb_ingestion_jobs
        (id, job_type, source_version_id, publication_id, status, input_hash, input_descriptor, dedupe_key)
        VALUES ($1,$2,$3,$4,'queued',$5,$6,$7)
        ON CONFLICT (dedupe_key) DO NOTHING RETURNING *`, [
        id, input.type, input.type === "publish_approved" ? null : sourceVersionIds[0],
        input.publicationId ?? null, inputHash, JSON.stringify(descriptor), dedupeKey,
      ]);
      if (!inserted.rows[0]) {
        const existing = await client.query<IngestionJob>(
          "SELECT * FROM kb_ingestion_jobs WHERE dedupe_key = $1", [dedupeKey]);
        if (!existing.rows[0]) throw new Error("Idempotent job disappeared");
        return existing.rows[0];
      }
      for (const sourceVersionId of sourceVersionIds) {
        await client.query("INSERT INTO kb_job_sources (job_id, source_version_id) VALUES ($1,$2)", [id, sourceVersionId]);
      }
      for (const requiredJobId of dependencies) {
        await client.query("INSERT INTO kb_job_dependencies (job_id, required_job_id) VALUES ($1,$2)", [id, requiredJobId]);
      }
      return inserted.rows[0];
    });
  }

  /** Queue the fixed PDF preparation after classification in the same transaction. */
  async enqueuePreparation(client: PoolClient, intakeJobId: string, sourceVersionId: string,
    checksum: string, parserVersion: string, configurationHash: string,
    structureProvider: StructureProviderConfig): Promise<void> {
    const descriptor = { sourceVersionId, checksum, parser: "docling.rs", parserVersion,
      configurationHash, structureProvider };
    const inputHash = hashRevision({ type: "prepare_source", sourceVersionIds: [sourceVersionId],
      publicationId: null, descriptor, dependencies: [intakeJobId] });
    const inserted = await client.query<{ id: string }>(`INSERT INTO kb_ingestion_jobs
      (id, job_type, source_version_id, status, input_hash, input_descriptor, dedupe_key)
      VALUES ($1,'prepare_source',$2,'queued',$3,$4,$5)
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, [
      randomUUID(), sourceVersionId, inputHash, JSON.stringify(descriptor), `prepare_source:${inputHash}`]);
    if (!inserted.rows[0]) return;
    await client.query("INSERT INTO kb_job_sources (job_id, source_version_id) VALUES ($1,$2)",
      [inserted.rows[0].id, sourceVersionId]);
    await client.query("INSERT INTO kb_job_dependencies (job_id, required_job_id) VALUES ($1,$2)",
      [inserted.rows[0].id, intakeJobId]);
  }

  async claimNext(workerId: string, leaseSeconds = 60, supportedTypes: readonly JobType[] = ["intake"]): Promise<IngestionJob | null> {
    if (!workerId || leaseSeconds < 10 || leaseSeconds > 600) throw new Error("Invalid worker lease");
    if (!supportedTypes.length || supportedTypes.some(type => !JOB_TYPES.includes(type))) throw new Error("Invalid worker job types");
    await this.pool.query(`UPDATE kb_ingestion_jobs SET status = 'failed', lease_owner = NULL,
      lease_until = NULL, error_code = 'ATTEMPTS_EXHAUSTED', error_message = 'Retry limit reached',
      completed_at = now()
      WHERE status = 'running' AND lease_until < now() AND attempts >= max_attempts`);
    await this.pool.query(`UPDATE kb_ingestion_jobs j SET status = 'failed',
      waiting_reason = NULL, error_code = 'DEPENDENCY_FAILED',
      error_message = 'Required job failed or was cancelled', completed_at = now()
      WHERE j.status IN ('queued', 'waiting') AND EXISTS (
        SELECT 1 FROM kb_job_dependencies d JOIN kb_ingestion_jobs required
          ON required.id = d.required_job_id
        WHERE d.job_id = j.id AND required.status IN ('failed', 'cancelled'))`);
    const result = await this.pool.query<IngestionJob>(`
      WITH candidate AS (
        SELECT id FROM kb_ingestion_jobs
        WHERE job_type = ANY($3::text[]) AND attempts < max_attempts AND cancel_requested_at IS NULL AND
          ((status = 'queued' AND next_attempt_at <= now()) OR
           (status = 'running' AND lease_until < now()))
          AND NOT EXISTS (SELECT 1 FROM kb_job_dependencies d
            JOIN kb_ingestion_jobs required ON required.id = d.required_job_id
            WHERE d.job_id = kb_ingestion_jobs.id AND required.status <> 'completed')
        ORDER BY next_attempt_at, created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE kb_ingestion_jobs j SET status = 'running', attempts = attempts + 1,
        lease_owner = $1, lease_until = now() + $2::int * interval '1 second',
        started_at = COALESCE(started_at, now()), error_code = NULL, error_message = NULL
      FROM candidate WHERE j.id = candidate.id RETURNING j.*`, [workerId, leaseSeconds, [...supportedTypes]]);
    return result.rows[0] ?? null;
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds = 60): Promise<boolean> {
    const result = await this.pool.query(`UPDATE kb_ingestion_jobs
      SET lease_until = now() + $3::int * interval '1 second'
      WHERE id = $1 AND status = 'running' AND lease_owner = $2 AND lease_until > now()
        AND cancel_requested_at IS NULL`, [jobId, workerId, leaseSeconds]);
    return Boolean(result.rowCount);
  }

  async requireLease(client: PoolClient, jobId: string, workerId: string): Promise<IngestionJob> {
    const result = await client.query<IngestionJob>(`SELECT * FROM kb_ingestion_jobs
      WHERE id = $1 AND status = 'running' AND lease_owner = $2
        AND lease_until > now() AND cancel_requested_at IS NULL FOR UPDATE`, [jobId, workerId]);
    if (!result.rows[0]) throw new LostJobLeaseError();
    return result.rows[0];
  }

  static stageHash(sourceVersionId: string, inputHash: string, stage: string, stageVersion: string): string {
    return createHash("sha256").update(`${sourceVersionId}:${inputHash}:${stage}:${stageVersion}`).digest("hex");
  }

  async completedStep<T>(jobId: string, stage: string, stageVersion: string, inputHash: string): Promise<T | null> {
    const result = await this.pool.query<{ checkpoint: T }>(`SELECT checkpoint FROM kb_job_steps
      WHERE job_id = $1 AND stage = $2 AND stage_version = $3 AND input_hash = $4
        AND status = 'completed'`, [jobId, stage, stageVersion, inputHash]);
    return result.rows[0]?.checkpoint ?? null;
  }

  async checkpoint<T>(jobId: string, workerId: string, stage: string, stageVersion: string,
    inputHash: string, output: T, effect?: (client: PoolClient) => Promise<void>): Promise<T> {
    return transaction(this.pool, async client => {
      await this.requireLease(client, jobId, workerId);
      const existing = await client.query<{ checkpoint: T }>(`SELECT checkpoint FROM kb_job_steps
        WHERE job_id = $1 AND stage = $2 AND stage_version = $3 AND input_hash = $4
          AND status = 'completed'`, [jobId, stage, stageVersion, inputHash]);
      if (existing.rows[0]) return existing.rows[0].checkpoint;
      if (effect) await effect(client);
      await client.query(`INSERT INTO kb_job_steps
        (job_id, stage, stage_version, input_hash, status, attempts, checkpoint, started_at, completed_at)
        VALUES ($1,$2,$3,$4,'completed',1,$5,now(),now())
        ON CONFLICT (job_id, stage, stage_version, input_hash) DO UPDATE SET
          status = 'completed', attempts = kb_job_steps.attempts + 1,
          checkpoint = EXCLUDED.checkpoint, completed_at = now(),
          error_code = NULL, error_message = NULL`, [jobId, stage, stageVersion, inputHash, JSON.stringify(output)]);
      return output;
    });
  }

  async recordStageFailure(jobId: string, workerId: string, stage: string,
    stageVersion: string, inputHash: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await transaction(this.pool, async client => {
      await this.requireLease(client, jobId, workerId);
      await client.query(`INSERT INTO kb_job_steps
        (job_id, stage, stage_version, input_hash, status, attempts, error_code,
         error_message, started_at, completed_at)
        VALUES ($1,$2,$3,$4,'failed',1,'STAGE_FAILED',left($5,1000),now(),now())
        ON CONFLICT (job_id, stage, stage_version, input_hash) DO UPDATE SET
          status = 'failed', attempts = kb_job_steps.attempts + 1,
          error_code = 'STAGE_FAILED', error_message = EXCLUDED.error_message,
          completed_at = now()
        WHERE kb_job_steps.status <> 'completed'`,
        [jobId, stage, stageVersion, inputHash, message]);
    });
  }

  async complete(jobId: string, workerId: string, result?: unknown): Promise<void> {
    const updated = await this.pool.query(`UPDATE kb_ingestion_jobs SET status = 'completed',
      lease_owner = NULL, lease_until = NULL, completed_at = now(), result = $3
      WHERE id = $1 AND status = 'running' AND lease_owner = $2
        AND lease_until > now() AND cancel_requested_at IS NULL`, [jobId, workerId, result === undefined ? null : JSON.stringify(result)]);
    if (!updated.rowCount) throw new LostJobLeaseError();
  }

  /** Release the worker while a reviewer or another workflow supplies the next input. */
  async park(jobId: string, workerId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error("Waiting reason is required");
    const updated = await this.pool.query(`UPDATE kb_ingestion_jobs SET status = 'waiting',
      waiting_reason = $3, lease_owner = NULL, lease_until = NULL,
      attempts = GREATEST(attempts - 1, 0)
      WHERE id = $1 AND status = 'running' AND lease_owner = $2
        AND lease_until > now() AND cancel_requested_at IS NULL`, [jobId, workerId, reason]);
    if (!updated.rowCount) throw new LostJobLeaseError();
  }

  /** Called only after the external dependency or review state has changed. */
  async resume(jobId: string): Promise<boolean> {
    const updated = await this.pool.query(`UPDATE kb_ingestion_jobs j SET status = 'queued',
      waiting_reason = NULL, next_attempt_at = now()
      WHERE j.id = $1 AND j.status = 'waiting' AND j.cancel_requested_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM kb_job_dependencies d
          JOIN kb_ingestion_jobs required ON required.id = d.required_job_id
          WHERE d.job_id = j.id AND required.status <> 'completed')`, [jobId]);
    return Boolean(updated.rowCount);
  }

  async fail(jobId: string, workerId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.pool.query(`UPDATE kb_ingestion_jobs SET
      status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
      lease_owner = NULL, lease_until = NULL,
      next_attempt_at = now() + LEAST(300, 5 * power(2, attempts - 1)) * interval '1 second',
      error_code = 'PROCESSING_FAILED', error_message = left($3, 1000),
      completed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
      WHERE id = $1 AND status = 'running' AND lease_owner = $2
        AND lease_until > now() AND cancel_requested_at IS NULL`, [jobId, workerId, message]);
  }

  async cancel(actorId: string, jobId: string): Promise<void> {
    await transaction(this.pool, async client => {
      const user = await approvedUser(client, actorId);
      const result = await client.query<IngestionJob>(
        "SELECT * FROM kb_ingestion_jobs WHERE id = $1 FOR UPDATE", [jobId]);
      const job = result.rows[0];
      if (!job) throw new KbAccessDeniedError();
      await this.requireJobScope(client, actorId, job, user,
        job.job_type === "publish_approved" ? "publish" : job.job_type === "build_rule_drafts" ? "review" : "upload");
      if (job.status === "completed" || job.status === "failed") return;
      await client.query(`UPDATE kb_ingestion_jobs SET status = 'cancelled',
        cancel_requested_at = now(), lease_owner = NULL, lease_until = NULL,
        completed_at = now() WHERE id = $1`, [jobId]);
    });
  }

  async getAuthorized(actorId: string, jobId: string): Promise<IngestionJob> {
    return transaction(this.pool, async client => {
      const user = await approvedUser(client, actorId);
      const result = await client.query<IngestionJob>("SELECT * FROM kb_ingestion_jobs WHERE id = $1", [jobId]);
      const job = result.rows[0];
      if (!job) throw new KbAccessDeniedError();
      await this.requireJobScope(client, actorId, job, user, "read");
      return job;
    });
  }

  private async requireJobScope(client: PoolClient, actorId: string, job: IngestionJob,
    user: Awaited<ReturnType<typeof approvedUser>>, action: "read" | "upload" | "review" | "publish"): Promise<void> {
    const sources = await client.query<SourceRow>(`
      SELECT s.* FROM kb_job_sources js
      JOIN kb_source_versions v ON v.id = js.source_version_id
      JOIN kb_sources s ON s.id = v.source_id
      WHERE js.job_id = $1`, [job.id]);
    if (!sources.rows.length) throw new KbAccessDeniedError();
    for (const source of sources.rows) {
      await requireSourcePermission(client, actorId, source, action, user);
    }
  }
}
