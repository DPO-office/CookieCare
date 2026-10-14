import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Pool } from "pg";
import { KbArtifactStore, type ArtifactObjectStore } from "../storage/artifact-store.js";
import { KbJobStore, LostJobLeaseError } from "../storage/job-store.js";
import { runMigrations } from "../storage/migrate.js";

class MemoryArtifacts implements ArtifactObjectStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  writes = 0;
  async read(key: string) { return this.objects.get(key) ?? null; }
  async putImmutable(key: string, bytes: Uint8Array) {
    if (this.objects.has(key)) throw new Error("Object already exists");
    this.writes++;
    this.objects.set(key, { bytes, contentType: "application/json" });
  }
}

async function fixture() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, status TEXT)");
  await db.exec("INSERT INTO users VALUES ('alice', 'USER', 'APPROVED'), ('bob', 'USER', 'APPROVED')");
  const query = async (sql: string, params?: unknown[]) => {
    if (sql.startsWith("-- Versioned KB schema") || sql.startsWith("CREATE TABLE kb_upload_intents") ||
        sql.startsWith("-- Legal identity") || sql.startsWith("-- One durable queue")) {
      await db.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows };
  };
  const client = { query, release() {} };
  await runMigrations(client);
  await db.exec(`
    INSERT INTO kb_sources (id, instrument_id, title, visibility, owner_user_id, authority_status)
      VALUES ('rules-source', 'rules', 'Rules', 'private', 'alice', 'verified'),
             ('act-source', 'act', 'Act', 'private', 'alice', 'verified');
    INSERT INTO kb_source_versions
      (id, source_id, upload_revision, object_key, checksum, original_file_name,
       mime_type, byte_size, uploaded_at, support_status)
      VALUES ('rules-v1', 'rules-source', 1, 'rules.pdf', repeat('a', 64),
              'rules.pdf', 'application/pdf', 100, now(), 'pending'),
             ('act-v1', 'act-source', 1, 'act.pdf', repeat('b', 64),
              'act.pdf', 'application/pdf', 100, now(), 'pending');
    INSERT INTO kb_publications
      (id, manifest_hash, manifest, index_version, lexical_status, dense_status, state, created_by, created_at)
      VALUES ('pilot-publication', repeat('c', 64), '{}', 'pilot-index',
              'pending', 'pending', 'building', 'alice', now());
  `);
  const pool = { connect: async () => client, query } as unknown as Pool;
  const jobs = new KbJobStore(pool);
  const objects = new MemoryArtifacts();
  return { db, jobs, objects, artifacts: new KbArtifactStore(pool, objects, jobs) };
}

test("typed jobs deduplicate, wait for dependencies and authorize every source", async () => {
  const { db, jobs } = await fixture();
  try {
    const prepare = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: ["rules-v1"],
      inputDescriptor: { parser: "docling-v1" } });
    assert.equal(prepare.job_type, "prepare_source");
    assert.equal((await jobs.enqueue({ type: "prepare_source", sourceVersionIds: ["rules-v1"],
      inputDescriptor: { parser: "docling-v1" } })).id, prepare.id);
    const draft = await jobs.enqueue({ type: "build_rule_drafts", sourceVersionIds: ["rules-v1", "act-v1"],
      inputDescriptor: { prompt: "rule-draft-v1" }, dependsOnJobIds: [prepare.id] });
    assert.equal((await jobs.enqueue({ type: "build_rule_drafts", sourceVersionIds: ["act-v1", "rules-v1"],
      inputDescriptor: { prompt: "rule-draft-v1" }, dependsOnJobIds: [prepare.id] })).id, draft.id);
    const publish = await jobs.enqueue({ type: "publish_approved", publicationId: "pilot-publication",
      sourceVersionIds: ["rules-v1", "act-v1"], inputDescriptor: { reviewSetHash: "review-v1" },
      dependsOnJobIds: [draft.id] });
    assert.equal(publish.source_version_id, null);
    assert.equal(Number((await db.query<{ count: string }>(
      "SELECT count(*) FROM kb_job_sources WHERE job_id = $1", [publish.id])).rows[0]?.count), 2);
    assert.equal(await jobs.claimNext("intake-only", 10), null);
    assert.equal(await jobs.claimNext("draft-worker", 10, ["build_rule_drafts"]), null);
    assert.equal(await jobs.claimNext("publish-worker", 10, ["publish_approved"]), null);

    const first = await jobs.claimNext("prepare-worker", 10, ["prepare_source"]);
    assert.equal(first?.id, prepare.id);
    await jobs.park(prepare.id, "prepare-worker", "awaiting_source_correction");
    assert.equal((await jobs.getAuthorized("alice", prepare.id)).status, "waiting");
    assert.equal((await jobs.getAuthorized("alice", prepare.id)).attempts, 0);
    assert.equal(await jobs.claimNext("another-worker", 10, ["prepare_source"]), null);
    assert.equal(await jobs.resume(prepare.id), true);
    const resumed = await jobs.claimNext("prepare-worker-2", 10, ["prepare_source"]);
    assert.equal(resumed?.id, prepare.id);
    await jobs.complete(prepare.id, "prepare-worker-2", { sourceReady: true });
    assert.deepEqual((await jobs.getAuthorized("alice", prepare.id)).result, { sourceReady: true });
    assert.equal((await jobs.claimNext("draft-worker", 10, ["build_rule_drafts"]))?.id, draft.id);
    await jobs.complete(draft.id, "draft-worker", { reviewRequired: true });
    assert.equal((await jobs.claimNext("publish-worker", 10, ["publish_approved"]))?.id, publish.id);
    await assert.rejects(jobs.getAuthorized("bob", publish.id));
    await db.query("UPDATE kb_sources SET owner_user_id = 'bob' WHERE id = 'act-source'");
    await assert.rejects(jobs.getAuthorized("alice", publish.id));
    await assert.rejects(jobs.cancel("alice", publish.id));
    await db.query("UPDATE kb_sources SET owner_user_id = 'alice' WHERE id = 'act-source'");
    await jobs.cancel("alice", publish.id);
    assert.equal((await jobs.getAuthorized("alice", publish.id)).status, "cancelled");
  } finally { await db.close(); }
});

