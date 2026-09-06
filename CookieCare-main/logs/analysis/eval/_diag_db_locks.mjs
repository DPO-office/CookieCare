/**
 * Diagnose why setupDb idempotent migrations hang.
 * Usage: node --env-file=.env logs/analysis/eval/_diag_db_locks.mjs
 * (or: npx tsx with dotenv)
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  query_timeout: 15000,
});

async function main() {
  console.log("Connecting…");
  await client.connect();
  console.log("Connected.\n");

  const activity = await client.query(`
    SELECT pid, state, wait_event_type, wait_event,
           now() - xact_start AS xact_age,
           now() - query_start AS query_age,
           left(query, 160) AS query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
    ORDER BY xact_start NULLS LAST
  `);
  console.log("=== other sessions on this DB ===");
  console.log(`count=${activity.rows.length}`);
  for (const r of activity.rows) {
    console.log(
      JSON.stringify({
        pid: r.pid,
        state: r.state,
        wait: `${r.wait_event_type || ""}/${r.wait_event || ""}`,
        xact_age: r.xact_age,
        query_age: r.query_age,
        query: r.query,
      })
    );
  }

  const locks = await client.query(`
    SELECT a.pid, a.state, l.mode, l.granted, l.relation::regclass AS rel,
           left(a.query, 120) AS query
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE a.datname = current_database()
      AND NOT l.granted
    ORDER BY a.pid
  `);
  console.log("\n=== waiting (ungranted) locks ===");
  console.log(`count=${locks.rows.length}`);
  for (const r of locks.rows) {
    console.log(JSON.stringify(r));
  }

  const blockers = await client.query(`
    SELECT blocked.pid AS blocked_pid,
           blocking.pid AS blocking_pid,
           blocked.state AS blocked_state,
           blocking.state AS blocking_state,
           left(blocked.query, 100) AS blocked_query,
           left(blocking.query, 100) AS blocking_query,
           now() - blocking.xact_start AS blocker_xact_age
    FROM pg_stat_activity blocked
    JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
    JOIN pg_locks kl ON kl.locktype = bl.locktype
      AND kl.database IS NOT DISTINCT FROM bl.database
      AND kl.relation IS NOT DISTINCT FROM bl.relation
      AND kl.page IS NOT DISTINCT FROM bl.page
      AND kl.tuple IS NOT DISTINCT FROM bl.tuple
      AND kl.virtualxid IS NOT DISTINCT FROM bl.virtualxid
      AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
      AND kl.classid IS NOT DISTINCT FROM bl.classid
      AND kl.objid IS NOT DISTINCT FROM bl.objid
      AND kl.objsubid IS NOT DISTINCT FROM bl.objsubid
      AND kl.granted
    JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
    WHERE blocked.datname = current_database()
  `);
  console.log("\n=== blocker → blocked ===");
  console.log(`count=${blockers.rows.length}`);
  for (const r of blockers.rows) {
    console.log(JSON.stringify(r));
  }

  // Idle-in-transaction older than 30s — typical leftover after kill -9
  const idle = activity.rows.filter(
    (r) =>
      String(r.state || "").includes("idle in transaction") ||
      String(r.state || "") === "idle in transaction (aborted)"
  );
  console.log(`\n=== idle-in-transaction count=${idle.length} ===`);
  for (const r of idle) {
    console.log(JSON.stringify({ pid: r.pid, xact_age: r.xact_age, query: r.query }));
  }

  await client.end();
  console.log("\nDone.");
}

main().catch(async (err) => {
  console.error("DIAG FAILED:", err.message || err);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
