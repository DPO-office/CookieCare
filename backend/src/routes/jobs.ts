import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { pool } from "../config/database.js"; // Pool client import kiya

const router = Router();

// 🚀 Safe Polling Route: Frontend ko humesha proper valid JSON milega!
router.get("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;

    // Database se directly state check karte hain safe side ke liye
    const result = await pool.query("SELECT * FROM jobs WHERE id = $1", [jobId]);

    // Saboot check 1: Agar job database mein mili hi nahi
    if (result.rows.length === 0) {
      return res.status(200).json({ 
        id: jobId,
        status: "queued", 
        progress: 10,
        message: "Initializing worker environment...",
        fallback: true
      });
    }

    // Saboot check 2: Agar job mil gayi, toh poora data bhejo
    const job = result.rows[0];
    return res.status(200).json({
      id: job.id,
      status: job.status || "active",
      progress: job.progress || 50,
      message: job.message || "Scanning tracking scripts...",
      result: job.result || null
    });

  } catch (error) {
    console.error("❌ Error fetching job status:", error);
    // Crash hone par bhi empty response nahi, proper JSON return hoga!
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error during job lookup" 
    });
  }
});

export default router;