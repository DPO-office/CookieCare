import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

router.post("/interact", authenticateToken, async (req: Request, res: Response) => {
  const { folder_ids, prompt, documentMode, answerStyle, history } = req.body;
  const userId = req.user!.id;

  try {
    const result = await orchestrator.interactAnalyze(
      folder_ids || [],
      prompt,
      userId,
      documentMode,
      answerStyle,
      history
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/remediate", authenticateToken, async (req: Request, res: Response) => {
  // Remediation logic using orchestrator...
  res.json({ success: true });
});

export default router;
