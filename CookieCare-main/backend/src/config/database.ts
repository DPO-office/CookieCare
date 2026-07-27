import pg from "pg";
import { config } from "./index.js";

const { Pool } = pg;

const rawConnectionString = config.databaseUrl.trim();
const isNeon = rawConnectionString.includes("neon.tech");
const isPooler = rawConnectionString.includes("-pooler.");
const wantsSsl =
  isNeon ||
  /[?&]sslmode=(require|verify-full|verify-ca|prefer)/i.test(rawConnectionString) ||
  /[?&]sslrejectunauthorized=/i.test(rawConnectionString);

// Strip URL ssl params so they don't conflict with Pool-level ssl config.
// Corporate proxies (e.g. Zscaler) re-sign TLS certs, so Node cannot verify
// the Cloud SQL leaf unless rejectUnauthorized is disabled for local/dev use.
let connectionString = rawConnectionString
  .replace(/[?&]sslmode=[^&]*/gi, "")
  .replace(/[?&]sslrejectunauthorized=[^&]*/gi, "")
  .replace(/[?&]$/, "")
  .replace(/\?$/, "");

if (isNeon && isPooler && !connectionString.includes("pgbouncer=true")) {
  connectionString += (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true";
}

export const pool = new Pool({
  connectionString,
  ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const hasConnectionString = !!connectionString;

// Small delay to allow the pool to initialize before first use.
// This helps prevent race conditions in serverless environments.
export const waitForPool = async (retries = 10, delay = 500): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
