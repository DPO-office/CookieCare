import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { IdSchema, LegalDateSchema, Sha256Schema } from "../schemas/common.js";
import { SourceSchema, type Source, type SourceVersion } from "../schemas/source.js";
import { MAX_PDF_BYTES, type ObjectStore } from "./object-store.js";
import { inspectOriginalPdf } from "./pdf-metadata.js";
import { approvedUser, KbAccessDeniedError, KbSourceStore, requireSourcePermission, type SourceRow } from "./source-store.js";

const PrepareUploadSchema = z.strictObject({
  sourceId: IdSchema,
  source: SourceSchema.optional(),
  originalFileName: z.string().min(1).max(255).refine(name => !/[\\/]/.test(name)),
  byteSize: z.number().int().positive().max(MAX_PDF_BYTES),
  checksum: Sha256Schema,
  language: IdSchema.nullable(),
  enactedOn: LegalDateSchema,
  effectiveFrom: LegalDateSchema,
  effectiveUntil: LegalDateSchema,
}).refine(value => !value.source || value.source.id === value.sourceId, "Source ID mismatch");

export type PrepareUpload = z.infer<typeof PrepareUploadSchema>;

type IntentRow = {
  id: string; source_id: string; source_version_id: string; upload_revision: number;
  staging_key: string; object_key: string; checksum: string; original_file_name: string;
  mime_type: string; byte_size: string | number; language: string | null;
  enacted_on: string | null; effective_from: string | null; effective_until: string | null;
  status: "pending" | "finalizing" | "committed" | "abandoned";
  expires_at: Date; finalizing_until: Date | null; finalize_token: string | null;
  cleaned_at: Date | null;
};

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function authorizedIntent(client: PoolClient, actorId: string, intentId: string): Promise<IntentRow> {
  const user = await approvedUser(client, actorId);
  const result = await client.query<IntentRow & SourceRow>(`
    SELECT i.*, s.visibility, s.owner_user_id, s.workspace_id, s.curator_user_id
    FROM kb_upload_intents i JOIN kb_sources s ON s.id = i.source_id
    WHERE i.id = $1 FOR UPDATE OF i`, [intentId]);
  const intent = result.rows[0];
  if (!intent) throw new KbAccessDeniedError();
  await requireSourcePermission(client, actorId, intent, "upload", user);
  return intent;
}

/** Upload intent -> verified private object -> source version and queue row in one DB commit. */
export class KbUploadService {
  private readonly sourceStore: KbSourceStore;

  constructor(private readonly pool: Pool, private readonly objects: ObjectStore) {
    this.sourceStore = new KbSourceStore(pool);
  }

