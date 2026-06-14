import { pool } from "../config/database.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { ScannerService } from "./scannerService.js";
import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { withRetry } from "../utils/retry.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function updateJobProgress(jobId: string, userId: string, progress: number, message?: string) {
  await pool.query(
    "UPDATE jobs SET progress = $1, message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
    [progress, message, jobId]
  );
  jobRegistry.broadcast(userId, { id: jobId, progress, message });
}

export async function updateJobState(jobId: string, updates: Partial<Job>) {
  const fields = Object.keys(updates).map((k, i) => `${k === 'userId' ? 'user_id' : k} = $${i + 1}`).join(", ");
  const values = Object.values(updates);
  await pool.query(
    `UPDATE jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length + 1}`,
    [...values, jobId]
  );
}

export async function addJobToQueue(userId: string, type: JobType, payload: any): Promise<{ id: string }> {
  const jobId = "job_" + crypto.randomUUID();

  await pool.query(
    `INSERT INTO jobs (id, user_id, type, status, progress, payload)
     VALUES ($1, $2, $3, 'queued', 0, $4)`,
    [jobId, userId, type, JSON.stringify(payload)]
  );

  // Background processing (In-process async)
  (async () => {
    try {
      await updateJobState(jobId, { status: 'processing', progress: 5 } as any);
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
        default:
          throw new Error(`Unhandled job type: ${type}`);
      }

      await updateJobState(jobId, {
        status: 'completed',
        progress: 100,
        result
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
      await updateJobState(jobId, {
        status: 'failed',
        error: err.message
      } as any);
      jobRegistry.broadcast(userId, {
        id: jobId,
        userId,
        status: "failed" as JobStatus,
        error: err.message
      });
    }
  })();

  return { id: jobId };
}

export type JobType =
  | "file_processing"
  | "document_analysis"
  | "template_drafting"
  | "privacy_scanning"
  | "vulnerability_scanning";

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

  const result = await pool.query(
    `UPDATE files SET content = $1, is_encrypted = $2 WHERE id = $3`,
    [encryptedContent, true, fileId]
  );

  if (result.rowCount === 0) throw new Error(`File record ${fileId} not found.`);

  const versionId = "ver_" + crypto.randomUUID();
  await pool.query(
    `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
    [versionId, fileId, encryptedContent]
  );

  await chunkAndIndexDocument(fileId, content, userId);

  return { fileId };
}

async function executeDocumentAnalysis(jobId: string, userId: string, payload: any): Promise<any> {
  const { rows: userRows } = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
  const userRole = userRows[0]?.role || 'USER';

  if (payload.type === "legal_ask") {
    const { prompt, jurisdiction, outputFormat, documents } = payload;
    await updateJobProgress(jobId, userId, 30, "Searching knowledge base and synthesizing advice...");

    const result = await jobRegistry.orchestrator.askLawyer(prompt, userId, documents);
    return result;
  }

  if (payload.prompt && payload.folderIds) {
     const { folderIds, prompt, documentMode, answerStyle, history } = payload;
     await updateJobProgress(jobId, userId, 30, "Analyzing documents in selected folders...");

     const result = await jobRegistry.orchestrator.interactAnalyze(
       folderIds, prompt, userId, documentMode, answerStyle, history, undefined, userRole
     );
     return result;
  }

  const { documentId, content } = payload;

  await updateJobProgress(jobId, userId, 30, "AI agents performing legal audit...");

  const result = await jobRegistry.orchestrator.runAnalysis(documentId, content, userId, undefined, userRole);
  return result;
}

async function executeTemplateDrafting(jobId: string, userId: string, payload: any): Promise<any> {
  if (payload.type === "refine") {
    const { text, refineType, param } = payload;
    let instruction = "";
    if (refineType === "tone") instruction = `Rewrite the following legal text in a ${param} tone.`;
    else if (refineType === "grammar") instruction = `Fix the spelling and grammar in the following legal text while preserving legal meaning.`;
    else if (refineType === "extend") instruction = `Expand the following legal clause with more comprehensive protections.`;
    else if (refineType === "reduce") instruction = `Shorten the following legal clause to its core obligation.`;
    else if (refineType === "simplify") instruction = `Rewrite the following legal text in plain English for a non-lawyer.`;
    else if (refineType === "complete") instruction = `Complete the following sentence or clause in a professional legal manner.`;
    else if (refineType === "ask") instruction = `Follow this custom instruction: ${param}`;

    const prompt = `${instruction}\n\nText:\n${text}\n\nIMPORTANT: Return only the rewritten text without any quotes or preamble.`;

    const result = await withRetry(() => genAI.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt)) as any;
    const content = result.response.text().trim();

    const docId = "doc_" + crypto.randomUUID();
    const title = `Refined Text - ${new Date().toLocaleDateString()}`;

    const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
    const creatorEmail = userRows[0]?.email || "";

    const encryptedContent = encryptData(content);

    await pool.query(
      `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [docId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
    );

    const versionId = "ver_" + crypto.randomUUID();
    await pool.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, docId, encryptedContent]
    );

    return { data: content, file_id: docId };
  }

  const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText } = payload;

  await updateJobProgress(jobId, userId, 20, "Synthesizing legal document...");

  const result = await jobRegistry.orchestrator.runDrafting({
    mode,
    detailLevel: outputLevel,
    instructions,
    formFields,
    templateId,
    sourceText,
    playbookText
  });

  const docId = "doc_" + crypto.randomUUID();
  const title = `AI Draft - ${new Date().toLocaleDateString()}`;

  const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  const creatorEmail = userRows[0]?.email || "";

  const encryptedContent = encryptData(result);

  await pool.query(
    `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [docId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
  );

  const versionId = "ver_" + crypto.randomUUID();
  await pool.query(
    `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
    [versionId, docId, encryptedContent]
  );

  return { content: result, file_id: docId };
}

async function executePrivacyScanning(jobId: string, userId: string, payload: any): Promise<any> {
  await updateJobProgress(jobId, userId, 20, "Scanning website for privacy compliance...");

  const result = await jobRegistry.scanner.scanCookie(payload.url, userId, payload.scanDepth);
  return result;
}

async function executeVulnerabilityScanning(jobId: string, userId: string, payload: any): Promise<any> {
  await updateJobProgress(jobId, userId, 20, "Performing vulnerability assessment...");

  const result = await jobRegistry.scanner.scanVulnerability(payload.url, userId);
  return result;
}
