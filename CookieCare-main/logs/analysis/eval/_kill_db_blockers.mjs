/**
 * Kill sessions blocking jobs DDL / updates (long SELECTs + stuck ALTERs).
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  query_timeout: 20000,
});

async function main() {
  await client.connect();
  const targets = await client.query(`
    SELECT pid, state, wait_event_type, wait_event, left(query, 140) AS query,
           now() - query_start AS query_age
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND (
        state LIKE 'idle in transaction%'
        OR query ILIKE 'ALTER TABLE %'
        OR (
          query ILIKE '%FROM jobs%'
          AND now() - query_start > interval '20 seconds'
        )
        OR (
          query ILIKE 'UPDATE jobs%'
          AND wait_event_type = 'Lock'
        )
      )
  `);
  console.log(`targets=${targets.rows.length}`);
  for (const r of targets.rows) {
    console.log(JSON.stringify(r));
    const k = await client.query(`SELECT pg_terminate_backend($1) AS ok`, [r.pid]);
    console.log(`  terminate pid=${r.pid} ok=${k.rows[0]?.ok}`);
  }
  await client.end();
  console.log("done");
}

main().catch(async (e) => {
  console.error("FAIL:", e.message || e);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
