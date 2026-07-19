import { pool } from "../config/database.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { ScannerService } from "./scannerService.js";
import { WebsiteScannerService } from "./websiteScanner/index.js";
import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { withRetry } from "../utils/retry.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
import { executeTemplateDrafting } from "./jobs/handlers/drafting-handler.js";
import { executePlaybookIngestionJob } from "./jobs/handlers/playbook-handler.js";

export async function updateJobProgress(jobId: string, userId: string, progress: number, message?: string) {
  await withTransaction(userId, 'USER', async (client) => {
    await client.query(
      "UPDATE jobs SET progress = $1, message = $2 WHERE id = $3",
      [progress, message, jobId]
    );
  });
  jobRegistry.broadcast(userId, { id: jobId, progress, message });
}

export async function updateJobState(jobId: string, userId: string, updates: Partial<Job>) {
  // Map camelCase Job fields to actual snake_case DB column names
  const columnMap: Record<string, string> = {
    userId: 'user_id',
    createdAt: 'created_at',
    completedAt: 'completed_at',
    // result, error, status, progress, message, type all match DB column names directly
  };
  const fields = Object.keys(updates).map((k, i) => `${columnMap[k] ?? k} = $${i + 1}`).join(", ");
  const values = Object.values(updates).map(v =>
    v !== null && typeof v === 'object' ? JSON.stringify(v) : v
  );
  await withTransaction(userId, 'USER', async (client) => {
    await client.query(
      `UPDATE jobs SET ${fields} WHERE id = $${values.length + 1}`,
      [...values, jobId]
    );
  });
}

export async function addJobToQueue(userId: string, type: JobType, payload: any): Promise<{ id: string }> {
  const jobId = crypto.randomUUID();

  await withTransaction(userId, 'USER', async (client) => {
    await client.query(
      `INSERT INTO jobs (id, user_id, type, status, progress, payload)
       VALUES ($1, $2, $3, 'queued', 0, $4)`,
      [jobId, userId, type, JSON.stringify(payload)]
    );
  });

  // Background processing (In-process async)
  (async () => {
    try {
      await updateJobState(jobId, userId, { status: 'processing', progress: 5 } as any);
      jobRegistry.broadcast(userId, { id: jobId, status: 'processing', progress: 5 });

      let result: any;
      switch (type) {
        case "file_processing":
          result = await executeFileProcessing(jobId, userId, payload);
          break;
        case "document_analysis":
          result = await executeDocumentAnalysis(jobId, userId, payload);
          break;
        case "privacy_scanning":
          result = await executePrivacyScanning(jobId, userId, payload);
          break;
        case "vulnerability_scanning":
          result = await executeVulnerabilityScanning(jobId, userId, payload);
          break;
        case "template_drafting":
          result = await executeTemplateDrafting(jobId, userId, payload);
          break;
        case "dpa_review":
          result = await executeDPAReview(jobId, userId, payload);
          break;
        case "vendor_review":
          result = await executeVendorReview(jobId, userId, payload);
          break;
        case "ai_ethics_review":
          result = await executeAIEthicsReview(jobId, userId, payload);
          break;
        case "PLAYBOOK_INGEST":
          result = await executePlaybookIngestionJob(jobId, userId, payload);
          break;
        default:
          throw new Error(`Unhandled job type: ${type}`);
      }

      await updateJobState(jobId, userId, {
        status: 'completed',
        progress: 100,
        result,
      } as any);
      jobRegistry.broadcast(userId, {
        id: jobId,
        userId,
        status: "completed" as JobStatus,
        progress: 100,
        result
      });

    } catch (err: any) {
      console.error(`[JobRunner] Job ${jobId} failed:`, err);
      jobRegistry.broadcast(userId, {
        id: jobId,
        userId,
        status: "failed" as JobStatus,
        error: err.message
      });
      await updateJobState(jobId, userId, {
        status: 'failed',
        error: err.message
      } as any).catch(dbErr => console.error(`[JobRunner] Failed to persist error state for job ${jobId}:`, dbErr));
    }
  })();

  return { id: jobId };
}

