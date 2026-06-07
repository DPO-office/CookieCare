import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getLibraryItems = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM library_items WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      return rows;
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createLibraryItem = async (req: Request, res: Response) => {
  const { type, name, description, tags, details } = req.body;
  const userId = req.user!.id;
  const id = "lib_" + crypto.randomUUID();

  try {
    const { rows } = await pool.query(
      "INSERT INTO library_items (id, user_id, type, name, description, tags, details) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [id, userId, type, name, description, tags, details]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteLibraryItem = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      "DELETE FROM library_items WHERE id = $1 AND user_id = $2",
      [req.params.id, userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Item not found." });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
