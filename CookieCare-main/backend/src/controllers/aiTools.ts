import { Request, Response } from "express";
import crypto from "crypto";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";

const STATUSES = new Set(["proposed", "pilot", "active", "under_review", "retired"]);
const RISKS = new Set(["prohibited", "high", "limited", "minimal"]);
const CATEGORIES = new Set([
  "llm_platform",
  "copilot",
  "analytics",
  "hr",
  "customer",
  "security",
  "custom",
  "other",
]);

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_tools (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      vendor VARCHAR(255) DEFAULT '',
      category VARCHAR(80) NOT NULL DEFAULT 'other',
      purpose TEXT DEFAULT '',
      owner_name VARCHAR(255) DEFAULT '',
      department VARCHAR(255) DEFAULT '',
      status VARCHAR(50) NOT NULL DEFAULT 'pilot',
      eu_risk VARCHAR(50) NOT NULL DEFAULT 'minimal',
      data_types JSONB DEFAULT '[]'::jsonb,
      model_name VARCHAR(255) DEFAULT '',
      last_reviewed_at DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableReady = true;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseDataTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor || "",
    category: row.category,
    purpose: row.purpose || "",
    ownerName: row.owner_name || "",
    department: row.department || "",
    status: row.status,
    euRisk: row.eu_risk,
    dataTypes: Array.isArray(row.data_types) ? row.data_types : [],
    modelName: row.model_name || "",
    lastReviewedAt: row.last_reviewed_at
      ? new Date(String(row.last_reviewed_at)).toISOString().slice(0, 10)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseBody(body: Record<string, unknown>) {
  const name = asString(body.name);
  if (!name) throw new Error("Tool name is required.");

  const status = asString(body.status, "pilot");
  const euRisk = asString(body.euRisk ?? body.eu_risk, "minimal");
  const category = asString(body.category, "other");

  if (!STATUSES.has(status)) throw new Error("Invalid lifecycle status.");
  if (!RISKS.has(euRisk)) throw new Error("Invalid EU AI Act risk class.");
  if (!CATEGORIES.has(category)) throw new Error("Invalid category.");

  const lastReviewed = asString(body.lastReviewedAt ?? body.last_reviewed_at);
  return {
    name,
    vendor: asString(body.vendor),
    category,
    purpose: asString(body.purpose),
    ownerName: asString(body.ownerName ?? body.owner_name),
    department: asString(body.department),
    status,
    euRisk,
    dataTypes: parseDataTypes(body.dataTypes ?? body.data_types),
    modelName: asString(body.modelName ?? body.model_name),
    lastReviewedAt: lastReviewed || null,
  };
}

export const listAiTools = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    await ensureTable();
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM ai_tools
         WHERE user_id = current_setting('app.current_user_id', true)
         ORDER BY updated_at DESC`
      );
      return rows;
    });
    res.json(rows.map(mapRow));
  } catch (err: any) {
    console.error("Failed to list AI tools:", err);
    res.status(500).json({ error: "Failed to load AI tools inventory." });
  }
};

export const createAiTool = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    await ensureTable();
    const payload = parseBody(req.body || {});
    const id = "aitool_" + crypto.randomUUID();
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO ai_tools (
           id, user_id, name, vendor, category, purpose, owner_name, department,
           status, eu_risk, data_types, model_name, last_reviewed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          id,
          userId,
          payload.name,
          payload.vendor,
          payload.category,
          payload.purpose,
          payload.ownerName,
          payload.department,
          payload.status,
          payload.euRisk,
          JSON.stringify(payload.dataTypes),
          payload.modelName,
          payload.lastReviewedAt,
        ]
      );
      return rows[0];
    });
    res.status(201).json(mapRow(row));
  } catch (err: any) {
    const status = err.message?.includes("required") || err.message?.includes("Invalid") ? 400 : 500;
    res.status(status).json({ error: err.message || "Failed to create AI tool." });
  }
};

export const updateAiTool = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    await ensureTable();
    const payload = parseBody(req.body || {});
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        `UPDATE ai_tools SET
           name = $1, vendor = $2, category = $3, purpose = $4, owner_name = $5,
           department = $6, status = $7, eu_risk = $8, data_types = $9,
           model_name = $10, last_reviewed_at = $11, updated_at = CURRENT_TIMESTAMP
         WHERE id = $12 AND user_id = current_setting('app.current_user_id', true)
         RETURNING *`,
        [
          payload.name,
          payload.vendor,
          payload.category,
          payload.purpose,
          payload.ownerName,
          payload.department,
          payload.status,
          payload.euRisk,
          JSON.stringify(payload.dataTypes),
          payload.modelName,
          payload.lastReviewedAt,
          req.params.id,
        ]
      );
      if (rows.length === 0) throw new Error("NOT_FOUND");
      return rows[0];
    });
    res.json(mapRow(row));
  } catch (err: any) {
    if (err.message === "NOT_FOUND") return res.status(404).json({ error: "Tool not found." });
    const status = err.message?.includes("required") || err.message?.includes("Invalid") ? 400 : 500;
    res.status(status).json({ error: err.message || "Failed to update AI tool." });
  }
};

export const deleteAiTool = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    await ensureTable();
    await withTransaction(userId, userRole, async (client) => {
      const result = await client.query(
        `DELETE FROM ai_tools
         WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)`,
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("NOT_FOUND");
    });
    res.json({ success: true });
  } catch (err: any) {
    if (err.message === "NOT_FOUND") return res.status(404).json({ error: "Tool not found." });
    res.status(500).json({ error: "Failed to delete AI tool." });
  }
};
