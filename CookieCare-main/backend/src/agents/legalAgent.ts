import { AnalysisAgent } from "./analysisAgent.js";
import { DraftingAgent } from "./draftingAgent.js";
import { NegotiationAgent } from "./negotiationAgent.js";
import { AskLawyerAgent } from "./askLawyerAgent.js";
import { DPAReviewAgent, type DPAReviewResult } from "./dpaReviewAgent.js";
import { VendorReviewAgent, type VendorReviewResult } from "./vendorReviewAgent.js";
import { AIEthicsAgent, type AIEthicsResult } from "./aiEthicsAgent.js";
import { pool } from "../config/database.js";
import { searchHybrid } from "../RAG/ragService.js";
import { openRouterComplete } from "../services/openRouterClient.js";
import type { WebsiteScanResult } from "../services/websiteScanner/types.js";

// Broad query used to pull relevant reference chunks from related folders
const REFERENCE_RETRIEVAL_QUERY =
  "indemnity liability limitation of liability termination IP confidentiality " +
  "data protection governing law payment obligations compliance missing clauses";

export class AgentOrchestrator {
  public analysisAgent = new AnalysisAgent();
  public draftingAgent = new DraftingAgent();
  public negotiationAgent = new NegotiationAgent();
  public askLawyerAgent = new AskLawyerAgent();
  public dpaReviewAgent = new DPAReviewAgent();
  public vendorReviewAgent = new VendorReviewAgent();
  public aiEthicsAgent = new AIEthicsAgent();
  // analysis agreement
  async runAnalysis(
    documentId: string,
    content: string,
    userId: string,
    folderIds?: string[],
    userRole: string = "USER"
  ) {
    // Optional: retrieve reference context from related folders
    let referenceContext: string | undefined;

    if (Array.isArray(folderIds) && folderIds.length > 0) {
      try {
        const chunks = await searchHybrid(
          REFERENCE_RETRIEVAL_QUERY,
          userId,
          undefined, // fileIds
          folderIds
        );

        if (chunks.length > 0) {
          referenceContext = chunks
            .map((c) => `[Reference: ${c.title ?? "Untitled"}]\n${c.content}`)
            .join("\n\n");

          console.log(
            `[runAnalysis] Retrieved ${chunks.length} reference chunk(s) from ${folderIds.length} folder(s)`
          );
        }
      } catch (refErr) {
        console.warn(
          "[runAnalysis] Reference context retrieval failed, continuing without it:",
          (refErr as Error).message
        );
      }
    }

    // Run the rich audit
    const audit = await this.analysisAgent.runAudit({
      content,
      type: "legal",
      referenceContext,
    });

    // Persist result and log execution
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.current_user_id = $1", [userId]);
      await client.query("SET LOCAL app.current_user_role = $2", [userRole]);

      await client.query("UPDATE files SET analysis = $1 WHERE id = $2", [
        JSON.stringify(audit),
        documentId,
      ]);

      await client.query(
        `INSERT INTO agent_execution_logs
           (file_id, user_id, agent_name, task_name, decisions, confidence_score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          userId,
          "AnalysisAgent",
          "Legal Audit",
          JSON.stringify({
            executiveSummary: audit.executiveSummary,
            overallRisk: audit.overallRisk,
            findingsCount: audit.findings.length,
          }),
          95.0,
        ]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return audit;
  }

  async runDrafting(params: {
    mode: string;
    detailLevel: string;
    instructions: string;
    formFields?: any;
    templateId?: string;
    sourceText?: string;
    playbookText?: string;
  }) {
    const prompt = `Mode: ${params.mode}, Level: ${params.detailLevel}, Instructions: ${params.instructions}`;
    return await this.draftingAgent.generateDraft(prompt);
  }

  async runNegotiation(
    documentContent: string,
    playbooks: string[],
    instructions: string
  ) {
    return await this.negotiationAgent.negotiate(
      documentContent,
      playbooks,
      instructions
    );
  }
  // analysis document
  async askLawyer(
    prompt: string,
    userId: string,
    documentIds?: string[],
    jurisdictions?: string[],
    outputFormat?: string
  ) {
    const context = await searchHybrid(prompt, userId, documentIds);
    const contextText = context
      .map((c) => `[Source: ${c.title}]\n${c.content}`)
      .join("\n\n");

    const result = await this.askLawyerAgent.getAdvice({
      prompt,
      context: contextText,
      jurisdictions,
      outputFormat: outputFormat as any,
      sources: context.map(c => ({ title: c.title, file_id: c.file_id, content: c.content }))
    });

    return result;
  }

  async remediate(
    documentId: string,
    content: string,
    userId: string,
    userRole: string = "USER"
  ) {
    return await this.runAnalysis(
      documentId,
      content,
      userId,
      undefined,
      userRole
    );
  }

  async runDPAReview(
    documentText: string,
    userId: string,
    fileId?: string
  ): Promise<DPAReviewResult> {
    return await this.dpaReviewAgent.reviewDPA(documentText, userId, fileId);
  }

  async runVendorReview(params: {
    documentText: string;
    websiteScan: WebsiteScanResult | null;
    userId: string;
    fileIds?: string[];
  }): Promise<VendorReviewResult> {
    return await this.vendorReviewAgent.reviewVendor(params);
  }

  async runAIEthicsReview(params: {
    documentText: string;
    websiteScan: WebsiteScanResult | null;
    userId: string;
    fileIds?: string[];
  }): Promise<AIEthicsResult> {
    return await this.aiEthicsAgent.reviewAIEthics(params);
  }

  // analysis agreement
  async interactAnalyze(
    folderIds: string[],
    prompt: string,
    userId: string,
    documentMode: string,
    answerStyle: string,
    history: any[],
    _folderId?: string,
    _userRole: string = "USER",
    draftIds: string[] = [],
    fileIds: string[] = []
  ) {
    const isFollowUp = Array.isArray(history) && history.length > 0;

    // ── Smart retrieval query ─────────────────────────────────────────────────
    // For initial analysis: prepend broad legal seed terms so RAG hits common
    // clause vocabulary, then narrow with the user prompt.
    // For follow-ups: use the specific user question directly — the user is
    // asking about a precise topic and we want the most relevant chunks for it.
    const LEGAL_SEED_TERMS =
      "indemnity liability limitation termination confidentiality " +
      "intellectual property payment governing law compliance data protection " +
      "liquidated damages audit rights obligations warranties representations";

    const retrievalQuery = isFollowUp
      ? prompt.trim()                                          // specific question → precise retrieval
      : `${LEGAL_SEED_TERMS} ${prompt.substring(0, 120)}`.trim(); // broad audit → wide retrieval

    console.log(`[interactAnalyze] userId=${userId} folderIds=${JSON.stringify(folderIds)} draftIds=${JSON.stringify(draftIds)} fileIds=${JSON.stringify(fileIds)}`);
    console.log(`[interactAnalyze] isFollowUp=${isFollowUp} documentMode=${documentMode} answerStyle=${answerStyle}`);
    console.log(`[interactAnalyze] userPrompt(100)="${prompt.substring(0, 100)}"`);
    console.log(`[interactAnalyze] retrievalQuery(120)="${retrievalQuery.substring(0, 120)}"`);

    const hasFolders = Array.isArray(folderIds) && folderIds.length > 0;
    const hasDrafts = Array.isArray(draftIds) && draftIds.length > 0;
    const hasFiles = Array.isArray(fileIds) && fileIds.length > 0;

    let context: Awaited<ReturnType<typeof searchHybrid>> = [];

    if (hasFolders) {
      const chunks = await searchHybrid(retrievalQuery, userId, undefined, folderIds);
      context = context.concat(chunks);
    }
    if (hasDrafts) {
      const chunks = await searchHybrid(retrievalQuery, userId, draftIds, undefined);
      context = context.concat(chunks);
    }
    if (hasFiles) {
      const chunks = await searchHybrid(retrievalQuery, userId, fileIds, undefined);
      context = context.concat(chunks);
    }

    // Deduplicate by content
    const seen = new Set<string>();
    context = context.filter(c => {
      if (seen.has(c.content)) return false;
      seen.add(c.content);
      return true;
    });

    console.log(
      `[interactAnalyze] Retrieved ${context.length} chunk(s): ` +
      context.map(c => `"${c.title ?? c.file_id}"`).join(", ")
    );

    // ── Format conversation history ───────────────────────────────────────────
    // Use 2500 char budget per message so the LLM sees enough of the initial
    // report to properly answer follow-up questions.
    const historyBlock = isFollowUp
      ? `\n\n--- PRIOR CONVERSATION ---\n${history
          .map((m: { role: string; content: string }, i: number) =>
            `[${i + 1}] ${m.role === "assistant" ? "ASSISTANT" : "USER"}:\n${m.content.substring(0, 2500)}`
          )
          .join("\n\n")}\n--- END PRIOR CONVERSATION ---`
      : "";

    // ── Answer style configuration ────────────────────────────────────────────
    const isTabular = answerStyle === "tabular";

    // Tabular format provides column schemas per section so the LLM uses the
    // right headers rather than inventing them.
    const tabularFormatBlock = isTabular
      ? `\n\nOUTPUT FORMAT — TABULAR TABLES:
Render the following sections as Markdown tables (not bullet lists):

Key Findings table columns:
| # | Finding | Severity | Relevant Evidence | Issue | Why It Matters | Recommendation | Fallback |

Missing or Weak Clauses table columns:
| Clause / Protection | Why It Matters | Recommendation |

Compliance Gaps table columns:
| Regulation / Framework | Severity | Gap | Remediation |

Recommended Redlines table columns:
| Clause | Current Issue | Suggested Revision |

Obligations & Deadlines table columns:
| Party | Obligation | Trigger | Deadline |

Executive Summary and Overall Risk Assessment remain as short prose paragraphs.`
      : "";

    // ── System prompt — two modes ─────────────────────────────────────────────
    // Follow-up mode: drop the rigid 6-section template and answer directly.
    // Initial mode: enforce the full structured report template.
    const systemPrompt = isFollowUp
      ? `You are a Senior Legal Counsel and Compliance Analyst acting as an AI assistant.

The user has already received an initial legal review report. They are now asking a follow-up question about the document(s).

Your job:
1. Read the PRIOR CONVERSATION carefully to understand what was already covered.
2. Use the DOCUMENT CONTEXT to find specific evidence relevant to the new question.
3. Answer the new question DIRECTLY and CONCISELY — do not repeat or regenerate the full initial report.
4. Ground your answer in the document context. Quote or paraphrase specific clauses as evidence.
5. If the answer is not supported by the document context, say so clearly.
6. Do not invent clauses, parties, or facts not present in the retrieved material.
7. Keep your response focused — use headers only if the question genuinely requires multiple sub-topics.

Answer Style: ${answerStyle}${tabularFormatBlock}`

      : `You are a Senior Legal Counsel and Compliance Analyst performing a comprehensive legal review.

Your task: Review the provided document context and produce a thorough, document-grounded legal assessment. Do not produce a generic legal explainer — every finding must be tied to the actual document content retrieved.

Rules:
- Ground every finding, clause, and obligation in the actual retrieved document content.
- Quote or paraphrase specific clauses as evidence wherever possible.
- Do not invent clauses, parties, or facts not present in the retrieved material.
- If a section has no support in the document context, write "Not clearly identified in the reviewed material."
- Do not add a closing question like "Would you like a deeper dive?".
- Do not add sections outside the required structure.

Answer Style: ${answerStyle}${tabularFormatBlock}

REQUIRED OUTPUT STRUCTURE — use exactly these headings in this order:

# Executive Summary
2-4 sentence summary of the document risk picture relevant to the user's query.

# Overall Risk Assessment
- **Risk Level:** Low / Medium / High
- **Why:** 2-4 bullets explaining the risk rating, grounded in the document.

# Key Findings
${isTabular
  ? "Present as a table: | # | Finding | Severity | Relevant Evidence | Issue | Why It Matters | Recommendation | Fallback |"
  : `For each finding:
## Finding N: <short title>
- **Severity:** Low / Medium / High
- **Relevant Clause / Evidence:** Quote or paraphrase the specific clause or evidence.
- **Issue:** The specific legal/commercial problem.
- **Why It Matters:** Consequence if unaddressed.
- **Recommendation:** Concrete change to make.
- **Fallback Position:** Minimum acceptable negotiation position.`}

# Missing or Weak Clauses
${isTabular
  ? "Present as a table: | Clause / Protection | Why It Matters | Recommendation |"
  : `- **Clause / Protection:** <name>
- **Why It Matters:** <brief explanation>
- **Recommendation:** <what to add or strengthen>`}

# Compliance Gaps
${isTabular
  ? "Present as a table: | Regulation / Framework | Severity | Gap | Remediation |"
  : `- **Regulation / Framework:** GDPR / CCPA / DPDPA / other
- **Severity:** RED / YELLOW / GREEN
- **Gap:** <issue>
- **Remediation:** <fix>`}

# Recommended Redlines
${isTabular
  ? "Present as a table: | Clause | Current Issue | Suggested Revision |"
  : `- **Clause:** <name>
- **Current Issue:** <problem>
- **Suggested Revision:** <replacement language or revision direction>`}

# Obligations & Deadlines
${isTabular
  ? "Present as a table: | Party | Obligation | Trigger | Deadline |"
  : `- **Party:** <party or "Not specified">
- **Obligation:** <obligation>
- **Trigger:** <trigger event or "Not specified">
- **Deadline:** <deadline or "Not specified">`}`;

    // ── Context formatting helper ──────────────────────────────────────────────
    // Number each document chunk so the LLM can reference them as [Doc 1], [Doc 2]
    const formatContext = (chunks: typeof context) =>
      chunks.length > 0
        ? chunks
            .map((c, i) => `[Doc ${i + 1}: ${c.title ?? "Untitled"}]\n${c.content}`)
            .join("\n\n")
        : "No document chunks were retrieved from the selected sources. State this clearly in the relevant sections.";

    const noContextNote = !isFollowUp
      ? "\n\nIMPORTANT: If no document chunks were retrieved, use the required structure but mark each section as 'Not clearly identified in the reviewed material.'"
      : "";

    // ── Individual document mode ──────────────────────────────────────────────
    if (documentMode === "individual" && context.length > 0) {
      const chunksByFile: Record<string, { title: string; chunks: typeof context }> = {};
      for (const chunk of context) {
        const fId = chunk.file_id || "unknown";
        if (!chunksByFile[fId]) {
          chunksByFile[fId] = { title: chunk.title || "Untitled Document", chunks: [] };
        }
        chunksByFile[fId].chunks.push(chunk);
      }

      const fileAnalyses = await Promise.all(
        Object.entries(chunksByFile).map(async ([_fId, fileData]) => {
          const docContextText = formatContext(fileData.chunks);

          const docUserPrompt =
            `[DOCUMENT: ${fileData.title}]\n${docContextText}` +
            historyBlock +
            `\n\n[USER QUESTION]\n${prompt}` +
            noContextNote +
            (isFollowUp
              ? "\n\nAnswer the follow-up question above directly and concisely, grounded in the document context and prior conversation."
              : `\n\nProvide a complete legal review of "${fileData.title}" using the required output structure.`);

          const response = await openRouterComplete(systemPrompt, docUserPrompt);
          return `---\n# Analysis for: ${fileData.title}\n---\n\n${response}`;
        })
      );

      return fileAnalyses.join("\n\n");
    }

    // ── Unified document mode ─────────────────────────────────────────────────
    const contextText = formatContext(context);

    const userPrompt =
      `[DOCUMENT CONTEXT]\n${contextText}` +
      historyBlock +
      `\n\n[USER QUESTION]\n${prompt}` +
      noContextNote +
      (isFollowUp
        ? "\n\nAnswer the follow-up question above directly and concisely, grounded in the document context and prior conversation."
        : "\n\nProvide a complete legal review using the required output structure.");

    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("interactAnalyze error:", err);
      throw err;
    }
  }
}