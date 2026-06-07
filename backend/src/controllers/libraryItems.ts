import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getLibraryItems = async (req: Request, res: Response) => {
  const client = req.dbClient || pool;
  try {
    const { rows } = await client.query(
      "SELECT * FROM library_items WHERE user_id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN' ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createLibraryItem = async (req: Request, res: Response) => {
  const { type, name, description, tags, details } = req.body;
  const userId = req.user!.id;
  const id = "lib_" + crypto.randomUUID();
  const client = req.dbClient || pool;

  try {
    const { rows } = await client.query(
      "INSERT INTO library_items (id, user_id, type, name, description, tags, details) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [id, userId, type, name, description, tags, details]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteLibraryItem = async (req: Request, res: Response) => {
  const client = req.dbClient || pool;
  try {
    const result = await client.query(
      "DELETE FROM library_items WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Item not found." });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
