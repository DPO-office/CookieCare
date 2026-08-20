import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getLibraryItems = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    const { rows, total } = await withTransaction(userId, userRole, async (client) => {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*) AS total FROM library_items
         WHERE user_id = current_setting('app.current_user_id', true)`
      );
      const total = Number(countRows[0].total);

      const { rows } = await client.query(
        `SELECT * FROM library_items
         WHERE user_id = current_setting('app.current_user_id', true)
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return { rows, total };
    }).catch(e => {
      console.error("Vault retrieval failed:", e);
      throw new Error("VAULT_READ_ERROR");
    });

    res.json({
      data: rows,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (err: any) {
    const message = err.message === "VAULT_READ_ERROR" ? "Cryptographic vault index unreachable." : "Internal vault error.";
    res.status(500).json({ error: message });
  }
};

export const createLibraryItem = async (req: Request, res: Response) => {
  const { type, name, description, tags, details } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const id = "lib_" + crypto.randomUUID();

  try {
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO library_items (id, user_id, type, name, description, tags, details) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [id, userId, type, name, description, tags, details]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteLibraryItem = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      // Only the item owner may delete it.
      const result = await client.query(
        "DELETE FROM library_items WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)",
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("Item not found.");

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'library_item_delete', JSON.stringify({ itemId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message === "Item not found." ? 404 : 500).json({ error: err.message });
  }
};
