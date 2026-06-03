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
      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: fullPrompt,
      });
      return result.text;
    } catch (err) {
      console.error("AnalysisAgent error:", err);
      throw err;
    }
  }

  async runAudit(content: string, type: string): Promise<any> {
    const systemInstruction = `You are a Risk Assessment Agent trained on enterprise liability guidelines.
Audit the document for:
1. Indemnity Caps
2. IP Ownership
3. Termination
Return JSON: { "summary": "...", "risks": [...], "complianceGaps": [...] }`;

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: content }] }],
        config: { responseMimeType: "application/json", systemInstruction },
      });
      return JSON.parse(result.text);
    } catch (err) {
      console.warn("AI audit failed, falling back to heuristics");
      return this.heuristicAudit(content, type);
    }
  }

  private heuristicAudit(content: string, type: string) {
    const risks = [];
    if (content.toLowerCase().includes("liquidated damages")) {
      risks.push({
        id: "h_risk_1",
        clause: "Liquidated damages clause detected",
        severity: "high",
        risk_level: "CRITICAL",
        reasons: ["Potential uncapped liability"],
        non_compliance_tag: "UNCAPPED_LIABILITY",
        description: "Static penalties can be punitive.",
        actionableInsight: "Negotiate for direct proven damages."
      });
    }
    return {
      summary: "Heuristic audit completed.",
      risks,
      complianceGaps: []
    };
  }
}
