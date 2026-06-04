import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { jobQueue } from "../services/jobQueue.js";

const router = Router();

router.post("/scan-cookie", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { url, scanDepth } = req.body;
  
    const job = await jobQueue.add("privacy_scanning", {
      type: "privacy_scanning",
      userId: req.user!.id,
      payload: { url, scanDepth }
    });
    
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Cookie scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue cookie scan" });
  }
});

router.post("/scan-vulnerability", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
  
    const job = await jobQueue.add("vulnerability_scanning", {
      type: "vulnerability_scanning",
      userId: req.user!.id,
      payload: { url }
    });
    
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Vulnerability scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue vulnerability scan" });
  }
});

export default router;