import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

router.post("/remediate", authenticateToken, async (req: Request, res: Response) => {
  const { clauseText, riskType } = req.body;
  try {
    const result = await orchestrator.remediate(clauseText, riskType);
    res.json(result);
  } catch (err: any) {
    console.error("Remediation route error:", err);
    res.status(500).json({ error: "Remediation failed" });
  }
});

router.post("/interact", authenticateToken, async (req: Request, res: Response) => {
  const { 
    folderIds = [], 
    prompt, 
    documentMode = "unified", 
    answerStyle = "narrative", 
    history = [] 
  } = req.body;

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "User session not found or invalid." });
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ error: "Prompt is required and cannot be empty." });
  }

  try {
    const job = await addJobToQueue(req.user.id, "document_analysis", {
      folderIds,
      prompt,
      documentMode,
      answerStyle,
      history
    });
    
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    console.error("Interact analyze queue error:", err);
    res.status(500).json({ error: "Failed to queue analysis job." });
  }
});

export default router;