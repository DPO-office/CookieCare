import { openRouterComplete } from "../services/openRouterClient.js";
import { searchHybrid } from "../RAG/ragService.js";
import { z } from "zod";

// ─── Response schema ───────────────────────────────────────────────────────────

const FindingSchema = z.object({
  id: z.string(),
  clause: z.string(),
  status: z.enum(["compliant", "warning", "missing"]),
  severity: z.enum(["low", "medium", "high"]),
  articleReference: z.string().optional(),
  description: z.string(),
  recommendation: z.string(),
});

const RecommendationSchema = z.object({
  category: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  items: z.array(z.string()),
});

const MissingClauseSchema = z.object({
  clauseName: z.string(),
  articleReference: z.string().optional(),
  reason: z.string(),
  recommendation: z.string(),
});

const ScoreBreakdownSchema = z.object({
  article28Compliance: z.number().min(0).max(100),
  processorObligations: z.number().min(0).max(100),
  securityMeasures: z.number().min(0).max(100),
  dataSubjectRights: z.number().min(0).max(100),
  internationalTransfers: z.number().min(0).max(100),
  subprocessorControls: z.number().min(0).max(100),
});

const DPAReviewResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  riskLevel: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  findings: z.array(FindingSchema),
  recommendations: z.array(RecommendationSchema),
  missingClauses: z.array(MissingClauseSchema),
  scoreBreakdown: ScoreBreakdownSchema,
});

export type DPAFinding = z.infer<typeof FindingSchema>;
export type DPARecommendation = z.infer<typeof RecommendationSchema>;
export type DPAMissingClause = z.infer<typeof MissingClauseSchema>;
export type DPAReviewResult = z.infer<typeof DPAReviewResultSchema>;

// ─── DPA-specific retrieval query ─────────────────────────────────────────────

const DPA_RETRIEVAL_QUERY =
  "GDPR Article 28 data processing agreement processor controller " +
  "subprocessor obligations security measures technical organisational " +
  "international transfers standard contractual clauses data subject rights " +
  "audit rights incident notification data retention deletion";

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a GDPR expert and Data Protection Officer specialising in Data Processing Agreement (DPA) compliance reviews.

Perform a thorough compliance audit of the provided DPA document against GDPR requirements, primarily GDPR Article 28 and related provisions.

Evaluate the following dimensions:
1. GDPR Article 28 compliance (controller/processor relationship, mandatory provisions)
2. Processor obligations (processing instructions, confidentiality, security, sub-processors)
3. Security measures (Article 32 — technical and organisational measures)
4. Data subject rights (assistance obligations, timelines)
5. International transfers (Chapter V GDPR — SCCs, adequacy decisions, BCRs)
6. Sub-processor controls (authorisation, notice period, flow-down obligations)
7. Audit rights (scope, notice period, cost allocation)
8. Data retention and deletion (end-of-contract obligations, timelines)
9. Incident notification (Article 33/34 — timelines, content requirements)
10. Missing mandatory clauses

═══════════════════════════════════════════════
OUTPUT FORMAT — FOLLOW THIS EXACTLY
═══════════════════════════════════════════════

You MUST return a single raw JSON object with EXACTLY these 7 top-level keys:
  overallScore, riskLevel, summary, findings, recommendations, missingClauses, scoreBreakdown

STRICT RULES:
- Return ONLY the JSON object. No markdown fences, no prose, no commentary before or after.
- Do NOT use any other field names. Forbidden alternatives:
    ✗ compliantProvisions  → use findings[] with status "compliant"
    ✗ warnings             → use findings[] with status "warning"
    ✗ issues               → use findings[]
    ✗ missingClauses as strings → missingClauses MUST be objects (see schema below)
- Every finding goes into the "findings" array regardless of its status.
- "missingClauses" must be an array of OBJECTS, never an array of strings.
- Ground every finding in the actual document text. Do NOT invent provisions.

EXACT SCHEMA (copy field names character-for-character):

