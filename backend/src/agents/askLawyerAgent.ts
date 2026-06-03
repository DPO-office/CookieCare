import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class AskLawyerAgent {
  async resolveQuery(contextChunks: string[], query: string): Promise<string> {
    const context = contextChunks.join("\n\n");
    const prompt = `You are a brilliant AI Lawyer.
Answer the user's question precisely using the provided document context.

[CONTEXT]
${context}

[QUERY]
${query}

IMPORTANT: Return your response in clean, well-structured Markdown format. Use headers, bullet points, and bold text for readability.`;

    try {
      const result = await (genAI as any).getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
      return result.candidates?.[0].content?.parts?.[0].text || "I cannot answer this query right now.";
    } catch (err) {
      console.error("AskLawyerAgent error:", err);
      throw err;
    }
  }
}
