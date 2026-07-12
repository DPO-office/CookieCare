import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();

// POST /api/lawyer/ask
// Frontend sends: { prompt, jurisdiction, outputFormat, webContext, documentIds: string[] }
// documentIds are RAG-indexed file IDs — content is retrieved server-side via searchHybrid().
// No raw document content is accepted or expected from the client.
// Flow: route → addJobToQueue(document_analysis) → executeDocumentAnalysis → askLawyer → searchHybrid → LLM
router.post("/ask", authenticateToken, async (req, res) => {
  try {
    // Accept documentIds (current) with a fallback to documents (legacy field name).
    // Both are treated as string[] of file IDs — never raw document content.
    const { prompt, jurisdiction, outputFormat, webContext, documentIds, documents } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required." });
    }

    const resolvedDocumentIds: string[] = documentIds || documents || [];

    console.log(`[lawyer/ask] Queuing legal_ask job for user ${req.user!.id}, prompt length: ${prompt.length}, documentIds count: ${resolvedDocumentIds.length}`);

    const job = await addJobToQueue(req.user!.id, "document_analysis", {
      type: "legal_ask",
      prompt,
      jurisdiction,
      outputFormat,
      webContext,
      documents: resolvedDocumentIds,
    });

    return res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    console.error("[lawyer/ask] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
