import { Request, Response } from "express";
import { pool } from "../config/database.js";

export const approveUser = async (req: Request, res: Response) => {
  const { userId, role } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ error: "userId and role are required." });
  }

  try {
    await pool.query(
      "UPDATE users SET status = 'APPROVED', role = $1, approved_at = CURRENT_TIMESTAMP WHERE id = $2",
      [role, userId]
    );
    res.json({ success: true, message: "User approved successfully." });
  } catch (error: any) {
    console.error("Admin approval failed:", error);
    res.status(500).json({ error: "Failed to approve user: " + error.message });
  }
};

export const getPendingUsers = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, status, role, created_at FROM users WHERE status = 'PENDING_APPROVAL'"
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
