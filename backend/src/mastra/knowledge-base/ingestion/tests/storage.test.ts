import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Pool } from "pg";
import { runMigrations } from "../storage/migrate.js";
import { KbAccessDeniedError, KbSourceStore } from "../storage/source-store.js";
import { KB_SCHEMA_VERSION } from "../schemas/common.js";

async function fixture() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec("CREATE TABLE users (id VARCHAR(255) PRIMARY KEY, role VARCHAR(50), status VARCHAR(50))");
  await db.exec(`INSERT INTO users (id, role, status) VALUES
    ('alice', 'USER', 'APPROVED'), ('bob', 'USER', 'APPROVED'),
    ('charlie', 'USER', 'APPROVED'), ('admin', 'ADMIN', 'APPROVED'),
    ('pending', 'USER', 'PENDING_APPROVAL')`);
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("-- Versioned KB schema") || sql.startsWith("CREATE TABLE kb_upload_intents") || sql.startsWith("-- Legal identity") || sql.startsWith("-- One durable queue")) {
        await db.exec(sql);
        return { rows: [], rowCount: 0 };
      }
      return db.query(sql, params);
    },
    release() {},
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { db, client, pool, store: new KbSourceStore(pool) };
}

test("fresh migration, repeat migration, and immutable source revisions", async () => {
  const { db, client, store } = await fixture();
  try {
    await runMigrations(client);
    await runMigrations(client);
    const applied = await db.query<{ version: string }>("SELECT version FROM kb_schema_migrations");
    assert.deepEqual(applied.rows.map(row => row.version), ["001_foundation.sql", "002_durable_uploads.sql",
      "003_legal_structure.sql", "004_workflow_jobs.sql", "005_structure_provider_runs.sql"]);

    await store.createSource("alice", {
      schemaVersion: KB_SCHEMA_VERSION, id: "source-1", instrumentId: "gdpr", title: "GDPR",
      issuer: null, jurisdiction: null, authorityStatus: "verified",
      access: { visibility: "private", ownerUserId: "alice" },
    });
    const makeVersion = (revision: number) => ({
      schemaVersion: KB_SCHEMA_VERSION, id: `version-${revision}`, sourceId: "source-1",
      uploadRevision: revision, objectKey: `kb/sources/source-1/versions/version-${revision}/original.pdf`,
      checksum: "a".repeat(64), originalFileName: "gdpr.pdf", mimeType: "application/pdf",
      byteSize: 10, language: "en", uploadedAt: "2026-10-10T00:00:00Z",
      enactedOn: null, effectiveFrom: null, effectiveUntil: null, originalPageCount: null,
      extractionVersion: null, supportStatus: "pending" as const,
    });
    await store.addSourceVersion("alice", makeVersion(1));
    await store.addSourceVersion("alice", makeVersion(2));
    assert.deepEqual((await store.getSource("alice", "source-1")).versions.map(v => v.upload_revision), [1, 2]);
    await assert.rejects(db.query("UPDATE kb_source_versions SET checksum = $1 WHERE id = 'version-1'", ["b".repeat(64)]));
    await assert.rejects(store.addSourceVersion("alice", makeVersion(2)));
    await db.query(`INSERT INTO kb_blocks
      (id, source_version_id, text, reading_order, page, extraction_method, item_ref)
      VALUES ('block-1', 'version-1', 'Article text', 0, 1, 'text_layer', 'item-1'),
             ('block-2', 'version-2', 'Other revision', 0, 1, 'text_layer', 'item-2')`);
    await db.query(`INSERT INTO kb_provisions
      (id, revision, source_version_id, citation, kind, text, reconstruction_status, content_hash)
      VALUES ('provision-1', 1, 'version-1', $1, 'article', 'Article text', 'complete', $2)`,
      [JSON.stringify({ instrumentId: "gdpr", sourceVersionId: "version-1", path: ["1"], label: "Article 1" }), "d".repeat(64)]);
    await assert.rejects(db.query(`INSERT INTO kb_provision_fragments
      (provision_id, provision_revision, source_version_id, ordinal, block_id, start_offset, end_offset)
      VALUES ('provision-1', 1, 'version-1', 0, 'block-2', 0, 5)`));
    await db.query(`INSERT INTO kb_provision_fragments
      (provision_id, provision_revision, source_version_id, ordinal, block_id, start_offset, end_offset)
      VALUES ('provision-1', 1, 'version-1', 0, 'block-1', 0, 12)`);
    await assert.rejects(db.query(`UPDATE kb_provision_fragments SET end_offset = 5
      WHERE provision_id = 'provision-1' AND provision_revision = 1`));
    await assert.rejects(db.query(`INSERT INTO kb_reviews
      (id, reviewer_user_id, target_kind, provision_id, provision_revision, revision_hash, decision, reason, reviewed_at)
      VALUES ('review-1', 'alice', 'provision', 'provision-1', 1, $1, 'approve', 'ok', now())`,
      ["e".repeat(64)]));
    await db.query(`INSERT INTO kb_reviews
      (id, reviewer_user_id, target_kind, provision_id, provision_revision, revision_hash, decision, reason, reviewed_at)
      VALUES ('review-1', 'alice', 'provision', 'provision-1', 1, $1, 'approve', 'ok', now())`,
      ["d".repeat(64)]);
    await db.query(`INSERT INTO kb_publications
      (id, manifest_hash, manifest, index_version, lexical_status, dense_status, state, created_by, created_at)
      VALUES ('publication-1', $1, $2, 'index-1', 'ready', 'ready', 'active', 'alice', now())`,
      ["c".repeat(64), JSON.stringify({ sourceVersionIds: ["version-1"] })]);
    await db.query(`INSERT INTO kb_publication_reviews (publication_id, review_id)
      VALUES ('publication-1', 'review-1')`);
    await assert.rejects(db.query("DELETE FROM kb_publication_reviews WHERE publication_id = 'publication-1'"));
    await assert.rejects(db.query("UPDATE kb_publications SET manifest = '{}' WHERE id = 'publication-1'"));
    assert.deepEqual((await db.query<{ manifest: { sourceVersionIds: string[] } }>(
      "SELECT manifest FROM kb_publications WHERE id = 'publication-1'" )).rows[0]?.manifest.sourceVersionIds, ["version-1"]);
  } finally {
    await db.close();
  }
});

