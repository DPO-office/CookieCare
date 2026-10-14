import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { reindexUnchunkedDocuments } from "../RAG/ragService.js";
import { DOCUMENT_GRAPH_SCHEMA_VERSION, ensureDocumentGraph } from "../modules/analysis/capabilities/ingest/document-structure/index.js";

// The users table is not covered by RLS — all admin queries on it use pool
// directly. withTransaction sets RLS session variables (app.current_user_id /
// app.current_user_role) which only apply to tenant-isolated tables (files,
// folders, etc.). Wrapping users queries in withTransaction caused silent
// transaction failures that returned empty results from getPendingUsers and
// getAllUsers, making newly registered accounts invisible in the Admin Panel.

export const approveUser = async (req: Request, res: Response) => {
  const { userId, role, status } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }

  try {
    const finalRole = role || 'USER';
    const finalStatus = status || 'APPROVED';

    await pool.query(
      "UPDATE users SET status = $1::varchar, role = $2::varchar, approved_at = CASE WHEN $1::varchar = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id = $3",
      [finalStatus, finalRole, userId]
    );

    res.json({ success: true, message: `User updated to ${finalStatus} with role ${finalRole}.` });
  } catch (error: any) {
    console.error("Admin user update failed:", error);
    res.status(500).json({ error: "Failed to update user." });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, status, role, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err: any) {
    console.error("Failed to fetch users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};

export const getPendingUsers = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, status, role, created_at FROM users WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err: any) {
    console.error("Failed to fetch pending users:", err);
    res.status(500).json({ error: "Failed to fetch pending users." });
  }
};

/**
 * POST /api/admin/reindex-chunks
 * Body: { userId?: string }  — if omitted, re-indexes chunks for all users.
 *
 * Finds all files that have zero rows in legal_document_chunks and indexes them.
 * This is a one-time backfill for documents created before chunking was wired up
 * for the editor, draft, and refine flows.
 */
export const reindexChunks = async (req: Request, res: Response) => {
  const targetUserId: string | undefined = req.body?.userId;

  try {
    if (targetUserId) {
      const result = await reindexUnchunkedDocuments(targetUserId);
      return res.json({ success: true, userId: targetUserId, ...result });
    }

    // No userId supplied — backfill for every user in the system
    const { rows: users } = await pool.query("SELECT id FROM users");
    let totalIndexed = 0;
    let totalSkipped = 0;

    for (const user of users) {
      const result = await reindexUnchunkedDocuments(user.id);
      totalIndexed += result.indexed;
      totalSkipped += result.skipped;
    }

    return res.json({ success: true, totalIndexed, totalSkipped });
  } catch (err: any) {
    console.error("[reindexChunks] Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/backfill-document-graphs
 * Body: { cursor?: string, limit?: number, userId?: string, retryNeedsReview?: boolean }
 *
 * Processes a stable page of latest document versions that have no canonical
 * structure artifact. Repeating with nextCursor is resumable and idempotent.
 */
export const backfillDocumentGraphs = async (req: Request, res: Response) => {
  const cursor = typeof req.body?.cursor === "string" ? req.body.cursor : "";
  const limit = Math.min(25, Math.max(1, Number(req.body?.limit) || 10));
  const targetUserId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
  const retryNeedsReview = req.body?.retryNeedsReview === true;
  try {
    const params: unknown[] = [cursor, limit, retryNeedsReview, DOCUMENT_GRAPH_SCHEMA_VERSION];
    const ownerFilter = targetUserId ? `AND f.creator_id = $5` : "";
    if (targetUserId) params.push(targetUserId);
    const { rows } = await pool.query(
      `SELECT f.id, f.creator_id
       FROM files f
       WHERE f.id > $1
         AND f.type NOT IN ('vault_asset_source')
         ${ownerFilter}
         AND EXISTS (SELECT 1 FROM document_versions v WHERE v.file_id=f.id)
         AND (
           NOT EXISTS (
             SELECT 1 FROM document_structure_artifacts a
             WHERE a.file_id=f.id
               AND a.version_id=(SELECT id FROM document_versions v2 WHERE v2.file_id=f.id ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
               AND a.schema_version=$4
           )
           OR ($3::boolean AND EXISTS (
             SELECT 1 FROM document_structure_artifacts a
             WHERE a.file_id=f.id
               AND a.version_id=(SELECT id FROM document_versions v3 WHERE v3.file_id=f.id ORDER BY v3.created_at DESC, v3.id DESC LIMIT 1)
               AND a.schema_version=$4
               AND a.status IN ('needs_review', 'failed')
           ))
         )
       ORDER BY f.id ASC LIMIT $2`, params
    );
    const results: Array<{ fileId: string; status: string; error?: string }> = [];
    for (const row of rows) {
      try {
        const graph = await ensureDocumentGraph(row.creator_id, row.id, { forceRebuild: retryNeedsReview });
        results.push({ fileId: row.id, status: graph.quality.status });
      } catch (error) {
        results.push({ fileId: row.id, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return res.json({
      success: true,
      processed: results.length,
      results,
      nextCursor: rows.length === limit ? rows.at(-1)?.id ?? null : null,
    });
  } catch (error: any) {
    console.error("[backfillDocumentGraphs] Error:", error);
    return res.status(500).json({ error: error?.message || "Document graph backfill failed." });
  }
};
