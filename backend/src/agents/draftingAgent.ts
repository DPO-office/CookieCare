import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class DraftingAgent {
  async draftDocument(inputs: any): Promise<string> {
    const { draftInput, instructions, detailLevel, jurisdiction } = inputs;
    const prompt = `You are an expert legal drafter.
Draft a legal document based on the following:
Input: ${draftInput}
Instructions: ${instructions}
Detail Level: ${detailLevel}
Jurisdiction: ${jurisdiction || 'International'}

Provide a high-fidelity, professional legal draft.
IMPORTANT: Return your response in clean, well-structured Markdown format. Use headers, bullet points, and bold text for readability.`;

    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      return response.text || "Drafting failed.";
    } catch (err) {
      console.error("DraftingAgent error:", err);
      throw err;
    }
  }
}