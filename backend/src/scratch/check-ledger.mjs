import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '../.env' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL.replace('?sslmode=require&sslrejectunauthorized=false', ''),
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query('SELECT document_id, version, updated_at, state_snapshot_json FROM draft_state_ledger ORDER BY updated_at DESC LIMIT 3');
  for (const r of res.rows) {
    const snap = r.state_snapshot_json;
    console.log('Doc:', r.document_id, 'ver:', r.version, 'updated:', r.updated_at);
    if (snap?.draftPlan?.workUnits) {
      console.log('--- WorkUnits (' + snap.draftPlan.workUnits.length + ') ---');
      for (const u of snap.draftPlan.workUnits) {
        console.log(u.id, '| heading:', u.heading, '| body len:', u.body?.length, '| body preview:', JSON.stringify(u.body?.slice(0, 100)));
      }
      break;
    }
  }
  await client.end();
}
main().catch(console.error);
