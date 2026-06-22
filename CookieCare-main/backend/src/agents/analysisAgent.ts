import { openRouterComplete } from "../services/openRouterClient.js";
import { z } from "zod";

const AuditSchema = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      id: z.string(),
      clause: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      risk_level: z.string(),
      reasons: z.array(z.string()),
      description: z.string(),
      actionableInsight: z.string(),
      remediation: z.string().optional(),
    })
  ),
  complianceGaps: z.array(
    z.object({
      regulation: z.string(),
      issue: z.string(),
      severity: z.string(),
      remediation: z.string(),
    })
  ),
});

export class AnalysisAgent {
  async analyzeDocuments(
    contents: string[],
    prompt: string
  ): Promise<string> {
    const combinedContent = contents.join("\n\n---\n\n");

    const systemPrompt = `You are a Senior Compliance Officer.

Identify:
- Critical liability risks
- Compliance gaps
- Regulatory concerns
- Suggested remediation actions

IMPORTANT:
Return your response in clean, well-structured Markdown format.
Use headers, bullet points, and bold text for readability.`;

    const userPrompt = `Analyze the following document(s) and address this query:

${prompt}

[DOCUMENTS]
${combinedContent}`;

    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("AnalysisAgent error:", err);
      throw err;
    }
  }

  async runAudit(
    content: string,
    type: string
  ): Promise<z.infer<typeof AuditSchema>> {
    const systemPrompt = `You are a Risk Assessment Agent trained on enterprise liability guidelines.

Audit the document for:
1. Indemnity Caps
2. IP Ownership
3. Termination Rights
4. Liability Exposure
5. Compliance Risks
6. Regulatory Gaps

Audit Type: ${type}

CRITICAL:
You must return ONLY a valid JSON object — no markdown fences, no commentary.
The JSON must exactly match this schema:

{
  "summary": "High-level audit summary",
  "risks": [
    {
      "id": "unique_id",
      "clause": "Specific clause text",
      "severity": "low | medium | high",
      "risk_level": "Tier title",
      "reasons": ["Reason 1", "Reason 2"],
      "description": "Risk explanation",
      "actionableInsight": "Recommended action",
      "remediation": "Balanced replacement wording"
    }
  ],
  "complianceGaps": [
    {
      "regulation": "GDPR/CCPA/etc",
      "issue": "Gap description",
      "severity": "RED/YELLOW/GREEN",
      "remediation": "How to resolve"
    }
  ]
}`;

    const userPrompt = `Document Content to Audit:\n\n${content}`;

    try {
      let responseText = await openRouterComplete(systemPrompt, userPrompt, {
        jsonMode: true,
      });

      responseText = responseText.trim();

      // Strip markdown fences if the model accidentally returns them
      if (responseText.startsWith("```")) {
        responseText = responseText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
      }

      const parsed = JSON.parse(responseText);

      // Backward compatibility — normalise remediation field name
      if (parsed.risks && Array.isArray(parsed.risks)) {
        parsed.risks = parsed.risks.map((risk: any) => ({
          ...risk,
          remediation:
            risk.remediation ||
            risk.reremediation ||
            "No remediation provided.",
        }));
      }

      return AuditSchema.parse(parsed);
    } catch (err) {
      console.warn(
        "AI audit failed or schema validation error. Falling back to heuristics.",
        err
      );
      return this.heuristicAudit(content, type);
    }
  }

  private heuristicAudit(
    content: string,
    type: string
  ): z.infer<typeof AuditSchema> {
    const risks: z.infer<typeof AuditSchema>["risks"] = [];
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("liquidated damages")) {
      risks.push({
        id: "h_risk_1",
        clause: "Liquidated damages clause detected",
        severity: "high",
        risk_level: "CRITICAL",
        reasons: [
          "Potential uncapped liability",
          "May expose parties to excessive penalties",
        ],
        description:
          "Liquidated damages clauses can become punitive if not reasonably linked to actual loss.",
        actionableInsight:
          "Negotiate for actual proven damages and establish liability caps.",
        remediation:
          "Replace liquidated damages with direct, proven damages subject to an agreed liability cap.",
      });
    }

    if (
      lowerContent.includes("all intellectual property") ||
      lowerContent.includes("exclusive ownership")
    ) {
      risks.push({
        id: "h_risk_2",
        clause: "Broad IP ownership language detected",
        severity: "medium",
        risk_level: "IMPORTANT",
        reasons: [
          "Potential loss of ownership rights",
          "Ambiguous IP assignment scope",
        ],
        description:
          "The clause may transfer ownership of pre-existing intellectual property.",
        actionableInsight:
          "Clearly distinguish background IP from newly created deliverables.",
        remediation:
          "Limit assignment to project deliverables and retain ownership of pre-existing IP.",
      });
    }

    if (
      lowerContent.includes("terminate immediately") &&
      !lowerContent.includes("notice")
    ) {
      risks.push({
        id: "h_risk_3",
        clause: "Immediate termination without notice",
        severity: "medium",
        risk_level: "WARNING",
        reasons: ["No cure period", "Operational disruption risk"],
        description:
          "Immediate termination rights without notice may create business continuity risks.",
        actionableInsight:
          "Add notice and cure periods before termination.",
        remediation:
          "Require at least 30 days' written notice and a cure period before termination.",
      });
    }

    return {
      summary: `Heuristic audit completed for document type: ${type}.`,
      risks,
      complianceGaps: [],
    };
  }
}
