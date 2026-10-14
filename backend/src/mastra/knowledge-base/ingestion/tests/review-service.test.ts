import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Pool } from "pg";
import { runMigrations } from "../storage/migrate.js";
import { KbReviewService } from "../storage/review-service.js";
import { KbProvisionCorrectionService } from "../storage/provision-corrections.js";

test("review decisions require source permission and the latest exact revision hash", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, status TEXT)");
    await db.exec("INSERT INTO users VALUES ('alice','USER','APPROVED'),('bob','USER','APPROVED')");
    const query = async (sql: string, params?: unknown[]) => {
      if (["-- Versioned KB schema", "CREATE TABLE kb_upload_intents", "-- Legal identity", "-- One durable queue"]
        .some(prefix => sql.startsWith(prefix))) { await db.exec(sql); return { rows: [], rowCount: 0 }; }
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.rows.length || result.affectedRows };
    };
    const client = { query, release() {} };
    await runMigrations(client);
    await db.exec(`
      INSERT INTO kb_sources (id,instrument_id,title,visibility,owner_user_id,authority_status)
      VALUES ('source','eu-2016-679','GDPR','private','alice','verified');
      INSERT INTO kb_source_versions
        (id,source_id,upload_revision,object_key,checksum,original_file_name,mime_type,byte_size,uploaded_at,support_status)
      VALUES ('v1','source',1,'pdf',repeat('a',64),'law.pdf','application/pdf',1,now(),'review_required');
      INSERT INTO kb_provisions
        (id,revision,source_version_id,citation,kind,text,reconstruction_status,content_hash)
      VALUES ('p1',1,'v1','{"instrumentId":"eu-2016-679","sourceVersionId":"v1","path":["Rule 8"],"label":"Rule 8"}',
        'rule','Original text','needs_review',repeat('b',64));
    `);
    const reviews = new KbReviewService({ connect: async () => client, query } as unknown as Pool);
    const input = { targetKind: "provision" as const, targetId: "p1", revision: 1,
      revisionHash: "b".repeat(64), decision: "approve" as const, reason: "Checked against PDF" };
    await assert.rejects(reviews.submit("bob", input), /denied/);
    await assert.rejects(reviews.submit("alice", { ...input, revisionHash: "c".repeat(64) }), /stale/);
    const approved = await reviews.submit("alice", input);
    assert.ok(approved.id);
    assert.equal(Number((await db.query<{ count: string }>("SELECT count(*) FROM kb_reviews")).rows[0]?.count), 1);
    await assert.rejects(db.query("UPDATE kb_reviews SET decision = 'reject' WHERE id = $1", [approved.id]), /immutable/);
    const corrections = new KbProvisionCorrectionService({ connect: async () => client, query } as unknown as Pool);
    const corrected = await corrections.correctKind("alice", { provisionId: "p1", basedOnRevision: 1,
      expectedHash: "b".repeat(64), kind: "schedule", reason: "PDF heading is a schedule" });
    assert.equal(corrected.revision, 2);
    assert.equal((await db.query<{ text: string }>("SELECT text FROM kb_provisions WHERE id = 'p1' AND revision = 2")).rows[0]?.text,
      "Original text");
    await assert.rejects(reviews.submit("alice", input), /stale/);
    await reviews.submit("alice", { ...input, revision: 2, revisionHash: corrected.contentHash });
  } finally { await db.close(); }
});
