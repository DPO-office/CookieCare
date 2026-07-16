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

  async interactAnalyze(
    folderIds: string[],
    prompt: string,
    userId: string,
    _documentMode: boolean,
    answerStyle: string,
    history: any[],
    _folderId?: string,
    _userRole: string = "USER",
    draftIds: string[] = []
  ) {
    // ── Use a retrieval-optimised query separate from the user prompt ─────────
    // Long specific user prompts ("Perform a rigorous compliance audit focusing on...")
    // rarely match document chunk tokens via FTS. We prepend broad legal seed terms
    // so the query hits common clause vocabulary, then append the first 120 chars of
    // the user prompt for relevance-narrowing.
    const LEGAL_SEED_TERMS =
      "indemnity liability limitation termination confidentiality " +
      "intellectual property payment governing law compliance data protection " +
      "liquidated damages audit rights obligations warranties representations";

    const retrievalQuery = `${LEGAL_SEED_TERMS} ${prompt.substring(0, 120)}`.trim();

    console.log(`[interactAnalyze] userId=${userId} folderIds=${JSON.stringify(folderIds)} draftIds=${JSON.stringify(draftIds)}`);
    console.log(`[interactAnalyze] userPrompt(100)="${prompt.substring(0, 100)}"`);
    console.log(`[interactAnalyze] retrievalQuery(120)="${retrievalQuery.substring(0, 120)}"`);

    // Retrieve chunks from selected folders (by folderIds) and selected drafts (by file IDs)
    const hasFolders = Array.isArray(folderIds) && folderIds.length > 0;
    const hasDrafts = Array.isArray(draftIds) && draftIds.length > 0;

    let context: Awaited<ReturnType<typeof searchHybrid>> = [];

    if (hasFolders) {
      const folderChunks = await searchHybrid(retrievalQuery, userId, undefined, folderIds);
      context = context.concat(folderChunks);
    }

    if (hasDrafts) {
      const draftChunks = await searchHybrid(retrievalQuery, userId, draftIds, undefined);
      context = context.concat(draftChunks);
    }

    // Deduplicate chunks by content (same chunk might appear in both queries)
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

    const contextText = context
      .map((c) => `[File: ${c.title ?? "Untitled"}]\n${c.content}`)
      .join("\n\n");

    const systemPrompt = `You are a Senior Legal Counsel and Compliance Analyst.

Your task is to review the provided document context and answer the user's query as a structured legal review report, not as a generic essay.

You must ground your answer in the retrieved document context wherever possible. If the context does not support a point, explicitly say that the reviewed material does not clearly show it. Do not invent clauses, parties, or facts.

Answer Style: ${answerStyle}
${
  history.length > 0
    ? `Prior conversation context:\n${JSON.stringify(history)}\n`
    : ""
}

CRITICAL OUTPUT RULES:
1. Return the answer in exactly the Markdown structure below.
2. Use all section headings below in the same order.
3. If a section has no strong support in the document context, write "Not clearly identified in the reviewed material." under that section instead of omitting it.
4. Do NOT write a generic legal explainer or general best-practices essay.
5. Tie findings to the uploaded/retrieved document context wherever possible.
6. Under "Key Findings", each finding must follow the exact mini-template shown below.
7. If the user's query is broad, still convert it into a document-focused legal review instead of answering abstractly.
8. Do not add a closing question like "Would you like a deeper dive?".
9. Do not add any extra sections outside the required structure.

Return your answer in this exact format:

# Executive Summary
Write a 2-4 sentence summary of the document risk picture relevant to the user's query.

# Overall Risk Assessment
- **Risk Level:** Low / Medium / High
- **Why:** 2-4 bullets explaining the basis for the rating.

# Key Findings
For each finding, use this exact structure:

## Finding 1: <short finding title>
- **Severity:** Low / Medium / High
- **Relevant Clause / Evidence:** Quote or paraphrase the relevant clause, sentence, or retrieved evidence.
- **Issue:** Explain the legal/commercial problem.
- **Why It Matters:** Explain the consequence or risk if unaddressed.
- **Recommendation:** Give a concrete recommended change.
- **Fallback Position:** Give a minimum acceptable negotiation fallback.

Add as many findings as are genuinely supported by the document context.

# Missing or Weak Clauses
For each missing or weak clause:
- **Clause / Protection:** <name>
- **Why It Matters:** <brief explanation>
- **Recommendation:** <what should be added or strengthened>

If nothing specific can be identified, write:
- Not clearly identified in the reviewed material.

# Compliance Gaps
For each compliance gap:
- **Regulation / Framework:** GDPR / CCPA / DPDPA / other
- **Severity:** RED / YELLOW / GREEN
- **Gap:** <issue>
- **Remediation:** <fix>

If no clear compliance gap is visible from the reviewed material, say so explicitly.

# Recommended Redlines
For each clause that should be revised:
- **Clause:** <name>
- **Current Issue:** <problem>
- **Suggested Revision:** <replacement language or revision direction>

If no specific redline can be proposed from the reviewed material, say so explicitly.

# Obligations & Deadlines
List obligations in this format:
- **Party:** <party or "Not specified">
- **Obligation:** <obligation>
- **Trigger:** <trigger event or "Not specified">
- **Deadline:** <deadline or "Not specified">

If none are identifiable, say:
- Not clearly identifiable from the reviewed material.

IMPORTANT:
- Prefer document-grounded analysis over generic legal advice.
- If the context retrieved is weak or incomplete, say that clearly in the relevant sections.
- Do not add any extra sections outside the required structure.`;

    const userPrompt = `[DOCUMENT CONTEXT]
${
  contextText ||
  "No document chunks were retrieved from the selected folders. You must still use the required report structure, but clearly state where the reviewed material is insufficient."
}

[USER TASK]
User request: ${prompt}

Convert the request into a document-focused legal review report using the required structure. If the request asks about specific risks or clauses, analyze those risks against the reviewed material instead of giving a generic how-to explanation.`;

    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("interactAnalyze error:", err);
      throw err;
    }
  }
}