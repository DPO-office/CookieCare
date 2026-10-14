import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { pool } from "../config/database.js";

const router = Router();

router.get("/:key", authenticateToken, async (req: Request, res: Response) => {
  const { key } = req.params;
  const client = req.dbClient || pool;
  try {
    const { rows } = await client.query("SELECT value FROM system_settings WHERE key = $1", [key]);
    if (rows.length === 0) return res.status(404).json({ error: "Setting not found" });
    res.json(rows[0].value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