test("a cancelled dependency fails its queued child job", async () => {
  const { db, jobs } = await fixture();
  try {
    const parent = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: ["rules-v1"],
      inputDescriptor: { parser: "docling-v1" } });
    const child = await jobs.enqueue({ type: "build_rule_drafts", sourceVersionIds: ["rules-v1"],
      inputDescriptor: { prompt: "draft-v1" }, dependsOnJobIds: [parent.id] });
    await jobs.cancel("alice", parent.id);
    assert.equal(await jobs.claimNext("worker", 10, ["build_rule_drafts"]), null);
    const blocked = await jobs.getAuthorized("alice", child.id);
    assert.equal(blocked.status, "failed");
    assert.equal(blocked.error_code, "DEPENDENCY_FAILED");
  } finally { await db.close(); }
});

test("artifact checkpoints verify hashes and reuse an orphan after lease loss", async () => {
  const { db, jobs, objects, artifacts } = await fixture();
  try {
    const job = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: ["rules-v1"],
      inputDescriptor: { parser: "docling-v1" } });
    assert.equal((await jobs.claimNext("worker-1", 10, ["prepare_source"]))?.id, job.id);
    const inputHash = KbJobStore.stageHash("rules-v1", job.input_hash, "extract_source", "1");
    const document = { pages: [{ physicalPage: 1, text: "Rule 8" }] };
    const reference = await artifacts.writeCheckpointedJson(job.id, "worker-1",
      "extract_source", "1", inputHash, "raw_docling", document);
    assert.deepEqual(await artifacts.readVerified(reference), document);
    assert.deepEqual(await artifacts.writeCheckpointedJson(job.id, "worker-1",
      "extract_source", "1", inputHash, "raw_docling", { changed: true }), reference);
    assert.equal(objects.writes, 1);
    await assert.rejects(artifacts.readVerified({ ...reference, contentHash: "0".repeat(64) }));
    objects.objects.set(reference.objectKey, { bytes: Buffer.from("{}"), contentType: "application/json" });
    await assert.rejects(artifacts.readVerified(reference), /checksum/);
    objects.objects.set(reference.objectKey, { bytes: Buffer.from(JSON.stringify(document)), contentType: "application/json" });

    const nextHash = KbJobStore.stageHash("rules-v1", job.input_hash, "map_source", "1");
    await db.query("UPDATE kb_ingestion_jobs SET lease_until = now() - interval '1 second' WHERE id = $1", [job.id]);
    await assert.rejects(artifacts.writeCheckpointedJson(job.id, "worker-1",
      "map_source", "1", nextHash, "source_map", { offsets: [0, 6] }), LostJobLeaseError);
    assert.equal(Number((await db.query<{ count: string }>(
      "SELECT count(*) FROM kb_job_artifacts WHERE kind = 'source_map'")).rows[0]?.count), 0);
    assert.equal((await jobs.claimNext("worker-2", 10, ["prepare_source"]))?.id, job.id);
    const recovered = await artifacts.writeCheckpointedJson(job.id, "worker-2",
      "map_source", "1", nextHash, "source_map", { offsets: [0, 6] });
    assert.deepEqual(await artifacts.readVerified(recovered), { offsets: [0, 6] });
    assert.equal(objects.writes, 2);
    await assert.rejects(db.query("DELETE FROM kb_job_artifacts WHERE id = $1", [recovered.id]));
  } finally { await db.close(); }
});
