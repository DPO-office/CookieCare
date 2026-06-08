import { pool } from "../config/database.js";
import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { ScannerService } from "./scannerService.js";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
import crypto from "crypto";
import { encryptData } from "../utils/crypto.js";
import { Queue, Worker, Job as BullJob } from "bullmq";
import IORedis from "ioredis";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

const redisConnection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const jobQueueName = "privsecai-jobs";
export const jobQueue = new Queue(jobQueueName, { connection: redisConnection as any });

/**
 * Internal helper to update persistent job state
 */
async function updateJobState(jobId: string, updates: { status?: string; progress?: number; message?: string; result?: any; error?: string }) {
  const { status, progress, message, result, error } = updates;
  const fields = [];
  const values = [];
  let idx = 1;

  if (status) { fields.push(`status = $${idx++}`); values.push(status); }
  if (progress !== undefined) { fields.push(`progress = $${idx++}`); values.push(progress); }
  if (message) { fields.push(`message = $${idx++}`); values.push(message); }
  if (result !== undefined) { fields.push(`result = $${idx++}`); values.push(JSON.stringify(result)); }
  if (error) { fields.push(`error = $${idx++}`); values.push(error); }

  if (status === 'completed' || status === 'failed') {
    fields.push(`completed_at = CURRENT_TIMESTAMP`);
  }

  if (fields.length === 0) return;

  values.push(jobId);
  await pool.query(`UPDATE jobs SET ${fields.join(", ")} WHERE id = $${idx}`, values);
}

/**
 * Enhanced Job Adder that persists to PostgreSQL for cross-session tracking
 */
