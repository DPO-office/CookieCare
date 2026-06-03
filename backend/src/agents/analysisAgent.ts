import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class AnalysisAgent {
  async analyzeDocuments(contents: string[], prompt: string): Promise<string> {
    const combinedContent = contents.join("\n\n---\n\n");
    const fullPrompt = `You are a Senior Compliance Officer.
Analyze the following document(s) and address this query: ${prompt}

[DOCUMENTS]
${combinedContent}

Identify critical liability risks, compliance gaps, and regulatory concerns.
IMPORTANT: Return your response in clean, well-structured Markdown format. Use headers, bullet points, and bold text for readability.`;

    try {
      const result = await (genAI as any).getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(fullPrompt);
      return result.candidates?.[0].content?.parts?.[0].text || "Analysis failed.";
    } catch (err) {
      console.error("AnalysisAgent error:", err);
      throw err;
    }
  }
}
