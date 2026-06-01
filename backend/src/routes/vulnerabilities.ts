import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { jobQueue } from "../services/jobQueue.js";

const router = Router();

router.post("/scan-cookie", authenticateToken, async (req: Request, res: Response) => {
  const { url } = req.body;
  const job = jobQueue.enqueue(req.user!.id, "privacy_scanning", { url });
  res.status(202).json({ success: true, job_id: job.id });
});

router.post("/scan-vulnerability", authenticateToken, async (req: Request, res: Response) => {
  const { url } = req.body;
  const job = jobQueue.enqueue(req.user!.id, "vulnerability_scanning", { url });
  res.status(202).json({ success: true, job_id: job.id });
});

export default router;
