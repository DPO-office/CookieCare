import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Pool } from "pg";
import { KB_SCHEMA_VERSION, hashRevision } from "../schemas/common.js";
import { kanonProviderConfiguration } from "../extraction/kanon.js";
import { KbJobStore } from "../storage/job-store.js";
import { type ObjectStore, type StoredObject } from "../storage/object-store.js";
import { inspectOriginalPdf } from "../storage/pdf-metadata.js";
import { KbUploadService } from "../storage/upload-service.js";
import { runMigrations } from "../storage/migrate.js";
import { KbIngestionWorker } from "../worker.js";
import { createProcessIngestionWorkflow } from "../workflows/process-ingestion-workflow.js";

function samplePdf(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

class MemoryObjects implements ObjectStore {
  readonly values = new Map<string, StoredObject>();
  failReads = false;
  async signUpload(key: string) { return { url: `memory://${key}`, headers: { "Content-Type": "application/pdf" } }; }
  async signRead(key: string) { return `memory://${key}`; }
  async read(key: string) {
    if (this.failReads) throw new Error("storage timeout");
    return this.values.get(key) ?? null;
  }
  async putImmutable(key: string, bytes: Uint8Array) {
    if (this.values.has(key)) throw new Error("Object already exists");
    this.values.set(key, { bytes, contentType: "application/pdf" });
  }
  async exists(key: string) { return this.values.has(key); }
  async remove(key: string) { this.values.delete(key); }
  stage(url: string, bytes: Uint8Array) {
    this.values.set(url.replace("memory://", ""), { bytes, contentType: "application/pdf" });
  }
}

async function fixture() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec("CREATE TABLE users (id VARCHAR(255) PRIMARY KEY, role VARCHAR(50), status VARCHAR(50))");
  await db.exec("INSERT INTO users VALUES ('alice','USER','APPROVED'), ('bob','USER','APPROVED')");
  const query = async (sql: string, params?: unknown[]) => {
    if (sql.startsWith("-- Versioned KB schema") || sql.startsWith("CREATE TABLE kb_upload_intents") || sql.startsWith("-- Legal identity") || sql.startsWith("-- One durable queue")) {
      await db.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows };
  };
  const client = { query, release() {} };
  await runMigrations(client);
  const pool = { connect: async () => client, query } as unknown as Pool;
  const objects = new MemoryObjects();
  const uploads = new KbUploadService(pool, objects);
  const jobs = new KbJobStore(pool);
  const workflow = createProcessIngestionWorkflow(() => ({ pool, objects, jobs }));
  const worker = new KbIngestionWorker(jobs, workflow, 1);
  const bytes = samplePdf();
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const input = {
    sourceId: "phase2-source",
    source: {
      schemaVersion: KB_SCHEMA_VERSION, id: "phase2-source", instrumentId: "eu-2016-679",
      title: "GDPR", issuer: "European Union", jurisdiction: "EU",
      access: { visibility: "private" as const, ownerUserId: "alice" }, authorityStatus: "verified" as const,
    },
    originalFileName: "gdpr.pdf", byteSize: bytes.length, checksum, language: "en",
    enactedOn: null, effectiveFrom: null, effectiveUntil: null,
  };
  return { db, objects, uploads, jobs, worker, bytes, input, checksum };
}

test("signed upload is verified before an atomic version and job commit", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await inspectOriginalPdf(f.bytes), { pageCount: 1, readability: "readable" });
    const intent = await f.uploads.prepare("alice", f.input);
    assert.equal((await f.db.query<{ authority_status: string }>(
      "SELECT authority_status FROM kb_sources WHERE id = $1", [f.input.sourceId])).rows[0]?.authority_status, "unverified");
    f.objects.stage(intent.url, f.bytes);
    await assert.rejects(f.uploads.complete("bob", intent.intentId));
    const result = await f.uploads.complete("alice", intent.intentId);
    assert.equal(result.originalPageCount, 1);
    assert.deepEqual(await f.uploads.complete("alice", intent.intentId), result);
    assert.equal(Number((await f.db.query<{ count: string }>("SELECT count(*) FROM kb_source_versions")).rows[0]?.count), 1);
    assert.equal(Number((await f.db.query<{ count: string }>("SELECT count(*) FROM kb_ingestion_jobs")).rows[0]?.count), 1);
    assert.ok((await f.uploads.signedReadUrl("alice", f.input.sourceId, result.sourceVersionId)).startsWith("memory://"));
    await assert.rejects(f.uploads.signedReadUrl("bob", f.input.sourceId, result.sourceVersionId));
    const finalKey = `kb/sources/${f.input.sourceId}/versions/${result.sourceVersionId}/original.pdf`;
    f.objects.values.delete(finalKey);
    assert.deepEqual(await f.uploads.reconcile(), { cleaned: 0, missing: 1 });
    assert.equal((await f.jobs.getAuthorized("alice", result.jobId)).status, "failed");
  } finally { await f.db.close(); }
});