export type JobType =
  | "file_processing"
  | "document_analysis"
  | "template_drafting"
  | "privacy_scanning"
  | "vulnerability_scanning"
  | "dpa_review"
  | "vendor_review"
  | "ai_ethics_review"
  | "PLAYBOOK_INGEST";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface Job {
  id: string;
  userId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  message: string;
  payload: any;
  result?: any;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

type SseClient = {
  id: string;
  userId: string;
  send: (data: string) => void;
  /** NodeJS interval handle for the keepalive ping — cleared on disconnect */
  heartbeat: ReturnType<typeof setInterval>;
};

class BackgroundJobRegistry {
  private clients: Set<SseClient> = new Set();
  public orchestrator = new AgentOrchestrator();
  public scanner = new ScannerService();

  public broadcast(userId: string, job: any): void {
    const payloadStr = JSON.stringify({ event: "job_update", job });
    for (const client of this.clients) {
      if (client.userId === userId) {
        client.send(`data: ${payloadStr}\n\n`);
      }
    }
  }

  public addClient(userId: string, res: any): string {
    const id = "client_" + crypto.randomUUID();
    res.write(`data: ${JSON.stringify({ event: "ping", timestamp: new Date().toISOString() })}\n\n`);

    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`:ping\n\n`);
      } catch (err) {
        clearInterval(heartbeatInterval);
      }
    }, 15000);

    const client: SseClient = {
      id,
      userId,
      heartbeat: heartbeatInterval,
      send: (data: string) => {
        try {
          res.write(data);
        } catch (err) {
          console.warn("[JobRegistry SSE] Failed to push data for client:", id);
        }
      },
    };

    this.clients.add(client);
    return id;
  }

  public removeClient(id: string): void {
    for (const client of this.clients) {
      if (client.id === id) {
        clearInterval(client.heartbeat);
        this.clients.delete(client);
        break;
      }
    }
  }

  public async getJob(id: string): Promise<Job | null> {
    const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return this.mapDbJobToJob(rows[0]);
  }

  public async getUserJobs(userId: string): Promise<Job[]> {
    const { rows } = await pool.query(
      "SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return rows.map(r => this.mapDbJobToJob(r));
  }

  private mapDbJobToJob(row: any): Job {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      status: row.status as JobStatus,
      progress: row.progress,
      message: row.message,
      payload: row.payload,
      result: row.result,
      error: row.error,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
    };
  }
}

export const jobRegistry = new BackgroundJobRegistry();

async function executeFileProcessing(jobId: string, userId: string, payload: any): Promise<any> {
  const { fileId, fileBufferBase64, mimeType } = payload;

  await updateJobProgress(jobId, userId, 15, "Extracting text from document...");

  const buffer = Buffer.from(fileBufferBase64, "base64");
  let content = "";

  if (mimeType === "application/pdf") {
    const data = await pdf(buffer);
    content = data.text;
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const data = await mammoth.extractRawText({ buffer });
    content = data.value;
  } else if (mimeType.startsWith("text/")) {
    content = buffer.toString("utf-8");
  } else {
    content = buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
  }

  content = content.replace(/\0/g, "");
  const encryptedContent = encryptData(content);

  await updateJobProgress(jobId, userId, 50, "Updating database and indexing for search...");

  const rowCount = await withTransaction(userId, 'USER', async (client) => {
    const result = await client.query(
      `UPDATE files SET content = $1, is_encrypted = $2 WHERE id = $3`,
      [encryptedContent, true, fileId]
    );

    const versionId = "ver_" + crypto.randomUUID();
    await client.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, fileId, encryptedContent]
    );

    return result.rowCount;
  });

  if (rowCount === 0) throw new Error(`File record ${fileId} not found.`);

  await chunkAndIndexDocument(fileId, content, userId);

  return { fileId, content };
}

