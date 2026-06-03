import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class NegotiationAgent {
  async draftRedline(clauseText: string, riskType: string): Promise<any> {
    const systemInstruction = `You are a Negotiation Agent. Draft a corporate redline alternative.
Return JSON: { "proposedText": "...", "comment": "...", "sideBySide": { "original": "...", "proposed": "...", "differentialHtml": "..." } }`;

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: `Clause: ${clauseText}\nRisk: ${riskType}` }] }],
        config: { responseMimeType: "application/json", systemInstruction },
      });
      return JSON.parse(result.text);
    } catch (err) {
      return {
        proposedText: "Alternative clause text.",
        comment: "Balanced compromise.",
        sideBySide: {
          original: clauseText,
          proposed: "Alternative clause text.",
          differentialHtml: "<div>...</div>"
        }
      };
    }
  }
}