test("missing or changed uploads never create a version, and expired intents are cleaned", async () => {
  const f = await fixture();
  try {
    const intent = await f.uploads.prepare("alice", f.input);
    await assert.rejects(f.uploads.complete("alice", intent.intentId), /missing/);
    f.objects.stage(intent.url, Buffer.from("%PDF-altered"));
    await assert.rejects(f.uploads.complete("alice", intent.intentId), /checksum|metadata/);
    assert.equal(Number((await f.db.query<{ count: string }>("SELECT count(*) FROM kb_source_versions")).rows[0]?.count), 0);
    await f.db.query("UPDATE kb_upload_intents SET finalizing_until = now() - interval '1 second' WHERE id = $1", [intent.intentId]);
    assert.deepEqual(await f.uploads.reconcile(), { cleaned: 1, missing: 0 });
    assert.equal(f.objects.values.size, 0);
  } finally { await f.db.close(); }
});

test("expired lease resumes in the Mastra workflow without duplicate checkpoints", async () => {
  const f = await fixture();
  try {
    const intent = await f.uploads.prepare("alice", f.input);
    f.objects.stage(intent.url, f.bytes);
    const upload = await f.uploads.complete("alice", intent.intentId);
    const claimed = await f.jobs.claimNext("crashed-worker", 10);
    assert.ok(claimed);
    const verifyHash = KbJobStore.stageHash(upload.sourceVersionId, claimed.input_hash, "verify_original", "1");
    await f.jobs.checkpoint(upload.jobId, "crashed-worker", "verify_original", "1", verifyHash,
      { pageCount: 1, readability: "readable" });
    await f.db.query("UPDATE kb_ingestion_jobs SET lease_until = now() - interval '1 second' WHERE id = $1", [upload.jobId]);
    assert.equal(await f.worker.runOnce(), true);
    assert.equal((await f.jobs.getAuthorized("alice", upload.jobId)).status, "completed");
    const prepare = await f.db.query<{ id: string; status: string;
      input_descriptor: { structureProvider?: { configurationHash?: string } } }>(
      "SELECT id, status, input_descriptor FROM kb_ingestion_jobs WHERE source_version_id = $1 AND job_type = 'prepare_source'",
      [upload.sourceVersionId]);
    assert.equal(prepare.rows.length, 1);
    assert.equal(prepare.rows[0]?.status, "queued");
    assert.equal(prepare.rows[0]?.input_descriptor.structureProvider?.configurationHash,
      kanonProviderConfiguration().configurationHash);
    assert.equal(Number((await f.db.query<{ count: string }>(
      "SELECT count(*) FROM kb_job_dependencies WHERE job_id = $1 AND required_job_id = $2",
      [prepare.rows[0]?.id, upload.jobId])).rows[0]?.count), 1);
    assert.deepEqual((await f.db.query<{ stage: string }>("SELECT stage FROM kb_job_steps ORDER BY stage")).rows.map(row => row.stage),
      ["classify_intake", "verify_original"]);
    assert.equal((await f.db.query<{ attempts: number }>(
      "SELECT attempts FROM kb_job_steps WHERE job_id = $1 AND stage = 'verify_original'", [upload.jobId])).rows[0]?.attempts, 1);
    assert.equal(await f.worker.runOnce(), false);
    await f.jobs.cancel("alice", upload.jobId);
    assert.equal((await f.jobs.getAuthorized("alice", upload.jobId)).status, "completed");
  } finally { await f.db.close(); }
});

test("storage timeout leaves a failed stage; retry completes without duplicate results", async () => {
  const f = await fixture();
  try {
    const intent = await f.uploads.prepare("alice", f.input);
    f.objects.stage(intent.url, f.bytes);
    const upload = await f.uploads.complete("alice", intent.intentId);
    f.objects.failReads = true;
    assert.equal(await f.worker.runOnce(), true);
    assert.equal((await f.jobs.getAuthorized("alice", upload.jobId)).status, "queued");
    assert.equal((await f.db.query<{ status: string }>("SELECT status FROM kb_job_steps WHERE job_id = $1", [upload.jobId])).rows[0]?.status, "failed");
    f.objects.failReads = false;
    await f.db.query("UPDATE kb_ingestion_jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [upload.jobId]);
    assert.equal(await f.worker.runOnce(), true);
    assert.equal((await f.jobs.getAuthorized("alice", upload.jobId)).status, "completed");
    const step = await f.db.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM kb_job_steps WHERE job_id = $1 AND stage = 'verify_original'", [upload.jobId]);
    assert.deepEqual(step.rows[0], { status: "completed", attempts: 2 });
  } finally { await f.db.close(); }
});

test("cancellation prevents a queued job from being claimed", async () => {
  const f = await fixture();
  try {
    const intent = await f.uploads.prepare("alice", f.input);
    f.objects.stage(intent.url, f.bytes);
    const upload = await f.uploads.complete("alice", intent.intentId);
    await f.jobs.cancel("alice", upload.jobId);
    assert.equal(await f.worker.runOnce(), false);
    assert.equal((await f.jobs.getAuthorized("alice", upload.jobId)).status, "cancelled");
  } finally { await f.db.close(); }
});
