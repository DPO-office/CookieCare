import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
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
    fs.writeFileSync('src/scratch/dpa-template-full.txt', res.rows[0].content);
    console.log('Saved dpa-template-full.txt, length:', res.rows[0].content.length);
  }
  await client.end();
}
main().catch(console.error);
