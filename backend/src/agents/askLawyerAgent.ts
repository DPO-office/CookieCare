import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey || "dummy");

export class AskLawyerAgent {
  async getAdvice(prompt: string, context: string): Promise<string> {
    const fullPrompt = `You are a Senior Legal Counsel at PrivSecAI. Provide professional legal advice based on the provided document context.

[INSTRUCTIONS]
1. Use ONLY the provided [CONTEXT] to answer.
2. You MUST cite your sources for every claim. Use the format: [Source Index].
3. If multiple sources support a claim, use: [Source 1, Source 3].
4. If the information is not in the context, clearly state that the provided documents do not contain the answer.
5. Maintain a formal, authoritative, yet accessible legal tone.

[CONTEXT]
${context}

[USER QUERY]
${prompt}

IMPORTANT: Return your response in clean Markdown format with explicit citations. An answer without a source citation is considered a bug.`;

    try {
      const result = await genAI.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }]
      });
      return result.response.text() || "I cannot answer this query right now.";
    } catch (err) {
      console.error("AskLawyerAgent error:", err);
      throw err;
    }
  }
}