test("private and workspace access follows server-side membership", async () => {
  const { db, client, store } = await fixture();
  try {
    await runMigrations(client);
    await store.createWorkspace("alice", { id: "team-1", name: "Team" });
    await store.createSource("alice", {
      schemaVersion: KB_SCHEMA_VERSION, id: "team-source", instrumentId: "gdpr", title: "GDPR",
      issuer: null, jurisdiction: null, authorityStatus: "verified",
      access: { visibility: "workspace", ownerUserId: "alice", workspaceId: "team-1" },
    });
    await assert.rejects(store.getSource("bob", "team-source"), KbAccessDeniedError);
    await assert.rejects(store.getSource("pending", "team-source"), KbAccessDeniedError);
    await store.grantWorkspacePermissions("alice", "team-1", "bob", { upload: false, review: true, publish: false });
    assert.equal((await store.getSource("bob", "team-source")).source.id, "team-source");
    await store.assertSourcePermission("bob", "team-source", "review");
    await assert.rejects(store.assertSourcePermission("bob", "team-source", "upload"), KbAccessDeniedError);
    await assert.rejects(store.assertSourcePermission("bob", "team-source", "publish"), KbAccessDeniedError);
    await assert.rejects(store.getSource("charlie", "team-source"), KbAccessDeniedError);
    await assert.rejects(store.grantWorkspacePermissions("bob", "team-1", "charlie", { upload: true, review: true, publish: true }), KbAccessDeniedError);
    await assert.rejects(store.createSource("charlie", {
      schemaVersion: KB_SCHEMA_VERSION, id: "stolen", instrumentId: "gdpr", title: "GDPR",
      issuer: null, jurisdiction: null, authorityStatus: "verified",
      access: { visibility: "workspace", ownerUserId: "charlie", workspaceId: "team-1" },
    }), KbAccessDeniedError);
    await assert.rejects(store.createSource("bob", {
      schemaVersion: KB_SCHEMA_VERSION, id: "shared", instrumentId: "gdpr", title: "GDPR",
      issuer: null, jurisdiction: null, authorityStatus: "verified",
      access: { visibility: "curated_shared", curatorUserId: "bob" },
    }), KbAccessDeniedError);
  } finally {
    await db.close();
  }
});

test("migration failures roll back and changed migrations stop startup", async () => {
  const db = new PGlite({ extensions: { vector } });
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("-- Versioned KB schema") || sql.startsWith("CREATE TABLE kb_upload_intents") || sql.startsWith("-- Legal identity") || sql.startsWith("-- One durable queue")) {
        await db.exec(sql);
        return { rows: [] };
      }
      return db.query(sql, params);
    },
  };
  try {
    await assert.rejects(runMigrations(client), /Application schema is missing/);
    assert.equal((await db.query<{ name: string | null }>("SELECT to_regclass('kb_sources') AS name")).rows[0]?.name, null);
    await db.exec("CREATE TABLE users (id VARCHAR(255) PRIMARY KEY, role VARCHAR(50), status VARCHAR(50))");
    await runMigrations(client);
    await db.query("UPDATE kb_schema_migrations SET checksum = $1", ["0".repeat(64)]);
    await assert.rejects(runMigrations(client), /Unknown or modified KB migration/);
  } finally {
    await db.close();
  }
});
