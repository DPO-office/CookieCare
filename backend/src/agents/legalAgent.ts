import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";
import { semanticSearch } from "../RAG/ragService.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class AgentOrchestrator {
  constructor() {}

  async runAnalysis(documentId: string, content: string, userId: string): Promise<string> {
    const context = await semanticSearch(userId, content, 5);
    const promptText = `[CONTEXT]\n${context.join("\n")}\n\n[DOCUMENT]\n${content}\n\nAnalyze the document for risks and compliance gaps.`;

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-1.5-pro",
        contents: [{ role: "user", parts: [{ text: promptText }] }]
      });
      const analysisText = result.candidates?.[0].content?.parts?.[0].text || "Analysis unavailable.";

      await pool.query(
        "UPDATE files SET analysis = $1 WHERE id = $2 AND creator_id = $3",
        [JSON.stringify({ summary: analysisText }), documentId, userId]
      );

      return analysisText;
    } catch (err) {
      console.error("AI Analysis failed:", err);
      throw err;
    }
  }

  async askLawyer(prompt: string, userId: string): Promise<string> {
    const context = await semanticSearch(userId, prompt, 10);
    const combinedPrompt = `You are a brilliant Senior Corporate Attorney and Regulatory Compliance Advisor.
Answer the user's legal questions with absolute professional precision based on the provided context.

[CONTEXT]
${context.join("\n")}

[QUERY]
${prompt}`;

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-1.5-pro",
        contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
        }
      });

      return result.candidates?.[0].content?.parts?.[0].text || "I am unable to provide legal advice at this moment.";
    } catch (err) {
      console.error("Ask Lawyer failed:", err);
      return "An error occurred while consulting the AI attorney.";
    }
  }
}