{
  "overallScore": <integer 0–100>,
  "riskLevel": <"low" | "medium" | "high">,
  "summary": "<2–4 sentence executive summary>",
  "findings": [
    {
      "id": "finding_1",
      "clause": "<short clause name>",
      "status": <"compliant" | "warning" | "missing">,
      "severity": <"low" | "medium" | "high">,
      "articleReference": "<e.g. Art. 28 GDPR>",
      "description": "<what was found or not found>",
      "recommendation": "<concrete actionable recommendation>"
    }
  ],
  "recommendations": [
    {
      "category": "<category name>",
      "priority": <"critical" | "high" | "medium" | "low">,
      "items": ["<item 1>", "<item 2>"]
    }
  ],
  "missingClauses": [
    {
      "clauseName": "<name of missing clause>",
      "articleReference": "<relevant GDPR article>",
      "reason": "<why this clause is mandatory>",
      "recommendation": "<exact language or approach to add>"
    }
  ],
  "scoreBreakdown": {
    "article28Compliance": <0–100>,
    "processorObligations": <0–100>,
    "securityMeasures": <0–100>,
    "dataSubjectRights": <0–100>,
    "internationalTransfers": <0–100>,
    "subprocessorControls": <0–100>
  }
}

REMINDER: Output the JSON object only. No text before or after it.`;

// ─── Agent class ───────────────────────────────────────────────────────────────

/**
 * Normalize a raw LLM response object into the shape expected by DPAReviewResultSchema.
 *
 * Models sometimes return a legacy / alternative shape:
 *   - compliantProvisions[]  → findings[] with status "compliant"
 *   - warnings[]             → findings[] with status "warning"
 *   - missingClauses[]       as bare strings instead of objects
 *   - issues[]               → findings[] (status inferred from content)
 *   - missing top-level keys → safe defaults
 *
 * Returns { normalized: object, changed: boolean } so the caller can log
 * whether normalization was actually needed.
 */
function normalizeLLMOutput(raw: any): { normalized: any; changed: boolean } {
  let changed = false;
  const out: any = { ...raw };

  // ── 1. Merge legacy flat arrays into findings[] ──────────────────────────

  const findings: any[] = Array.isArray(out.findings) ? [...out.findings] : [];

  // compliantProvisions[] → findings with status "compliant"
  if (Array.isArray(out.compliantProvisions) && out.compliantProvisions.length > 0) {
    changed = true;
    out.compliantProvisions.forEach((item: any, i: number) => {
      if (typeof item === "string") {
        findings.push({
          id: `norm_compliant_${i + 1}`,
          clause: item,
          status: "compliant",
          severity: "low",
          description: item,
          recommendation: "No action required — provision is compliant.",
        });
      } else if (item && typeof item === "object") {
        findings.push({
          id: item.id ?? `norm_compliant_${i + 1}`,
          clause: item.clause ?? item.name ?? item.title ?? "Compliant Provision",
          status: "compliant",
          severity: item.severity ?? "low",
          articleReference: item.articleReference ?? item.article ?? undefined,
          description: item.description ?? item.text ?? item.clause ?? "",
          recommendation: item.recommendation ?? "No action required — provision is compliant.",
        });
      }
    });
    delete out.compliantProvisions;
  }

  // warnings[] → findings with status "warning"
  if (Array.isArray(out.warnings) && out.warnings.length > 0) {
    changed = true;
    out.warnings.forEach((item: any, i: number) => {
      if (typeof item === "string") {
        findings.push({
          id: `norm_warning_${i + 1}`,
          clause: item,
          status: "warning",
          severity: "medium",
          description: item,
          recommendation: "Review and strengthen this provision to meet GDPR requirements.",
        });
      } else if (item && typeof item === "object") {
        findings.push({
          id: item.id ?? `norm_warning_${i + 1}`,
          clause: item.clause ?? item.name ?? item.title ?? "Warning",
          status: "warning",
          severity: item.severity ?? "medium",
          articleReference: item.articleReference ?? item.article ?? undefined,
          description: item.description ?? item.text ?? item.clause ?? "",
          recommendation: item.recommendation ?? "Review and strengthen this provision to meet GDPR requirements.",
        });
      }
    });
    delete out.warnings;
  }

  // issues[] → findings (infer status from content if possible)
  if (Array.isArray(out.issues) && out.issues.length > 0) {
    changed = true;
    out.issues.forEach((item: any, i: number) => {
      if (typeof item === "string") {
        findings.push({
          id: `norm_issue_${i + 1}`,
          clause: item,
          status: "warning",
          severity: "medium",
          description: item,
          recommendation: "Address this issue to improve GDPR compliance.",
        });
      } else if (item && typeof item === "object") {
        findings.push({
          id: item.id ?? `norm_issue_${i + 1}`,
          clause: item.clause ?? item.name ?? item.title ?? "Issue",
          status: item.status ?? "warning",
          severity: item.severity ?? "medium",
          articleReference: item.articleReference ?? item.article ?? undefined,
          description: item.description ?? item.text ?? "",
          recommendation: item.recommendation ?? "Address this issue to improve GDPR compliance.",
        });
      }
    });
    delete out.issues;
  }

  // Ensure all findings have required string fields and a valid id
  out.findings = findings.map((f: any, i: number) => ({
    ...f,
    id: f.id || `finding_${i + 1}`,
    clause: f.clause || "Unknown Clause",
    status: ["compliant", "warning", "missing"].includes(f.status) ? f.status : "warning",
    severity: ["low", "medium", "high"].includes(f.severity) ? f.severity : "medium",
    description: f.description || "",
    recommendation: f.recommendation || "",
  }));

  // ── 2. Normalise missingClauses — convert string items to objects ────────

  if (Array.isArray(out.missingClauses) && out.missingClauses.length > 0) {
    const normalised = out.missingClauses.map((item: any, i: number) => {
      if (typeof item === "string") {
        changed = true;
        return {
          clauseName: item,
          articleReference: undefined,
          reason: `This provision is mandatory under GDPR for a valid DPA.`,
          recommendation: `Add an explicit clause addressing: ${item}`,
        };
      }
      // Object but might use different field names
      if (item && typeof item === "object") {
        const normalized: any = {
          clauseName: item.clauseName ?? item.name ?? item.clause ?? item.title ?? "Unknown Clause",
          reason: item.reason ?? item.description ?? item.text ?? "This provision is mandatory under GDPR.",
          recommendation: item.recommendation ?? item.action ?? "Add the missing clause.",
        };
        if (item.articleReference ?? item.article ?? item.gdprArticle) {
          normalized.articleReference = item.articleReference ?? item.article ?? item.gdprArticle;
        }
        // Check if any remapping actually happened
        if (!item.clauseName || !item.reason || !item.recommendation) changed = true;
        return normalized;
      }
      changed = true;
      return {
        clauseName: String(item),
        reason: "This provision is mandatory under GDPR for a valid DPA.",
        recommendation: `Add an explicit clause addressing: ${String(item)}`,
      };
    });
    out.missingClauses = normalised;
  } else {
    out.missingClauses = Array.isArray(out.missingClauses) ? out.missingClauses : [];
  }

  // ── 3. Ensure recommendations[] is present ───────────────────────────────

  if (!Array.isArray(out.recommendations)) {
    out.recommendations = [];
    changed = true;
  }

  // ── 4. Ensure scoreBreakdown is present with all required keys ───────────

  const defaultBreakdown = {
    article28Compliance: 50,
    processorObligations: 50,
    securityMeasures: 50,
    dataSubjectRights: 50,
    internationalTransfers: 50,
    subprocessorControls: 50,
  };

  if (!out.scoreBreakdown || typeof out.scoreBreakdown !== "object") {
    out.scoreBreakdown = defaultBreakdown;
    changed = true;
  } else {
    // Fill in any missing sub-keys
    for (const key of Object.keys(defaultBreakdown) as Array<keyof typeof defaultBreakdown>) {
      if (typeof out.scoreBreakdown[key] !== "number") {
        out.scoreBreakdown[key] = defaultBreakdown[key];
        changed = true;
      }
    }
  }

  // ── 5. Ensure overallScore and riskLevel are present ────────────────────

  if (typeof out.overallScore !== "number") {
    out.overallScore = 50;
    changed = true;
  }

  if (!["low", "medium", "high"].includes(out.riskLevel)) {
    out.riskLevel = out.overallScore >= 70 ? "low" : out.overallScore >= 40 ? "medium" : "high";
    changed = true;
  }

  if (typeof out.summary !== "string" || out.summary.trim() === "") {
    out.summary = "DPA compliance review completed. Manual verification is recommended.";
    changed = true;
  }

  return { normalized: out, changed };
}

export class DPAReviewAgent {
  /**
   * Review a DPA document.
   * @param documentText  Extracted plaintext of the DPA
   * @param userId        User ID — used to scope RAG retrieval
   * @param fileId        Optional file ID — used to retrieve indexed chunks from this doc
   */
  async reviewDPA(
    documentText: string,
    userId: string,
    fileId?: string
  ): Promise<DPAReviewResult> {
    console.log(
      `[DPAReviewAgent] reviewDPA called — userId=${userId} fileId=${fileId ?? "(none — ephemeral upload)"} documentText length=${documentText.length}`
    );

    // 1. Retrieve RAG chunks ONLY when we have a specific fileId to scope the search.
    //    Without a fileId the search would fall back to the user's entire knowledge base,
    //    returning unrelated documents and causing the LLM to analyse the wrong content.
    let ragContext = "";
    if (fileId) {
      try {
        const chunks = await searchHybrid(
          DPA_RETRIEVAL_QUERY,
          userId,
          [fileId]
        );

        // Guard: only accept chunks that actually belong to the requested file.
        // The last-resort fallback inside searchHybrid may return chunks from
        // other documents when the target file has no indexed content yet.
        const ownChunks = chunks.filter((c) => c.file_id === fileId);
        const foreignChunks = chunks.filter((c) => c.file_id !== fileId);

        if (foreignChunks.length > 0) {
          console.warn(
            `[DPAReviewAgent] Discarding ${foreignChunks.length} chunk(s) from unrelated files: ` +
              foreignChunks.map((c) => c.title ?? c.file_id).join(", ")
          );
        }

        if (ownChunks.length > 0) {
          ragContext = ownChunks
            .map((c) => `[${c.title ?? "DPA Document"}]\n${c.content}`)
            .join("\n\n");
          console.log(
            `[DPAReviewAgent] Using ${ownChunks.length} RAG chunk(s) from the uploaded file for context`
          );
        } else {
          console.log(
            `[DPAReviewAgent] No indexed chunks found for fileId=${fileId} — falling back to raw document text`
          );
        }
      } catch (ragErr) {
        console.warn(
          "[DPAReviewAgent] RAG retrieval failed, continuing with raw text only:",
          (ragErr as Error).message
        );
      }
    } else {
      console.log(
        "[DPAReviewAgent] No fileId provided — skipping RAG to avoid returning chunks from unrelated documents"
      );
    }

    // 2. Compose the user prompt.
    //    Use RAG chunks only when they came from the specific uploaded file.
    //    Otherwise use the raw extracted document text (capped to avoid token overflow).
    const usingRag = ragContext.length > 0;
    const documentContext = usingRag
      ? ragContext
      : documentText.substring(0, 14000);

    console.log(
      `[DPAReviewAgent] Context source: ${usingRag ? "RAG chunks from uploaded file" : "raw document text"} — ${documentContext.length} chars`
    );

    const userPrompt = `[DPA DOCUMENT]
