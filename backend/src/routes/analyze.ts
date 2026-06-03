import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";

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
  // Destructuring ke waqt hi safe default values fallback de di hain
  const { 
    folderIds = [], 
    prompt, 
    documentMode = "unified", 
    answerStyle = "narrative", 
    history = [] 
  } = req.body;

  // Pehle hi check kar lo ki user authenticated hai aur prompt khali nahi hai
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "User session not found or invalid." });
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ error: "Prompt is required and cannot be empty." });
  }

  const userId = req.user.id;

  try {
    const result = await orchestrator.interactAnalyze(
      folderIds,
      prompt,
      userId,
      documentMode,
      answerStyle,
      history
    );
    res.json(result);
  } catch (err: any) {
    console.error("Interact analyze error in route:", err);
    
    // Agar agent se "No documents found" ka explicit error aaye toh 444/404 bhej sakte ho, 
    // nahi toh standard 500 error handle karein
    if (err.message && err.message.includes("No documents found")) {
      return res.status(404).json({ error: err.message });
    }
    
    res.status(500).json({ error: "Internal server error during document analysis." });
  }
});

export default router;