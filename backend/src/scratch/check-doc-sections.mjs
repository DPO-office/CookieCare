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
  const res = await client.query("SELECT state_snapshot_json FROM draft_state_ledger WHERE document_id = 'doc_8658759d-3bd3-440c-85eb-bbfa84fe8254' ORDER BY updated_at DESC LIMIT 1");
  const snap = res.rows[0].state_snapshot_json;
  console.log('exhibitSpecs:', JSON.stringify(snap.draftingContext?.exhibitSpecs, null, 2));
  console.log('exhibits in state:', (snap.exhibits || []).map(e => ({ id: e.workUnitId, title: e.title, bodyLen: e.body?.length })));
  await client.end();
}
main().catch(console.error);