async function executeDocumentAnalysis(jobId: string, userId: string, payload: any): Promise<any> {
  const userRole = await withTransaction(userId, 'USER', async (client) => {
    const { rows } = await client.query("SELECT role FROM users WHERE id = $1", [userId]);
    return rows[0]?.role || 'USER';
  });

  if (payload.type === "legal_ask") {
    const { prompt, documents, jurisdiction, outputFormat } = payload;
    await updateJobProgress(jobId, userId, 30, "Searching knowledge base and synthesizing advice...");

    console.log(`[JobRunner/legal_ask] Calling askLawyer via Gemini`);
    console.log(`  prompt: "${String(prompt).substring(0, 80)}..."`);
    console.log(`  jurisdictions: ${JSON.stringify(jurisdiction || [])}`);
    console.log(`  outputFormat: ${outputFormat || "Full IRAC"}`);

    const result = await jobRegistry.orchestrator.askLawyer(
      prompt, 
      userId, 
      documents,
      jurisdiction,
      outputFormat
    );

    // Return both text and sources if available
    return { 
      text: result.text || result,
      sources: result.sources || []
    };
  }

  if (payload.prompt && (payload.folderIds || payload.fileIds || payload.draftIds)) {
     const { folderIds, fileIds, draftIds, prompt, documentMode, answerStyle, history } = payload;
     await updateJobProgress(jobId, userId, 30, "Critical Thinking");

     const result = await jobRegistry.orchestrator.interactAnalyze(
       Array.isArray(folderIds) ? folderIds : [],
       prompt,
       userId,
       documentMode,
       answerStyle,
       history,
       undefined,
       userRole,
       Array.isArray(draftIds) ? draftIds : [],
       Array.isArray(fileIds) ? fileIds : []
     );
     return { analysis: result, clauses: [] };
  }

  const { documentId, content, folderIds } = payload;

  await updateJobProgress(jobId, userId, 30, "AI agents performing legal audit...");

  const result = await jobRegistry.orchestrator.runAnalysis(
    documentId,
    content,
    userId,
    Array.isArray(folderIds) ? folderIds : undefined,
    userRole
  );
  return result;
}

/*
Migrating the drafting template execution to drafting-handler.ts
*/
// async function executeTemplateDrafting(jobId: string, userId: string, payload: any): Promise<any> {
//   if (payload.type === "refine") {
//     const { text, refineType, param } = payload;
//     let instruction = "";
//     if (refineType === "tone") instruction = `Rewrite the following legal text in a ${param} tone.`;
//     else if (refineType === "grammar") instruction = `Fix the spelling and grammar in the following legal text while preserving legal meaning.`;
//     else if (refineType === "extend") instruction = `Expand the following legal clause with more comprehensive protections.`;
//     else if (refineType === "reduce") instruction = `Shorten the following legal clause to its core obligation.`;
//     else if (refineType === "simplify") instruction = `Rewrite the following legal text in plain English for a non-lawyer.`;
//     else if (refineType === "complete") instruction = `Complete the following sentence or clause in a professional legal manner.`;
//     else if (refineType === "ask") instruction = `Follow this custom instruction: ${param}`;

//     const prompt = `${instruction}\n\nText:\n${text}\n\nIMPORTANT: Return only the rewritten text without any quotes or preamble.`;

//     const content = await withRetry(() => openRouterComplete("", prompt));

//     const docId = "doc_" + crypto.randomUUID();
//     const title = `Refined Text - ${new Date().toLocaleDateString()}`;

//     const { email: creatorEmail } = await withTransaction(userId, 'USER', async (client) => {
//       const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
//       return { email: rows[0]?.email || "" };
//     });

//     const encryptedContent = encryptData(content);

//     await withTransaction(userId, 'USER', async (client) => {
//       await client.query(
//         `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
//          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
//         [docId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
//       );

//       const versionId = "ver_" + crypto.randomUUID();
//       await client.query(
//         `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
//         [versionId, docId, encryptedContent]
//       );
//     });

//     // Index refined content for RAG retrieval (fire-and-forget)
//     chunkAndIndexDocument(docId, content, userId).catch((err) =>
//       console.warn(`[executeTemplateDrafting/refine] Chunk indexing failed for ${docId}:`, err)
//     );

//     return { data: content, file_id: docId };
//   }

//   const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText } = payload;

//   await updateJobProgress(jobId, userId, 20, "Synthesizing legal document...");

//   const result = await jobRegistry.orchestrator.runDrafting({
//     mode,
//     detailLevel: outputLevel,
//     instructions,
//     formFields,
//     templateId,
//     sourceText,
//     playbookText
//   });

//   const docId = "doc_" + crypto.randomUUID();
//   const title = `AI Draft - ${new Date().toLocaleDateString()}`;

//   const { email: creatorEmail } = await withTransaction(userId, 'USER', async (client) => {
//     const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
//     return { email: rows[0]?.email || "" };
//   });

//   const encryptedContent = encryptData(result);

//   await withTransaction(userId, 'USER', async (client) => {
//     await client.query(
//       `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
//       [docId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
//     );

//     const versionId = "ver_" + crypto.randomUUID();
//     await client.query(
//       `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
//       [versionId, docId, encryptedContent]
//     );
//   });

//   // Index drafted content for RAG retrieval (fire-and-forget)
//   chunkAndIndexDocument(docId, result, userId).catch((err) =>
//     console.warn(`[executeTemplateDrafting] Chunk indexing failed for ${docId}:`, err)
//   );

