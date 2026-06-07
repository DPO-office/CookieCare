import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getFolders = async (req: Request, res: Response) => {
  try {
    const rows = await withTransaction(req.user!.id, req.user!.role, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM folders WHERE user_id = $1 ORDER BY created_at DESC",
        [req.user!.id]
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
  if (!name) return res.status(400).json({ error: "Folder name is required." });

  try {
    const id = "fld_" + crypto.randomUUID();
    const { rows } = await pool.query(
      "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3) RETURNING *",
      [id, name, req.user!.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "DELETE FROM folders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user!.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Folder not found." });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
