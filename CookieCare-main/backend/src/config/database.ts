import pg from "pg";
import { config } from "./index.js";

const { Pool } = pg;

const emptyResult = {
  rows: [] as unknown[],
  rowCount: 0,
  command: "SELECT",
  oid: 0,
  fields: [],
};

function createStubPool(): pg.Pool {
  const stubClient = {
    query: async () => emptyResult,
    release: () => undefined,
    on: () => undefined,
  };

  return {
    query: async () => emptyResult,
    connect: async () => stubClient,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as pg.Pool;
}

const rawConnectionString = (config.databaseUrl || "").trim();
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

export const pool = config.skipDb
  ? createStubPool()
  : new Pool({
      connectionString,
      ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
      max: isNeon ? 8 : 20,
      idleTimeoutMillis: isNeon ? 10000 : 30000,
      connectionTimeoutMillis: 60000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

if (!config.skipDb) {
  pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err.message);
  });

  // Checked-out clients emit 'error' when the remote closes the socket
  // (Neon idle timeout, PgBouncer, TLS intercept). Without a listener,
  // Node treats that as an unhandled error and exits the process.
  pool.on("connect", (client) => {
    client.on("error", (err) => {
      console.error("Unexpected database client error:", err.message);
    });
  });
}

export function isDatabaseQuotaError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const message = e?.message ?? "";
  return e?.code === "53000" || /data transfer quota/i.test(message);
}

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
