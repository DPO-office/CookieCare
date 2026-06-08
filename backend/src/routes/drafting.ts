import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();
const orchestrator = new AgentOrchestrator();
const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

router.post("/generate", authenticateToken, async (req: Request, res: Response) => {
  const { draftInput, instructions, detailLevel, jurisdiction } = req.body;
  if (!draftInput && !instructions) return res.status(400).json({ error: "Drafting instructions are required." });

  try {
    const draft = await orchestrator.runDrafting({ draftInput, instructions, detailLevel, jurisdiction });
    res.json({ draft });
  } catch (err: any) {
    console.error("Drafting generation error:", err);
    res.status(500).json({ error: "AI Drafting agent failed to synthesize the document. Please simplify the requirements." });
  }
});

/**
 * SSE-based AI Drafting Generator
 * Streams document content block-by-block.
 */
router.post("/refine", authenticateToken, async (req: Request, res: Response) => {
  const { text, type, param } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  try {
    const job = await addJobToQueue(req.user!.id, "template_drafting", {
      type: "refine",
      text,
      refineType: type,
      param
    });

    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    console.error("Refinement queue error:", err);
    res.status(500).json({ error: "Failed to queue refinement task." });
  }
});

router.post("/generate-stream", authenticateToken, async (req: Request, res: Response) => {
  const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText } = req.body;

  try {
    const job = await addJobToQueue(req.user!.id, "template_drafting", {
      mode,
      outputLevel,
      instructions,
      formFields,
      templateId,
      sourceText,
      playbookText
    });

    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    console.error("Drafting queue error:", err);
    res.status(500).json({ error: "Failed to queue drafting task." });
  }
});

export default router;