//   return { content: result, file_id: docId };
// }

async function executePrivacyScanning(jobId: string, userId: string, payload: any): Promise<any> {
  await updateJobProgress(jobId, userId, 5, "Initializing scan");

  const result = await jobRegistry.scanner.scanCookie(
    payload.url,
    userId,
    payload.scanDepth,
    async (pct: number, message: string) => {
      await updateJobProgress(jobId, userId, pct, message);
    }
  );
  return result;
}

async function executeVulnerabilityScanning(jobId: string, userId: string, payload: any): Promise<any> {
  await updateJobProgress(jobId, userId, 5, "Starting security audit...");

  const result = await jobRegistry.scanner.scanVulnerability(
    payload.url,
    userId,
    async (pct: number, message: string) => {
      await updateJobProgress(jobId, userId, pct, message);
    }
  );
  return result;
}

async function executeDPAReview(jobId: string, userId: string, payload: any): Promise<any> {
  const {
    documentText,
    fileId,
  }: { documentText: string; fileId?: string } = payload;

  await updateJobProgress(jobId, userId, 8,  "Reading document structure...");
  await updateJobProgress(jobId, userId, 16, "Extracting text and identifying parties...");
  await updateJobProgress(jobId, userId, 24, "Checking GDPR Article 28 compliance...");
  await updateJobProgress(jobId, userId, 32, "Reviewing processor obligations...");
  await updateJobProgress(jobId, userId, 42, "Reviewing security controls and TOMs...");
  await updateJobProgress(jobId, userId, 52, "Checking international transfer clauses...");
  await updateJobProgress(jobId, userId, 62, "Checking sub-processor controls...");
  await updateJobProgress(jobId, userId, 72, "Finding compliance gaps...");
  await updateJobProgress(jobId, userId, 82, "Calculating compliance score...");

  const result = await jobRegistry.orchestrator.runDPAReview(documentText, userId, fileId);

  await updateJobProgress(jobId, userId, 92, "Generating recommendations...");
  await updateJobProgress(jobId, userId, 97, "Preparing compliance report...");

  return result;
}

async function executeVendorReview(jobId: string, userId: string, payload: any): Promise<any> {
  const {
    documentText = "",
    vendorUrl,
    fileNames = [],
    fileIds = [],
  }: { documentText: string; vendorUrl?: string; fileNames: string[]; fileIds: string[] } = payload;

  await updateJobProgress(jobId, userId, 5,  "Receiving request...");

  // Document context
  if (documentText.length > 0) {
    await updateJobProgress(jobId, userId, 10, "Extracting uploaded documents...");
    console.log(
      `[executeVendorReview] Merged document text: ${documentText.length} chars from [${fileNames.join(", ")}]`
    );
  }

  // Website scanning
  let websiteScan = null;
  let websiteScanAttempted = false;
  let websiteScanFailed = false;

  if (vendorUrl) {
    websiteScanAttempted = true;
    await updateJobProgress(jobId, userId, 18, "Scanning vendor website...");
    console.log(`[executeVendorReview] Starting website scan for: ${vendorUrl}`);

    const websiteScanner = new WebsiteScannerService();

    try {
      await updateJobProgress(jobId, userId, 24, "Discovering compliance pages...");
      websiteScan = await websiteScanner.scan(vendorUrl, { crawlLimit: 20 });

      const reachableCount = [
        websiteScan.privacyPolicy, websiteScan.cookiePolicy, websiteScan.securityPage,
        websiteScan.trustCenter, websiteScan.terms, websiteScan.legal,
        websiteScan.dpa, websiteScan.aiPolicy, websiteScan.responsibleAI,
      ].filter((p: any) => p?.reachable).length;

      console.log(
        `[executeVendorReview] Website scan complete — ` +
          `discoveredPages: ${websiteScan.discoveredPages.length}, ` +
          `compliancePages: ${reachableCount}`
      );

      await updateJobProgress(jobId, userId, 34, "Extracting website intelligence...");
    } catch (scanErr: any) {
      websiteScanFailed = true;
      console.warn(
        `[executeVendorReview] Website scan failed for ${vendorUrl}: ${scanErr.message}. ` +
          "Continuing with document-only analysis."
      );
      // Don't throw — fall back gracefully to document-only analysis
    }
  }

  // Guard: if a URL was provided but the scan failed completely AND no documents
  // were uploaded, refuse to continue rather than producing fabricated findings.
  if (websiteScanAttempted && websiteScanFailed && websiteScan === null && documentText.length <= 100) {
    throw new Error(
      "We couldn't retrieve enough content from this website to perform an analysis. " +
        "Please try again later or upload supporting documents."
    );
  }

  // RAG retrieval progress
  await updateJobProgress(jobId, userId, 42, "Searching knowledge base...");

  // AI evaluation stages
  await updateJobProgress(jobId, userId, 50, "Reviewing privacy posture...");
  await updateJobProgress(jobId, userId, 58, "Reviewing security posture...");
  await updateJobProgress(jobId, userId, 65, "Reviewing compliance status...");
  await updateJobProgress(jobId, userId, 72, "Evaluating contractual risks...");
  await updateJobProgress(jobId, userId, 80, "Calculating vendor score...");

  const result = await jobRegistry.orchestrator.runVendorReview({
    documentText,
    websiteScan,
    userId,
    fileIds: fileIds.length > 0 ? fileIds : undefined,
  });

  await updateJobProgress(jobId, userId, 90, "Generating recommendations...");
  await updateJobProgress(jobId, userId, 97, "Preparing report...");

  console.log(
    `[executeVendorReview] Complete — overallScore: ${result.overallScore}, ` +
      `overallRisk: ${result.overallRisk}, findings: ${result.findings.length}`
  );

  return result;
}

