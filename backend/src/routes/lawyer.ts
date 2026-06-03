import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

router.post("/ask", authenticateToken, async (req: Request, res: Response) => {
  const { prompt } = req.body;
  const userId = req.user!.id;

  try {
    const result = await orchestrator.askLawyer(prompt, userId);
    res.json({ answer: result });
  } catch (err: any) {
    console.error("Lawyer query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