${documentContext}

Review the above Data Processing Agreement for GDPR compliance. Identify all compliant provisions, warnings, and missing mandatory clauses. Return only the structured JSON as specified.`;

    // 3. Call OpenRouter
    let responseText: string;
    try {
      console.log(
        `[DPAReviewAgent] Calling OpenRouter — context length: ${documentContext.length} chars`
      );
      responseText = await openRouterComplete(SYSTEM_PROMPT, userPrompt, {
        jsonMode: true,
        temperature: 0.2,
      });
    } catch (llmErr) {
      console.error("[DPAReviewAgent] OpenRouter call failed:", llmErr);
      throw llmErr;
    }

    // 4. Parse and validate
    responseText = responseText.trim();

    console.log(
      `[DPAReviewAgent] Raw LLM response (${responseText.length} chars):\n` +
        responseText.substring(0, 3000) +
        (responseText.length > 3000
          ? `\n...[truncated, total ${responseText.length} chars]`
          : "")
    );

    // Strip accidental markdown fences from some models
    if (responseText.startsWith("```")) {
      responseText = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn(
        "[DPAReviewAgent] JSON parse failed — raw text was:\n",
        responseText.substring(0, 1000),
        "\nError:",
        (parseErr as Error).message
      );
      return this.heuristicFallback(documentText);
    }

    // ── Normalize: convert legacy shapes into the expected schema ───────────
    // Handles: compliantProvisions[], warnings[], issues[], string missingClauses[],
    // missing top-level keys, and alternative field names.
    const { normalized, changed } = normalizeLLMOutput(parsed);
    if (changed) {
      console.log(
        "[DPAReviewAgent] Normalization applied — LLM used a non-standard shape. " +
          "Keys present in raw response: " +
          Object.keys(parsed).join(", ")
      );
    } else {
      console.log("[DPAReviewAgent] No normalization needed — LLM output matched expected schema");
    }

    // Log the normalized object so we can see exactly what Zod is validating
    console.log(
      "[DPAReviewAgent] Normalized object (pre-Zod):",
      JSON.stringify(normalized, null, 2).substring(0, 4000)
    );

    try {
      return DPAReviewResultSchema.parse(normalized);
    } catch (validationErr) {
      console.warn(
        "[DPAReviewAgent] Zod validation failed after normalization. Errors:\n",
        JSON.stringify((validationErr as any)?.errors ?? validationErr, null, 2)
      );
      return this.heuristicFallback(documentText);
    }
  }

  // ── Heuristic fallback — returns a minimal but valid result shape ──────────
  private heuristicFallback(content: string): DPAReviewResult {
    const lower = content.toLowerCase();

    const findings: DPAFinding[] = [];

    if (lower.includes("article 28") || lower.includes("art. 28")) {
      findings.push({
        id: "h_1",
        clause: "Article 28 Compliance",
        status: "compliant",
        severity: "low",
        articleReference: "Art. 28 GDPR",
        description: "The document contains references to GDPR Article 28 processor relationship provisions.",
        recommendation: "Verify all mandatory Article 28(3) sub-clauses are explicitly addressed.",
      });
    } else {
      findings.push({
        id: "h_1",
        clause: "Article 28 Compliance",
        status: "missing",
        severity: "high",
        articleReference: "Art. 28 GDPR",
        description: "No explicit reference to GDPR Article 28 was detected in the document.",
        recommendation: "Add an explicit Article 28 compliance section covering all mandatory provisions.",
      });
    }

    if (!lower.includes("sub-processor") && !lower.includes("subprocessor")) {
      findings.push({
        id: "h_2",
        clause: "Sub-Processor Controls",
        status: "missing",
        severity: "high",
        articleReference: "Art. 28(2) GDPR",
        description: "No sub-processor authorisation or notification mechanism was detected.",
        recommendation: "Add a clause requiring prior written consent and 30-day notice for new sub-processors.",
      });
    }

    if (!lower.includes("international transfer") && !lower.includes("standard contractual")) {
      findings.push({
        id: "h_3",
        clause: "International Transfers",
        status: "missing",
        severity: "high",
        articleReference: "Art. 44-49 GDPR",
        description: "No international transfer provisions or SCCs were detected.",
        recommendation: "Add a clause specifying the legal basis for any transfers outside the EEA.",
      });
    }

    const compliantCount = findings.filter((f) => f.status === "compliant").length;
    const overallScore = Math.round((compliantCount / Math.max(findings.length, 1)) * 60);

    return {
      overallScore,
      riskLevel: overallScore >= 70 ? "low" : overallScore >= 40 ? "medium" : "high",
      summary:
        "Heuristic analysis completed. A full AI-powered review could not be generated. " +
        "The document was scanned for key GDPR provisions using keyword analysis. Manual review is strongly recommended.",
      findings,
      recommendations: [
        {
          category: "Immediate Actions",
          priority: "critical",
          items: [
            "Conduct a full manual DPA review against GDPR Article 28 requirements.",
            "Ensure all mandatory processor obligations are explicitly addressed.",
          ],
        },
      ],
      missingClauses: findings
        .filter((f) => f.status === "missing")
        .map((f) => ({
          clauseName: f.clause,
          articleReference: f.articleReference,
          reason: `This provision is mandatory under ${f.articleReference ?? "GDPR"} for a valid DPA.`,
          recommendation: f.recommendation,
        })),
      scoreBreakdown: {
        article28Compliance: lower.includes("article 28") ? 60 : 0,
        processorObligations: lower.includes("processor") ? 50 : 20,
        securityMeasures: lower.includes("security") ? 50 : 20,
        dataSubjectRights: lower.includes("data subject") ? 50 : 20,
        internationalTransfers: lower.includes("transfer") ? 40 : 0,
        subprocessorControls: lower.includes("sub-processor") ? 50 : 0,
      },
    };
  }
}
