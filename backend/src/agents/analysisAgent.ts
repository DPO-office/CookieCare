import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { z } from "zod";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

const AuditSchema = z.object({
  summary: z.string(),
  risks: z.array(z.object({
    id: z.string(),
    clause: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    risk_level: z.string(),
    reasons: z.array(z.string()),
    description: z.string(),
    actionableInsight: z.string(),
    remediation: z.string().optional()
  })),
  complianceGaps: z.array(z.object({
    regulation: z.string(),
    issue: z.string(),
    severity: z.string(),
    remediation: z.string()
  }))
});

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
      return result.response.text();
    } catch (err) {
      console.error("AnalysisAgent error:", err);
      throw err;
    }
  }

  async runAudit(content: string, type: string): Promise<z.infer<typeof AuditSchema>> {
    const systemInstruction = `You are a Risk Assessment Agent trained on enterprise liability guidelines.
Audit the document for:
1. Indemnity Caps
2. IP Ownership
3. Termination

CRITICAL: You must return a valid JSON object matching this schema:
{
  "summary": "High-level audit summary",
  "risks": [{
    "id": "unique_id",
    "clause": "Specific text from document",
    "severity": "low" | "medium" | "high",
    "risk_level": "Tier title",
    "reasons": ["Point 1", "Point 2"],
    "description": "Why this is a risk",
    "actionableInsight": "How to fix it",
    "remediation": "Proposed balanced text"
  }],
  "complianceGaps": [{
    "regulation": "GDPR/CCPA/etc",
    "issue": "Description of gap",
    "severity": "RED/YELLOW/GREEN",
    "remediation": "Steps to resolve"
  }]
}`;

    try {
      const model = (genAI as any).getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: { responseMimeType: "application/json" },
        systemInstruction
      });
      const result = await model.generateContent(`Document Content to Audit:\n${content}`);
      const responseText = result.response.text();

      // Phase 3: Enforce strict structured output with Zod
      const parsed = JSON.parse(responseText);
      return AuditSchema.parse(parsed);
    } catch (err) {
      console.warn("AI audit failed or schema validation error, falling back to heuristics:", err);
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
