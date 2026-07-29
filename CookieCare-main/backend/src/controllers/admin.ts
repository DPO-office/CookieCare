import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import { reindexUnchunkedDocuments } from "../RAG/ragService.js";

export const approveUser = async (req: Request, res: Response) => {
  const { userId, role, status } = req.body;
  const currentUserId = req.user!.id;
  const currentUserRole = req.user!.role;

  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }

  try {
    const finalRole = role || 'USER';
    const finalStatus = status || 'APPROVED';

    await withTransaction(currentUserId, currentUserRole, async (client) => {
      await client.query(
        "UPDATE users SET status = $1::varchar, role = $2::varchar, approved_at = CASE WHEN $1::varchar = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id = $3",
        [finalStatus, finalRole, userId]
      );
    });

    res.json({ success: true, message: `User updated to ${finalStatus} with role ${finalRole}.` });
  } catch (error: any) {
    console.error("Admin user update failed:", error);
    res.status(500).json({ error: "Failed to update user." });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  const currentUserId = req.user!.id;
  const currentUserRole = req.user!.role;
  try {
    const rows = await withTransaction(currentUserId, currentUserRole, async (client) => {
      const { rows } = await client.query(
        "SELECT id, email, name, status, role, created_at FROM users ORDER BY created_at DESC"
      );
      return rows;
    });
    res.json(rows);
  } catch (err: any) {
    console.error("Failed to fetch users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};

export const getPendingUsers = async (req: Request, res: Response) => {
  const currentUserId = req.user!.id;
  const currentUserRole = req.user!.role;
  try {
    const rows = await withTransaction(currentUserId, currentUserRole, async (client) => {
      const { rows } = await client.query(
        "SELECT id, email, name, status, role, created_at FROM users WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC"
      );
      return rows;
    });
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
