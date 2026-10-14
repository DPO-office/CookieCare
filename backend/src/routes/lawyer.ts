import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { jobRegistry } from "../services/jobQueue.js";

const router = Router();

// POST /api/lawyer/ask
// Synchronous direct call — no job queue, no SSE polling.
// Body: { prompt, fileIds?: string[], history?: { role, text }[] }
// Returns: { text, sources }
router.post("/ask", authenticateToken, async (req, res) => {
  try {
    const { prompt, fileIds, history } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required." });
    }

    const resolvedFileIds: string[] = Array.isArray(fileIds) ? fileIds : [];
    const resolvedHistory: Array<{ role: "user" | "assistant"; text: string }> =
      Array.isArray(history) ? history : [];

    const result = await jobRegistry.orchestrator.askLawyer(
      prompt,
      req.user!.id,
      resolvedFileIds,
      [],         // jurisdictions — not used for now
      undefined,  // outputFormat — not used for now
      resolvedHistory
    );

    return res.json({ text: result.text, sources: result.sources || [] });
  } catch (err: any) {
    console.error("[lawyer/ask] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
