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
  const res = await client.query('SELECT id, name, contract_type, jurisdiction, status FROM contract_templates');
  console.log('Templates in contract_templates:');
  console.table(res.rows);
  await client.end();
}
main().catch(console.error);
