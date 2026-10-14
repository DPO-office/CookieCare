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
  const res = await client.query("SELECT document_id, version, updated_at, state_snapshot_json FROM draft_state_ledger WHERE state_snapshot_json::text ILIKE '%serve as the legal venue%' OR state_snapshot_json::text ILIKE '%Which state%' LIMIT 3");
  console.log('Matches:', res.rows.length);
  for (const r of res.rows) {
    const snap = r.state_snapshot_json;
    const gaps = snap?.draftingContext?.gaps || snap?.plan?.missingFacts;
    console.log('Doc:', r.document_id, 'ver:', r.version, 'gaps count:', gaps?.length);
    if (gaps) {
      for (const g of gaps) {
        console.log('  field:', g.field, '| question:', JSON.stringify(g.question), '| options:', g.options);
      }
    }
  }
  await client.end();
}
main().catch(console.error);