export async function addJobToQueue(userId: string, type: JobType, payload: any) {
  const jobId = crypto.randomUUID();

  // 1. Persist to DB first to avoid race conditions with workers
  // Note: Using pool here because this is often called before middleware or outside request context
  // But we should try to set the context if possible, or ensure 'jobs' table RLS handles system insertions
  await pool.query(
    `INSERT INTO jobs (id, user_id, type, status, progress, message, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [jobId, userId, type, "queued", 0, "Job queued in BullMQ...", JSON.stringify(payload)]
  );

  // 2. Add to BullMQ with the same ID
  const job = await jobQueue.add(type, {
    type,
    userId,
    payload,
    message: "Job queued in BullMQ..."
  }, { jobId });

  return job;
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

    // Start a 15-second heartbeat to keep connection alive during long AI tasks
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
    const bullJob = await BullJob.fromId(jobQueue, id);
    if (!bullJob) return null;
    return this.transformBullJob(bullJob);
  }

  public async getUserJobs(userId: string): Promise<Job[]> {
    const jobs = await jobQueue.getJobs(["active", "waiting", "completed", "failed", "delayed"]);
    return (await Promise.all(jobs.map(j => this.transformBullJob(j))))
      .filter(j => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async transformBullJob(bullJob: BullJob): Promise<Job> {
    const state = await bullJob.getState();
    return {
      id: bullJob.id!,
      userId: bullJob.data.userId,
      type: bullJob.data.type,
      status: state as JobStatus,
      progress: bullJob.progress as number,
      message: bullJob.data.message || "",
      payload: bullJob.data.payload,
      result: bullJob.returnvalue,
      error: bullJob.failedReason,
      createdAt: new Date(bullJob.timestamp).toISOString(),
      completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn).toISOString() : undefined,
    };
  }
}

export const jobRegistry = new BackgroundJobRegistry();

const worker = new Worker(jobQueueName, async (job: BullJob) => {
  const { type, userId, payload } = job.data;

  await updateJobState(job.id!, {
    status: 'processing',
    progress: 5,
    message: "Acquiring secure execution container..."
  });

  await job.updateProgress(5);
  job.data.message = "Acquiring secure execution container...";
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

  try {
    switch (type) {
      case "file_processing":
        return await executeFileProcessing(job);
      case "document_analysis":
        return await executeDocumentAnalysis(job);
      case "privacy_scanning":
        return await executePrivacyScanning(job);
      case "vulnerability_scanning":
        return await executeVulnerabilityScanning(job);
      case "template_drafting":
        return await executeTemplateDrafting(job);
      default:
        throw new Error(`Unhandled job type: ${type}`);
    }
  } catch (err: any) {
    console.error(`[Worker] Job ${job.id} failed:`, err);
    throw err;
  }
}, { connection: redisConnection as any, concurrency: 3 });

worker.on("completed", async (job: BullJob) => {
  if (job) {
    await updateJobState(job.id!, {
      status: 'completed',
      progress: 100,
      result: job.returnvalue
    });
    jobRegistry.broadcast(job.data.userId, await jobRegistry.transformBullJob(job));
  }
});

worker.on("failed", async (job: BullJob | undefined, err: Error) => {
  if (job) {
    await updateJobState(job.id!, {
      status: 'failed',
      error: err.message
    });
    jobRegistry.broadcast(job.data.userId, await jobRegistry.transformBullJob(job));
  }
});

async function executeFileProcessing(job: BullJob): Promise<any> {
  const { userId, payload } = job.data;
  const { fileId, fileBufferBase64, mimeType } = payload;

  const msg = "Extracting text from document...";
  await updateJobState(job.id!, { progress: 15, message: msg });
  await job.updateProgress(15);
  job.data.message = msg;
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

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

  const msg2 = "Updating database and indexing for search...";
  await updateJobState(job.id!, { progress: 50, message: msg2 });
  await job.updateProgress(50);
  job.data.message = msg2;
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

  const result = await pool.query(
    `UPDATE files SET content = $1, is_encrypted = $2 WHERE id = $3`,
    [encryptedContent, true, fileId]
  );

  if (result.rowCount === 0) throw new Error(`File record ${fileId} not found.`);

  await chunkAndIndexDocument(fileId, content, userId);

  await job.updateProgress(100);
  job.data.message = "File processing complete.";
  return { fileId };
}

async function executeDocumentAnalysis(job: BullJob): Promise<any> {
  const { userId, payload } = job.data;

  if (payload.type === "legal_ask") {
    const { prompt, jurisdiction, outputFormat, documents } = payload;
    const msg = "Searching knowledge base and synthesizing advice...";
    await updateJobState(job.id!, { progress: 30, message: msg });
    await job.updateProgress(30);
    jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

    const context = await jobRegistry.orchestrator.askLawyer(prompt, userId);

    await updateJobState(job.id!, { progress: 100, message: "Advice synthesized." });
    return { text: context };
  }

  if (payload.prompt && payload.folderIds) {
     const { folderIds, prompt, documentMode, answerStyle, history } = payload;
     const msg = "Analyzing documents in selected folders...";
     await updateJobState(job.id!, { progress: 30, message: msg });
     await job.updateProgress(30);
     jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

     const result = await jobRegistry.orchestrator.interactAnalyze(
       folderIds, prompt, userId, documentMode, answerStyle, history
     );
     return result;
  }

  const { documentId, content } = payload;

  const msg = "AI agents performing legal audit...";
  await updateJobState(job.id!, { progress: 30, message: msg });
  await job.updateProgress(30);
  job.data.message = msg;
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

  const result = await jobRegistry.orchestrator.runAnalysis(documentId, content, userId);

  const msg2 = "Analysis complete.";
  await updateJobState(job.id!, { progress: 100, message: msg2 });
  await job.updateProgress(100);
  job.data.message = msg2;
  return result;
}

async function executeTemplateDrafting(job: BullJob): Promise<any> {
  const { userId, payload } = job.data;

  if (payload.type === "refine") {
    const { text, refineType, param } = payload;
    const model = (genAI as any).getGenerativeModel({ model: "gemini-2.0-flash" });

    let instruction = "";
    if (refineType === "tone") instruction = `Rewrite the following legal text in a ${param} tone.`;
    else if (refineType === "grammar") instruction = `Fix the spelling and grammar in the following legal text while preserving legal meaning.`;
    else if (refineType === "extend") instruction = `Expand the following legal clause with more comprehensive protections.`;
    else if (refineType === "reduce") instruction = `Shorten the following legal clause to its core obligation.`;
    else if (refineType === "simplify") instruction = `Rewrite the following legal text in plain English for a non-lawyer.`;
    else if (refineType === "complete") instruction = `Complete the following sentence or clause in a professional legal manner.`;
    else if (refineType === "ask") instruction = `Follow this custom instruction: ${param}`;

    const prompt = `${instruction}\n\nText:\n${text}\n\nIMPORTANT: Return only the rewritten text without any quotes or preamble.`;

    const result = await model.generateContent(prompt);
    return { data: result.response.text().trim() };
  }

  const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText } = payload;

  const msg = "Synthesizing legal document...";
  await updateJobState(job.id!, { progress: 20, message: msg });
  await job.updateProgress(20);
  job.data.message = msg;
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

  const result = await jobRegistry.orchestrator.runDrafting({
    mode,
    detailLevel: outputLevel,
    instructions,
    formFields,
    templateId,
    sourceText,
    playbookText
  });

  const msg2 = "Drafting complete.";
  await updateJobState(job.id!, { progress: 100, message: msg2 });
  await job.updateProgress(100);
  job.data.message = msg2;
  return { content: result };
}

async function executePrivacyScanning(job: BullJob): Promise<any> {
  const { userId, payload } = job.data;
  const msg = "Scanning website for privacy compliance...";
  await updateJobState(job.id!, { progress: 20, message: msg });
  await job.updateProgress(20);
  job.data.message = msg;
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

  const result = await jobRegistry.scanner.scanCookie(payload.url, userId, payload.scanDepth);

  const msg2 = "Privacy scan complete.";
  await updateJobState(job.id!, { progress: 100, message: msg2 });
  await job.updateProgress(100);
  job.data.message = msg2;
  return result;
}

async function executeVulnerabilityScanning(job: BullJob): Promise<any> {
  const { userId, payload } = job.data;
  const msg = "Performing vulnerability assessment...";
  await updateJobState(job.id!, { progress: 20, message: msg });
  await job.updateProgress(20);
  job.data.message = msg;
  jobRegistry.broadcast(userId, await jobRegistry.transformBullJob(job));

  const result = await jobRegistry.scanner.scanVulnerability(payload.url, userId);

  const msg2 = "Vulnerability scan complete.";
  await updateJobState(job.id!, { progress: 100, message: msg2 });
  await job.updateProgress(100);
  job.data.message = msg2;
  return result;
}
