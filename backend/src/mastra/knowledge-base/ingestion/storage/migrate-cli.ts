import pg from "pg";
import { migrateKnowledgeBase } from "./migrate.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for KB migrations");

const pool = new pg.Pool({ connectionString });
try {
  await migrateKnowledgeBase(pool);
  console.log("Knowledge-base migrations are current.");
} finally {
  await pool.end();
}
