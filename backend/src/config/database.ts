import pg from "pg";
import { config } from "./index.js";

const { Pool } = pg;

const connectionString = config.databaseUrl.trim();

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const hasConnectionString = !!connectionString;
