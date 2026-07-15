import {
  executeCompletion,
  executeJsonCompletion,
} from "../modules/drafting/llm/index.js";
import { LLMProvider, LLMTask } from "../modules/drafting/config/model-specs.js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Rich Audit Schema (new)
// ─────────────────────────────────────────────────────────────────────────────

const FindingSchema = z.object({
  id: z.string(),
  clauseTitle: z.string(),
  clauseText: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum([
    "indemnity",
    "liability",
    "termination",
    "ip",
    "confidentiality",
    "payment",
    "compliance",
    "data_protection",
    "governing_law",
    "other",
  ]),
  issue: z.string(),
  whyItMatters: z.string(),
  recommendation: z.string(),
  fallbackPosition: z.string().optional(),
  sourceExcerpt: z.string().optional(),
});

const RichAuditSchema = z.object({
  executiveSummary: z.string(),
  overallRisk: z.enum(["low", "medium", "high"]),
  documentType: z.string().optional(),
  keyTerms: z.object({
    parties: z.array(z.string()).default([]),
    governingLaw: z.string().optional(),
    liabilityCap: z.string().optional(),
    terminationNotice: z.string().optional(),
    paymentTerms: z.array(z.string()).default([]),
    indemnityScope: z.string().optional(),
    confidentialityTerm: z.string().optional(),
  }),
  findings: z.array(FindingSchema),
  missingClauses: z.array(
    z.object({
      clauseName: z.string(),
      reason: z.string(),
      recommendation: z.string(),
    })
  ),
  obligations: z.array(
    z.object({
      party: z.string().optional(),
      obligation: z.string(),
      deadline: z.string().optional(),
      trigger: z.string().optional(),
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
  recommendedRedlines: z.array(
    z.object({
      clauseTitle: z.string(),
      currentIssue: z.string(),
      suggestedRevision: z.string(),
    })
  ),
});

// Public type for the rich audit result
export type RichAuditResult = z.infer<typeof RichAuditSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Backward-compat legacy shape
// Derived from RichAuditResult so DashboardHome.tsx and any other consumer
// that reads  .summary / .risks[].id / .risks[].severity  keeps working.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditResult = RichAuditResult & {
  /** @deprecated use executiveSummary */
  summary: string;
  /** @deprecated use findings */
  risks: Array<{
    id: string;
    clause: string;
    severity: "low" | "medium" | "high";
    risk_level: string;
    reasons: string[];
    description: string;
    actionableInsight: string;
    remediation: string;
  }>;
};

function addLegacyAliases(audit: RichAuditResult): AuditResult {
  return {
    ...audit,
    // Flat alias so existing consumers that read .summary don't break
    summary: audit.executiveSummary,
    // Map findings → risks so DashboardHome.tsx analysis.risks.length still works
    risks: audit.findings.map((f) => ({
      id: f.id,
      clause: f.clauseText ?? f.clauseTitle,
      severity: f.severity,
      risk_level: f.category,
      reasons: [f.whyItMatters],
      description: f.issue,
      actionableInsight: f.recommendation,
      remediation: f.fallbackPosition ?? f.recommendation,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AnalysisAgent
// ─────────────────────────────────────────────────────────────────────────────

export class AnalysisAgent {
  // ── Keep intact: used by interactAnalyze ──────────────────────────────────
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
      return await executeCompletion(
        userPrompt,
        systemPrompt,
        LLMTask.COMPLEX_DRAFT,
        LLMProvider.GEMINI
      );
    } catch (err) {
      console.error("AnalysisAgent.analyzeDocuments error:", err);
      throw err;
    }
  }

  // ── Primary audit method ──────────────────────────────────────────────────
  async runAudit(params: {
    content: string;
    type: string;
    referenceContext?: string;
  }): Promise<AuditResult> {
    const { content, type, referenceContext } = params;

    const referenceSection = referenceContext
      ? `\n\n[REFERENCE CONTEXT FROM RELATED DOCUMENTS]\n${referenceContext}\n`
      : "";

    const systemPrompt = `You are an expert Legal Counsel and Risk Assessment Agent specialising in commercial contract review.

Perform a thorough legal audit for a ${type} document. Your output must be a practical legal review grounded in the actual document text.

Instructions:
- Ground every finding in actual clauses or text present in the document
- Include the verbatim clause text or a short source excerpt wherever possible
- Identify missing standard protections that a commercial agreement of this type should contain
- Provide practical recommendations AND a fallback negotiation position for each finding
- Do not hallucinate clauses, facts, or parties that are not present in the document
- If you cannot determine a value (e.g. governing law not stated), mark it as null or omit it
- Return ONLY a valid JSON object — absolutely no markdown fences, no commentary, no preamble

The JSON must exactly match this schema:
{
  "executiveSummary": "2-4 sentence plain English summary of the document and its key risks",
  "overallRisk": "low | medium | high",
  "documentType": "type of legal document, e.g. NDA, SLA, MSA, Employment Agreement",
  "keyTerms": {
    "parties": ["Party A name", "Party B name"],
    "governingLaw": "jurisdiction or null",
    "liabilityCap": "cap amount/formula or null",
    "terminationNotice": "notice period or null",
    "paymentTerms": ["payment term 1", "payment term 2"],
    "indemnityScope": "brief description or null",
    "confidentialityTerm": "duration or null"
  },
  "findings": [
    {
      "id": "finding_1",
      "clauseTitle": "Short clause name",
      "clauseText": "Verbatim or paraphrased clause text",
      "severity": "low | medium | high",
      "category": "indemnity | liability | termination | ip | confidentiality | payment | compliance | data_protection | governing_law | other",
      "issue": "Specific legal problem with this clause",
      "whyItMatters": "Business/legal consequences if unaddressed",
      "recommendation": "Concrete suggested change",
      "fallbackPosition": "Minimum acceptable negotiation position",
      "sourceExcerpt": "Exact quote from document supporting this finding"
    }
  ],
  "missingClauses": [
    {
      "clauseName": "Name of missing clause",
      "reason": "Why this clause is normally expected in this document type",
      "recommendation": "What to add"
    }
  ],
  "obligations": [
    {
      "party": "Party name or 'Both parties'",
      "obligation": "Description of the obligation",
      "deadline": "Deadline or timeframe if specified",
      "trigger": "Event that triggers the obligation"
    }
  ],
  "complianceGaps": [
    {
      "regulation": "GDPR / CCPA / DPDPA / etc",
      "issue": "Specific gap",
      "severity": "RED | YELLOW | GREEN",
      "remediation": "How to resolve"
    }
  ],
  "recommendedRedlines": [
    {
      "clauseTitle": "Clause to redline",
      "currentIssue": "What is wrong",
      "suggestedRevision": "Proposed replacement language"
    }
  ]
}`;

    const userPrompt = `Document Type Context: ${type}
${referenceSection}
[DOCUMENT TO AUDIT]
${content.substring(0, 14000)}`; // cap to avoid token overflow on very large docs

    try {
      console.log(`[AnalysisAgent] Running rich audit via Gemini (type: ${type}, refContext: ${referenceContext ? "yes" : "no"})`);

      const parsed = await executeJsonCompletion<any>(
        userPrompt,
        systemPrompt,
        {
          type: "object",
          properties: {
            executiveSummary: { type: "string" },
            overallRisk: { type: "string", enum: ["low", "medium", "high"] },
            documentType: { type: "string" },
            keyTerms: {
              type: "object",
              properties: {
                parties: { type: "array", items: { type: "string" } },
                governingLaw: { type: ["string", "null"] },
                liabilityCap: { type: ["string", "null"] },
                terminationNotice: { type: ["string", "null"] },
                paymentTerms: { type: "array", items: { type: "string" } },
                indemnityScope: { type: ["string", "null"] },
                confidentialityTerm: { type: ["string", "null"] },
              },
              required: ["parties", "paymentTerms"],
              additionalProperties: true,
            },
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  clauseTitle: { type: "string" },
                  clauseText: { type: ["string", "null"] },
                  severity: { type: "string", enum: ["low", "medium", "high"] },
                  category: {
                    type: "string",
                    enum: [
                      "indemnity",
                      "liability",
                      "termination",
                      "ip",
                      "confidentiality",
                      "payment",
                      "compliance",
                      "data_protection",
                      "governing_law",
                      "other",
                    ],
                  },
                  issue: { type: "string" },
                  whyItMatters: { type: "string" },
                  recommendation: { type: "string" },
                  fallbackPosition: { type: ["string", "null"] },
                  sourceExcerpt: { type: ["string", "null"] },
                },
                required: ["id", "clauseTitle", "severity", "category", "issue", "whyItMatters", "recommendation"],
                additionalProperties: false,
              },
            },
            missingClauses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  clauseName: { type: "string" },
                  reason: { type: "string" },
                  recommendation: { type: "string" },
                },
                required: ["clauseName", "reason", "recommendation"],
                additionalProperties: false,
              },
            },
            obligations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  party: { type: ["string", "null"] },
                  obligation: { type: "string" },
                  deadline: { type: ["string", "null"] },
                  trigger: { type: ["string", "null"] },
                },
                required: ["obligation"],
                additionalProperties: false,
              },
            },
            complianceGaps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  regulation: { type: "string" },
                  issue: { type: "string" },
                  severity: { type: "string" },
                  remediation: { type: "string" },
                },
                required: ["regulation", "issue", "severity", "remediation"],
                additionalProperties: false,
              },
            },
            recommendedRedlines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  clauseTitle: { type: "string" },
                  currentIssue: { type: "string" },
                  suggestedRevision: { type: "string" },
                },
                required: ["clauseTitle", "currentIssue", "suggestedRevision"],
                additionalProperties: false,
              },
            },
          },
          required: ["executiveSummary", "overallRisk", "keyTerms", "findings", "missingClauses", "obligations", "complianceGaps", "recommendedRedlines"],
          additionalProperties: false,
        },
        LLMTask.STRUCTURAL_JSON,
        LLMProvider.GEMINI
      );

      // Normalise arrays that the model might omit entirely
      parsed.keyTerms = parsed.keyTerms ?? {};
      parsed.keyTerms.parties = Array.isArray(parsed.keyTerms?.parties) ? parsed.keyTerms.parties : [];
      parsed.keyTerms.paymentTerms = Array.isArray(parsed.keyTerms?.paymentTerms) ? parsed.keyTerms.paymentTerms : [];
      parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      parsed.missingClauses = Array.isArray(parsed.missingClauses) ? parsed.missingClauses : [];
      parsed.obligations = Array.isArray(parsed.obligations) ? parsed.obligations : [];
      parsed.complianceGaps = Array.isArray(parsed.complianceGaps) ? parsed.complianceGaps : [];
      parsed.recommendedRedlines = Array.isArray(parsed.recommendedRedlines) ? parsed.recommendedRedlines : [];

      // Ensure each finding has an id
      parsed.findings = parsed.findings.map((f: any, i: number) => ({
        ...f,
        id: f.id || `finding_${i + 1}`,
      }));

      const validated = RichAuditSchema.parse(parsed);
      return addLegacyAliases(validated);
    } catch (err) {
      console.warn(
        "[AnalysisAgent] AI audit failed or schema validation error. Falling back to heuristics.",
        err
      );
      return this.heuristicAudit(content, type);
    }
  }

  // ── Heuristic fallback — returns the full richer shape ───────────────────
  private heuristicAudit(content: string, type: string): AuditResult {
    const findings: RichAuditResult["findings"] = [];
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("liquidated damages")) {
      findings.push({
        id: "h_finding_1",
        clauseTitle: "Liquidated Damages",
        clauseText: "Liquidated damages clause detected",
        severity: "high",
        category: "liability",
        issue: "Liquidated damages clauses can become punitive if not reasonably linked to actual loss.",
        whyItMatters: "Uncapped liability may expose a party to excessive financial penalties disproportionate to actual loss.",
        recommendation: "Negotiate for actual proven damages and establish a reasonable liability cap.",
        fallbackPosition: "Accept liquidated damages only if capped at total contract value.",
        sourceExcerpt: "Liquidated damages clause detected in document.",
      });
    }

    if (
      lowerContent.includes("all intellectual property") ||
      lowerContent.includes("exclusive ownership")
    ) {
      findings.push({
        id: "h_finding_2",
        clauseTitle: "Broad IP Ownership",
        clauseText: "Broad intellectual property ownership language detected",
        severity: "medium",
        category: "ip",
        issue: "The clause may transfer ownership of pre-existing intellectual property without limitation.",
        whyItMatters: "Ambiguous IP assignment can result in loss of background IP and pre-existing technology.",
        recommendation: "Clearly distinguish background IP from newly created deliverables.",
        fallbackPosition: "Limit assignment to project-specific deliverables only.",
        sourceExcerpt: "All intellectual property / exclusive ownership language detected.",
      });
    }

    if (
      lowerContent.includes("terminate immediately") &&
      !lowerContent.includes("notice")
    ) {
      findings.push({
        id: "h_finding_3",
        clauseTitle: "Immediate Termination Without Notice",
        clauseText: "Terminate immediately clause with no notice period detected",
        severity: "medium",
        category: "termination",
        issue: "Immediate termination rights without a notice or cure period create operational disruption risk.",
        whyItMatters: "A party may lose all contractual benefits without an opportunity to remedy a breach.",
        recommendation: "Add a minimum notice period and a cure window before termination becomes effective.",
        fallbackPosition: "Accept 15-day notice minimum with a 10-day cure period.",
        sourceExcerpt: "Terminate immediately language detected without accompanying notice provision.",
      });
    }

    const richResult: RichAuditResult = {
      executiveSummary: `Heuristic audit completed for document type: ${type}. ${findings.length} potential risk indicator(s) were detected based on keyword analysis. A full AI-powered review is recommended.`,
      overallRisk: findings.some((f) => f.severity === "high")
        ? "high"
        : findings.some((f) => f.severity === "medium")
        ? "medium"
        : "low",
      documentType: type,
      keyTerms: {
        parties: [],
        paymentTerms: [],
      },
      findings,
      missingClauses: [],
      obligations: [],
      complianceGaps: [],
      recommendedRedlines: [],
    };

    return addLegacyAliases(richResult);
  }
}
