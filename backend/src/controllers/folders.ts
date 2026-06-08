import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getFolders = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM folders WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows;
    });
    res.json(rows);
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
      const result = await client.query(
        "DELETE FROM folders WHERE id = $1",
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("Folder not found.");

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'folder_delete', JSON.stringify({ folderId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message === "Folder not found." ? 404 : 500).json({ error: err.message });
  }
};