async function executeAIEthicsReview(jobId: string, userId: string, payload: any): Promise<any> {
  const {
    documentText = "",
    websiteUrl,
    fileNames = [],
    fileIds = [],
  }: { documentText: string; websiteUrl?: string; fileNames: string[]; fileIds: string[] } = payload;

  console.log(
    `[executeAIEthicsReview] Received payload — ` +
      `fileIds=${JSON.stringify(fileIds)}, ` +
      `documentTextLen=${documentText.length}, ` +
      `websiteUrl=${websiteUrl ?? "none"}`
  );

  await updateJobProgress(jobId, userId, 5,  "Receiving request...");

  // Document extraction logging
  if (documentText.length > 0) {
    await updateJobProgress(jobId, userId, 10, "Extracting uploaded documents...");
    console.log(
      `[executeAIEthicsReview] Merged document text: ${documentText.length} chars from [${fileNames.join(", ")}]`
    );
  }

  // Website scanning
  let websiteScan = null;
  let websiteScanAttempted = false;
  let websiteScanFailed = false;

  if (websiteUrl) {
    websiteScanAttempted = true;
    await updateJobProgress(jobId, userId, 18, "Scanning website...");
    console.log(`[executeAIEthicsReview] Starting website scan for: ${websiteUrl}`);

    const websiteScanner = new WebsiteScannerService();

    try {
      await updateJobProgress(jobId, userId, 24, "Discovering AI governance pages...");
      websiteScan = await websiteScanner.scan(websiteUrl, { crawlLimit: 30 });

      const aiGovernancePages = [
        websiteScan.aiPolicy, websiteScan.responsibleAI, websiteScan.safetyPage,
        websiteScan.policiesPage, websiteScan.modelSpec, websiteScan.transparencyPage,
        websiteScan.charterPage,
      ].filter((p: any) => p?.reachable).length;
      const allCompliancePages = [
        websiteScan.privacyPolicy, websiteScan.cookiePolicy, websiteScan.securityPage,
        websiteScan.trustCenter, websiteScan.terms, websiteScan.legal,
        websiteScan.dpa, websiteScan.aiPolicy, websiteScan.responsibleAI,
        websiteScan.safetyPage, websiteScan.policiesPage, websiteScan.modelSpec,
        websiteScan.transparencyPage, websiteScan.charterPage,
      ].filter((p: any) => p?.reachable).length;

      console.log(
        `[executeAIEthicsReview] Website scan complete — ` +
          `discoveredPages: ${websiteScan.discoveredPages.length}, ` +
          `aiGovernancePages: ${aiGovernancePages}, ` +
          `allCompliancePages: ${allCompliancePages}`
      );

      // ── Extract text content from reachable AI governance pages ────────────
      // This is the key step that was previously missing: the scan only told the
      // agent *whether* a page exists, not *what it says*. We now fetch the actual
      // text so the LLM has real evidence rather than just URL presence signals.
      await updateJobProgress(jobId, userId, 34, "Extracting website intelligence...");

      const AI_ETHICS_PAGES_TO_EXTRACT = [
        websiteScan.safetyPage,
        websiteScan.responsibleAI,
        websiteScan.aiPolicy,
        websiteScan.policiesPage,
        websiteScan.modelSpec,
        websiteScan.transparencyPage,
        websiteScan.charterPage,
        websiteScan.trustCenter,
        websiteScan.securityPage,
        websiteScan.privacyPolicy,
      ].filter((p): p is NonNullable<typeof p> => p?.reachable === true);

      // Cap at 6 pages to stay within token budget; prioritise AI governance pages
      const pagesToFetch = AI_ETHICS_PAGES_TO_EXTRACT.slice(0, 6);

      if (pagesToFetch.length > 0) {
        console.log(
          `[executeAIEthicsReview] Extracting content from ${pagesToFetch.length} AI governance page(s): ` +
            pagesToFetch.map((p) => p.url).join(", ")
        );

        const { extractPageContent } = await import("./websiteScanner/contentExtractor.js");
        const extractedContents: import("./websiteScanner/types.js").ExtractedPageContent[] = [];

        for (const page of pagesToFetch) {
          try {
            const extracted = await extractPageContent(page.url);
            if (extracted.ok && extracted.text.length > 100) {
              // Keep a generous snippet for the LLM — 3000 chars per page
              const snippet = extracted.text.substring(0, 3000);
              extractedContents.push({
                url: page.url,
                title: extracted.title || page.url,
                textSnippet: snippet,
                fullTextLength: extracted.text.length,
              });
              console.log(
                `[executeAIEthicsReview] Extracted ${extracted.text.length} chars from: ${page.url}`
              );
            } else {
              console.warn(
                `[executeAIEthicsReview] Page extraction insufficient for ${page.url} ` +
                  `(ok=${extracted.ok}, len=${extracted.text.length})`
              );
            }
          } catch (extractErr: any) {
            console.warn(
              `[executeAIEthicsReview] Content extraction failed for ${page.url}: ${extractErr.message}`
            );
          }
        }

        if (extractedContents.length > 0) {
          websiteScan.extractedPageContents = extractedContents;
          console.log(
            `[executeAIEthicsReview] Page content extraction complete — ` +
              `${extractedContents.length} pages with content, ` +
              `total chars: ${extractedContents.reduce((s, p) => s + p.fullTextLength, 0)}`
          );
        }
      }
    } catch (scanErr: any) {
      websiteScanFailed = true;
      console.warn(
        `[executeAIEthicsReview] Website scan failed for ${websiteUrl}: ${scanErr.message}. ` +
          "Continuing with document-only analysis."
      );
      // Don't throw — fall back gracefully to document-only analysis
    }
  }

  // Guard: if a URL was provided but the scan failed completely AND no documents
  // were uploaded, refuse to continue rather than producing fabricated findings.
  if (websiteScanAttempted && websiteScanFailed && websiteScan === null && documentText.length <= 100) {
    throw new Error(
      "We couldn't retrieve enough content from this website to perform an analysis. " +
        "Please try again later or upload supporting documents."
    );
  }

  // RAG retrieval
  await updateJobProgress(jobId, userId, 40, "Searching knowledge base...");

  // AI evaluation stages
  await updateJobProgress(jobId, userId, 46, "Reviewing AI governance...");
  await updateJobProgress(jobId, userId, 52, "Reviewing transparency...");
  await updateJobProgress(jobId, userId, 58, "Reviewing fairness...");
  await updateJobProgress(jobId, userId, 64, "Reviewing accountability...");
  await updateJobProgress(jobId, userId, 68, "Reviewing privacy...");
  await updateJobProgress(jobId, userId, 72, "Reviewing human oversight...");
  await updateJobProgress(jobId, userId, 76, "Reviewing explainability...");

  const result = await jobRegistry.orchestrator.runAIEthicsReview({
    documentText,
    websiteScan,
    userId,
    fileIds: fileIds.length > 0 ? fileIds : undefined,
  });

  await updateJobProgress(jobId, userId, 85, "Calculating AI ethics score...");
  await updateJobProgress(jobId, userId, 92, "Generating recommendations...");
  await updateJobProgress(jobId, userId, 97, "Preparing report...");

  console.log(
    `[executeAIEthicsReview] Complete — overallScore: ${result.overallScore}, ` +
      `overallRisk: ${result.overallRisk}, findings: ${result.findings.length}`
  );

  return result;
}
