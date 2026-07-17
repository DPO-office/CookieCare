import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

router.post("/interact", authenticateToken, async (req, res) => {
  try {
    const { folderIds, fileIds, draftIds, prompt, documentMode, answerStyle, history } = req.body;
    const job = await addJobToQueue(req.user!.id, "document_analysis", {
      folderIds: Array.isArray(folderIds) ? folderIds : [],
      fileIds: Array.isArray(fileIds) ? fileIds : [],
      draftIds: Array.isArray(draftIds) ? draftIds : [],
      prompt,
      documentMode,
      answerStyle,
      history: Array.isArray(history) ? history : []
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/remediate", authenticateToken, async (req, res) => {
  try {
    const { documentId, content } = req.body;
    const result = await orchestrator.remediate(documentId, content, req.user!.id, req.user!.role);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
