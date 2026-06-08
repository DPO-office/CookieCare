import { Request, Response } from "express";
import { jobRegistry } from "../services/jobQueue.js";
import { pool } from "../config/database.js";

import { withTransaction } from "../utils/dbUtils.js";

export const getJobs = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM jobs WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows;
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM jobs WHERE id = $1", [req.params.id]);
      return rows;
    });
    if (rows.length === 0) {
      return res.status(404).json({ error: "Background task not found." });
    }
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch job details" });
  }
};

export const streamJobs = (req: Request, res: Response) => {
  const userId = req.user!.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const clientId = jobRegistry.addClient(userId, res);

  req.on("close", () => {
    jobRegistry.removeClient(clientId);
  });

  res.write(`data: ${JSON.stringify({ event: "handshake", status: "online" })}\n\n`);
};
