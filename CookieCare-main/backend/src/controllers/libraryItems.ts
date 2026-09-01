import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";

export const getLibraryItems = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  // Optional scope filter — 'private' | 'org'. When omitted, returns all items
  // the current user can see (their own private items + all org items).
  const rawSource = req.query.source as string | undefined;
  const source = rawSource === "private" || rawSource === "org" ? rawSource : null;

  try {
    const { rows, total } = await withTransaction(userId, userRole, async (client) => {
      // Build WHERE clause dynamically based on requested scope.
      // • 'private' → only rows owned by the current user with source='private'
      // • 'org'     → all rows with source='org' (organisation-wide, any owner)
      // • null      → the current user's own private items PLUS all org items
      //               (this is the default vault page load — teammates must see
      //                org items even if they did not create them)
      let whereClause: string;
      let queryParams: any[];

      if (source === "private") {
        whereClause = `user_id = current_setting('app.current_user_id', true) AND source = 'private'`;
        queryParams = [limit, offset];
      } else if (source === "org") {
        // Org items are readable by every authenticated user — RLS is bypassed
        // by the SET LOCAL in withTransaction, so we query by source only.
        whereClause = `source = 'org'`;
        queryParams = [limit, offset];
      } else {
        // No explicit scope filter: return the current user's own items (any source)
        // UNION with all org-scoped items from any owner so teammates can see
        // shared resources without needing an explicit ?source=org query.
        whereClause = `(user_id = current_setting('app.current_user_id', true) OR source = 'org')`;
        queryParams = [limit, offset];
      }

      const { rows: countRows } = await client.query(
        `SELECT COUNT(*) AS total FROM library_items WHERE ${whereClause}`
      );
      const total = Number(countRows[0].total);

      const { rows } = await client.query(
        `SELECT * FROM library_items
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        queryParams
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
  const { type, name, description, tags, details, source: rawSource } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const id = "lib_" + crypto.randomUUID();

  // Validate source — default to 'private' for backward compatibility.
  const source: "private" | "org" =
    rawSource === "org" ? "org" : "private";

  try {
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO library_items (id, user_id, type, name, description, tags, details, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
        [id, userId, type, name, description, tags, details, source]
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
