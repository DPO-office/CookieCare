import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

router.post("/interact", authenticateToken, async (req: Request, res: Response) => {
  const { prompt, documentMode, answerStyle } = req.body;
  const userId = req.user!.id;

  try {
    const analysis = await orchestrator.askLawyer(prompt, userId);
    res.json({
      analysis,
      clauses: [] // In a real scenario, we'd extract specific clauses here
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/remediate", authenticateToken, async (req: Request, res: Response) => {
  // Remediation logic using orchestrator...
  res.json({ success: true });
});

export default router;
