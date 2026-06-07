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

  const model = (genAI as any).getGenerativeModel({ model: "gemini-2.0-flash" });

  let instruction = "";
  if (type === "tone") instruction = `Rewrite the following legal text in a ${param} tone.`;
  else if (type === "grammar") instruction = `Fix the spelling and grammar in the following legal text while preserving legal meaning.`;
  else if (type === "extend") instruction = `Expand the following legal clause with more comprehensive protections.`;
  else if (type === "reduce") instruction = `Shorten the following legal clause to its core obligation.`;
  else if (type === "simplify") instruction = `Rewrite the following legal text in plain English for a non-lawyer.`;
  else if (type === "complete") instruction = `Complete the following sentence or clause in a professional legal manner.`;
  else if (type === "ask") instruction = `Follow this custom instruction: ${param}`;

  const prompt = `${instruction}\n\nText:\n${text}\n\nIMPORTANT: Return only the rewritten text without any quotes or preamble.`;

  try {
    const result = await model.generateContent(prompt);
    res.json({ data: result.response.text().trim() });
  } catch (err: any) {
    console.error("Refinement error:", err);
    res.status(500).json({ error: "Clause refinement failed. The engine may be experiencing high latency." });
  }
});

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
    const result = await model.generateContentStream(prompt).catch(streamErr => {
      console.error("LLM Stream start failure in Drafting:", streamErr);
      throw new Error("STREAM_INIT_FAILED");
    });

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }
    res.end();
  } catch (err: any) {
    console.error("Drafting stream error:", err);
    const msg = err.message === "STREAM_INIT_FAILED"
      ? "\n[STREAMING_ERROR]: Drafting engine unreachable."
      : "\n[STREAMING_ERROR]: Connection lost during document synthesis.";

    if (!res.writableEnded) {
      res.write(msg);
      res.end();
    }
  }
});

export default router;
