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
  const res = await client.query('SELECT id, name, content FROM contract_templates WHERE id = $1', ['tpl_6ebcca63-714a-484c-9f65-d11a283280b3']);
  if (res.rows[0]) {
    console.log('Template Name:', res.rows[0].name);
    console.log('=== START ===\n' + res.rows[0].content.slice(0, 1500));
    console.log('=== END ===\n' + res.rows[0].content.slice(-1500));
  } else {
    const list = await client.query('SELECT id, name FROM contract_templates LIMIT 10');
    console.log('Templates:', list.rows);
  }
  await client.end();
}
main().catch(console.error);
