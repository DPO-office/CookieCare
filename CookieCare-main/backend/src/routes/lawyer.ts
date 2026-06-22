import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();

// POST /api/lawyer/ask
// AskAILawyer.tsx sends: { prompt, jurisdiction, outputFormat, webContext, documents }
// It checks for status 202 + job_id, then polls SSE for job.result.text
// The job executor path is: executeDocumentAnalysis → payload.type === "legal_ask"
router.post("/ask", authenticateToken, async (req, res) => {
  try {
    const { prompt, jurisdiction, outputFormat, webContext, documents, documentIds } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required." });
    }

    console.log(`[lawyer/ask] Queuing legal_ask job for user ${req.user!.id}, prompt: "${prompt.substring(0, 80)}..."`);

    const job = await addJobToQueue(req.user!.id, "document_analysis", {
      type: "legal_ask",
      prompt,
      jurisdiction,
      outputFormat,
      webContext,
      documents: documentIds || documents || [],
    });

    return res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    console.error("[lawyer/ask] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
