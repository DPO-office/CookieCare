import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const DEFAULT_FOLDER_NAME = "Uploaded Documents";

/**
 * Ensures the "Uploaded Documents" default system folder exists for a user.
 * Creates it if missing and returns its id.
 * Safe to call multiple times (idempotent).
 */
export async function getOrCreateDefaultFolder(userId: string, userRole: string = "USER"): Promise<string> {
  return withTransaction(userId, userRole, async (client) => {
    // Check for existing default folder owned by this user
    const { rows } = await client.query(
      "SELECT id FROM folders WHERE user_id = $1 AND name = $2 LIMIT 1",
      [userId, DEFAULT_FOLDER_NAME]
    );
    if (rows.length > 0) {
      return rows[0].id as string;
    }
    // Create it
    const folderId = "fld_" + crypto.randomUUID();
    await client.query(
      "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3)",
      [folderId, DEFAULT_FOLDER_NAME, userId]
    );
    console.log(`[defaultFolder] Created "${DEFAULT_FOLDER_NAME}" (${folderId}) for user ${userId}`);
    return folderId;
  });
}

/**
 * Migrates all documents with folder_id = NULL owned by a user into their
 * "Uploaded Documents" folder. Safe to call on every login — it is a no-op
 * when there are no unassigned documents.
 */
export async function migrateUnassignedDocuments(userId: string, defaultFolderId: string, userRole: string = "USER"): Promise<void> {
  await withTransaction(userId, userRole, async (client) => {
    const result = await client.query(
      "UPDATE files SET folder_id = $1 WHERE creator_id = $2 AND folder_id IS NULL AND type != 'ephemeral_upload'",
      [defaultFolderId, userId]
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[defaultFolder] Migrated ${result.rowCount} unassigned doc(s) for user ${userId} → folder ${defaultFolderId}`);
    }
  });
}

export const getFolders = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    // Ensure "Uploaded Documents" default folder exists and migrate any unassigned docs.
    // Both are no-ops when already complete, so this is safe to call on every request.
    const defaultFolderId = await getOrCreateDefaultFolder(userId, userRole);
    await migrateUnassignedDocuments(userId, defaultFolderId, userRole);

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM folders
       WHERE user_id = $1`,
      [userId]
    );
    const total = Number(countRows[0].total);

    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM folders
         WHERE user_id = current_setting('app.current_user_id', true)
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return rows;
    });

    res.json({
      data: rows,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createFolder = async (req: Request, res: Response) => {
  const { name } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  if (!name) return res.status(400).json({ error: "Folder name is required." });

  try {
    const id = "fld_" + crypto.randomUUID();
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3) RETURNING *",
        [id, name, userId]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      // Fetch the folder verifying ownership at the same time.
      const { rows: folderRows } = await client.query(
        "SELECT name FROM folders WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)",
        [req.params.id]
      );

      if (folderRows.length === 0) throw new Error("Folder not found.");

      // Prevent deletion of the default "Uploaded Documents" system folder.
      if (folderRows[0].name === DEFAULT_FOLDER_NAME) {
        throw new Error("DEFAULT_FOLDER_PROTECTED");
      }

      await client.query(
        "DELETE FROM folders WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)",
        [req.params.id]
      );

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'folder_delete', JSON.stringify({ folderId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err: any) {
    if (err.message === "DEFAULT_FOLDER_PROTECTED") {
      return res.status(403).json({ error: "The 'Uploaded Documents' folder cannot be deleted." });
    }
    res.status(err.message === "Folder not found." ? 404 : 500).json({ error: err.message });
  }
};
