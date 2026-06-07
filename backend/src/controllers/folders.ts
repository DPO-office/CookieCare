import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getFolders = async (req: Request, res: Response) => {
  const client = req.dbClient || pool;
  try {
    const { rows } = await client.query(
      "SELECT * FROM folders WHERE user_id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN' ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createFolder = async (req: Request, res: Response) => {
  const { name } = req.body;
  const client = req.dbClient || pool;
  if (!name) return res.status(400).json({ error: "Folder name is required." });

  try {
    const id = "fld_" + crypto.randomUUID();
    const { rows } = await client.query(
      "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3) RETURNING *",
      [id, name, req.user!.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  const client = req.dbClient || pool;
  try {
    const result = await client.query(
      "DELETE FROM folders WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Folder not found." });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
