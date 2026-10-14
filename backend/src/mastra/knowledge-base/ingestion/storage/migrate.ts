import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

const migrationFiles = ["001_foundation.sql", "002_durable_uploads.sql", "003_legal_structure.sql",
  "004_workflow_jobs.sql", "005_structure_provider_runs.sql"] as const;

export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

async function migrationSql(file: string): Promise<string> {
  return readFile(new URL(`./migrations/${file}`, import.meta.url), "utf8");
}

/** A failed or edited migration fails startup. No best-effort schema changes. */
export async function migrateKnowledgeBase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await runMigrations(client);
  } finally {
    client.release();
  }
}

export async function runMigrations(client: MigrationClient): Promise<void> {
  await client.query("BEGIN");
  try {
    const schema = await client.query("SELECT to_regclass('public.users') AS users_table");
    if (!(schema.rows[0] as { users_table?: string | null } | undefined)?.users_table) {
      throw new Error("Application schema is missing; run the explicit db-setup job before KB migrations");
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cookiecare_kb_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query("SELECT version, checksum FROM kb_schema_migrations");
    const appliedRows = applied.rows as Array<{ version: string; checksum: string }>;
    const known = new Map<string, string>();
    for (const file of migrationFiles) {
      const sql = await migrationSql(file);
      known.set(file, createHash("sha256").update(sql).digest("hex"));
    }
    for (const row of appliedRows) {
      if (known.get(row.version) !== row.checksum) {
        throw new Error(`Unknown or modified KB migration: ${row.version}`);
      }
    }
    for (const file of migrationFiles) {
      if (appliedRows.some(row => row.version === file)) continue;
      await client.query(await migrationSql(file));
      await client.query("INSERT INTO kb_schema_migrations (version, checksum) VALUES ($1, $2)", [file, known.get(file)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