  async prepare(actorId: string, raw: PrepareUpload): Promise<{
    intentId: string; sourceVersionId: string; uploadRevision: number;
    url: string; headers: Record<string, string>; expiresAt: string;
  }> {
    const input = PrepareUploadSchema.parse(raw);
    if (input.source) {
      // Upload metadata is not legal authority verification.
      const source: Source = { ...input.source, authorityStatus: "unverified" };
      await this.sourceStore.createSource(actorId, source);
    }
    const intentId = randomUUID();
    const versionId = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const stagingKey = `kb/staging/${intentId}/original.pdf`;
    const objectKey = `kb/sources/${input.sourceId}/versions/${versionId}/original.pdf`;
    const revision = await inTransaction(this.pool, async client => {
      const user = await approvedUser(client, actorId);
      const sourceResult = await client.query<SourceRow>("SELECT * FROM kb_sources WHERE id = $1 FOR UPDATE", [input.sourceId]);
      const source = sourceResult.rows[0];
      if (!source) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, source, "upload", user);
      const next = await client.query<{ revision: number }>(`
        SELECT GREATEST(
          COALESCE((SELECT MAX(upload_revision) FROM kb_source_versions WHERE source_id = $1), 0),
          COALESCE((SELECT MAX(upload_revision) FROM kb_upload_intents WHERE source_id = $1), 0)
        ) + 1 AS revision`, [input.sourceId]);
      const uploadRevision = Number(next.rows[0]?.revision);
      await client.query(`INSERT INTO kb_upload_intents
        (id, source_id, source_version_id, upload_revision, staging_key, object_key, checksum,
         original_file_name, mime_type, byte_size, language, enacted_on, effective_from,
         effective_until, created_by, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'application/pdf',$9,$10,$11,$12,$13,$14,$15)`, [
        intentId, input.sourceId, versionId, uploadRevision, stagingKey, objectKey,
        input.checksum, input.originalFileName, input.byteSize, input.language,
        input.enactedOn, input.effectiveFrom, input.effectiveUntil, actorId, expiresAt,
      ]);
      return uploadRevision;
    });
    const signed = await this.objects.signUpload(stagingKey, input.checksum);
    return { intentId, sourceVersionId: versionId, uploadRevision: revision,
      url: signed.url, headers: signed.headers, expiresAt: expiresAt.toISOString() };
  }

  async complete(actorId: string, intentId: string): Promise<{
    jobId: string; sourceVersionId: string; originalPageCount: number | null;
    supportStatus: SourceVersion["supportStatus"];
  }> {
    const token = randomUUID();
    const intent = await inTransaction(this.pool, async client => {
      const row = await authorizedIntent(client, actorId, intentId);
      if (row.status === "committed") return row;
      if (row.status === "abandoned" || (row.status === "pending" && row.expires_at <= new Date())) {
        throw new Error("Upload intent has expired");
      }
      await client.query(`UPDATE kb_upload_intents SET status = 'finalizing', finalize_token = $2,
        finalizing_until = now() + interval '10 minutes' WHERE id = $1`, [intentId, token]);
      return { ...row, status: "finalizing" as const, finalize_token: token };
    });
    if (intent.status === "committed") return this.committedResult(intent.source_version_id);

    const staged = await this.objects.read(intent.staging_key);
    if (!staged) throw new Error("Uploaded object is missing");
    if (staged.contentType !== "application/pdf" || staged.bytes.length !== Number(intent.byte_size) ||
        createHash("sha256").update(staged.bytes).digest("hex") !== intent.checksum) {
      throw new Error("Uploaded PDF metadata or checksum does not match the request");
    }
    const pdf = await inspectOriginalPdf(staged.bytes);
    const existing = await this.objects.read(intent.object_key);
    if (existing) {
      if (existing.bytes.length !== staged.bytes.length ||
          createHash("sha256").update(existing.bytes).digest("hex") !== intent.checksum) {
        throw new Error("Permanent object key already has different bytes");
      }
    } else {
      await this.objects.putImmutable(intent.object_key, staged.bytes, intent.checksum);
    }

    const jobId = randomUUID();
    const result = await inTransaction(this.pool, async client => {
      const current = await authorizedIntent(client, actorId, intentId);
      if (current.status !== "finalizing" || current.finalize_token !== token) {
        throw new Error("Upload finalization was superseded");
      }
      const supportStatus: "unreadable" | "pending" = pdf.readability === "unreadable" ? "unreadable" : "pending";
      await client.query(`INSERT INTO kb_source_versions
        (id, source_id, upload_revision, object_key, checksum, original_file_name, mime_type,
         byte_size, language, uploaded_at, enacted_on, effective_from, effective_until,
         original_page_count, extraction_version, support_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11,$12,$13,NULL,$14)`, [
        current.source_version_id, current.source_id, current.upload_revision, current.object_key,
        current.checksum, current.original_file_name, current.mime_type, current.byte_size,
        current.language, current.enacted_on, current.effective_from, current.effective_until,
        pdf.pageCount, supportStatus,
      ]);
      const inputHash = createHash("sha256")
        .update(`${current.source_version_id}:${current.checksum}:ingestion-v1`).digest("hex");
      await client.query(`INSERT INTO kb_ingestion_jobs
        (id, job_type, source_version_id, status, input_hash, dedupe_key)
        VALUES ($1,'intake',$2,'queued',$3,$4)`, [
        jobId, current.source_version_id, inputHash,
        `intake:${current.source_version_id}:${inputHash}`,
      ]);
      await client.query("INSERT INTO kb_job_sources (job_id, source_version_id) VALUES ($1,$2)",
        [jobId, current.source_version_id]);
      await client.query(`UPDATE kb_upload_intents SET status = 'committed', committed_at = now(),
        finalize_token = NULL, finalizing_until = NULL WHERE id = $1`, [intentId]);
      return { jobId, sourceVersionId: current.source_version_id,
        originalPageCount: pdf.pageCount, supportStatus };
    });
    await this.cleanCommittedIntent(intentId, intent.staging_key);
    return result;
  }

  private async committedResult(versionId: string) {
    const result = await this.pool.query<{ id: string; original_page_count: number | null; support_status: SourceVersion["supportStatus"] }>(`
      SELECT j.id, v.original_page_count, v.support_status
      FROM kb_source_versions v JOIN kb_ingestion_jobs j ON j.source_version_id = v.id
      WHERE v.id = $1 AND j.job_type = 'intake'`, [versionId]);
    const row = result.rows[0];
    if (!row) throw new Error("Committed upload has no ingestion job");
    return { jobId: row.id, sourceVersionId: versionId,
      originalPageCount: row.original_page_count, supportStatus: row.support_status };
  }

  async signedReadUrl(actorId: string, sourceId: string, versionId: string): Promise<string> {
    const key = await inTransaction(this.pool, async client => {
      const user = await approvedUser(client, actorId);
      const result = await client.query<SourceRow & { object_key: string }>(`
        SELECT s.*, v.object_key FROM kb_sources s JOIN kb_source_versions v ON v.source_id = s.id
        WHERE s.id = $1 AND v.id = $2`, [sourceId, versionId]);
      const row = result.rows[0];
      if (!row) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, row, "read", user);
      return row.object_key;
    });
    if (!await this.objects.exists(key)) throw new Error("Original PDF is missing from object storage");
    return this.objects.signRead(key);
  }

  private async cleanCommittedIntent(id: string, stagingKey: string): Promise<void> {
    try {
      await this.objects.remove(stagingKey);
      await this.pool.query("UPDATE kb_upload_intents SET cleaned_at = now() WHERE id = $1 AND status = 'committed'", [id]);
    } catch {
      // The reconciler retries cleanup; the committed source and job remain valid.
    }
  }

  async reconcile(limit = 50): Promise<{ cleaned: number; missing: number }> {
    const rows = await this.pool.query<IntentRow>(`
      SELECT * FROM kb_upload_intents
      WHERE cleaned_at IS NULL AND
        (status IN ('committed', 'abandoned') OR
         (status = 'pending' AND expires_at < now()) OR
         (status = 'finalizing' AND finalizing_until < now()))
      ORDER BY created_at LIMIT $1`, [limit]);
    let cleaned = 0;
    for (const row of rows.rows) {
      const abandoned = await inTransaction(this.pool, async client => {
        const current = await client.query<IntentRow>("SELECT * FROM kb_upload_intents WHERE id = $1 FOR UPDATE", [row.id]);
        const intent = current.rows[0];
        if (!intent || intent.cleaned_at ||
            (intent.status === "pending" && intent.expires_at > new Date()) ||
            (intent.status === "finalizing" && intent.finalizing_until && intent.finalizing_until > new Date())) return null;
        if (intent.status !== "committed") {
          await client.query("UPDATE kb_upload_intents SET status = 'abandoned' WHERE id = $1", [row.id]);
        }
        return intent.status !== "committed";
      });
      if (abandoned === null) continue;
      await this.objects.remove(row.staging_key);
      if (abandoned) {
        const referenced = await this.pool.query("SELECT 1 FROM kb_source_versions WHERE id = $1", [row.source_version_id]);
        if (!referenced.rowCount) await this.objects.remove(row.object_key);
      }
      await this.pool.query("UPDATE kb_upload_intents SET cleaned_at = now() WHERE id = $1", [row.id]);
      cleaned++;
    }
    const versions = await this.pool.query<{ id: string; object_key: string }>(`
      SELECT v.id, v.object_key FROM kb_source_versions v
      JOIN kb_ingestion_jobs j ON j.source_version_id = v.id
      WHERE j.job_type = 'intake' AND j.status IN ('queued', 'running')
      ORDER BY v.uploaded_at LIMIT $1`, [limit]);
    let missing = 0;
    for (const version of versions.rows) {
      if (await this.objects.exists(version.object_key)) continue;
      await this.pool.query(`UPDATE kb_ingestion_jobs SET status = 'failed', lease_owner = NULL,
        lease_until = NULL, error_code = 'OBJECT_MISSING', error_message = 'Original PDF is missing'
        WHERE source_version_id = $1 AND job_type = 'intake'
          AND status IN ('queued', 'running')`, [version.id]);
      missing++;
    }
    return { cleaned, missing };
  }
}
