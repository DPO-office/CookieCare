import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const router = Router();
const orchestrator = new AgentOrchestrator();
const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

router.post("/generate", authenticateToken, async (req: Request, res: Response) => {
  const { draftInput, instructions, detailLevel, jurisdiction } = req.body;
  try {
    const draft = await orchestrator.runDrafting({ draftInput, instructions, detailLevel, jurisdiction });
    res.json({ draft });
  } catch (err: any) {
    res.status(500).json({ error: "Drafting failed" });
  }
});

/**
 * SSE-based AI Drafting Generator
 * Streams document content block-by-block.
 */
router.post("/generate-stream", authenticateToken, async (req: Request, res: Response) => {
  const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const model = (genAI as any).getGenerativeModel({ model: "gemini-2.0-flash" });

  let prompt = `You are an expert legal drafter. Draft a high-fidelity ${mode} document.
  Instructions: ${instructions || 'Follow standard corporate law.'}
  Output Level: ${outputLevel}
  `;

  if (mode === "Basic") {
    prompt += `Fields: ${JSON.stringify(formFields)}`;
  } else if (templateId) {
    prompt += `Template: ${templateId}. Playbook Rules: ${playbookText}`;
  } else if (sourceText) {
    prompt += `Source Text to base response on: ${sourceText}. Fields: ${JSON.stringify(formFields)}`;
  }

  prompt += `\n\nIMPORTANT: Return response in clean Markdown. Start streaming now.`;

  try {
    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }
    res.end();
  } catch (err: any) {
    console.error("Drafting stream error:", err);
    res.write("\n[STREAMING_ERROR]: Internal generation failure.");
    res.end();
  }
});

export default router;
