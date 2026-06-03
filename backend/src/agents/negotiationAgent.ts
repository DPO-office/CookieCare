import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class NegotiationAgent {
  async runNegotiationSequence(baseContent: string, proposal: string): Promise<string> {
    const prompt = `You are a Lead Contract Negotiator.
Compare the base contract with the proposed changes and isolate mutations/drift.

[BASE CONTRACT]
${baseContent}

[PROPOSAL]
${proposal}

Highlight key changes and their legal implications.`;

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      return result.candidates?.[0].content?.parts?.[0].text || "Negotiation analysis failed.";
    } catch (err) {
      console.error("NegotiationAgent error:", err);
      throw err;
    }
  }
}
