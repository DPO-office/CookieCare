import { pool } from "../config/database.js";
import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { ScannerService } from "./scannerService.js";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";

class JobQueue {
  private jobs: Map<string, any> = new Map();
  private orchestrator = new AgentOrchestrator();
  private scanner = new ScannerService();

  enqueue(userId: string, type: string, data: any): any {
    const job = {
      id: "job_" + Math.random().toString(36).substr(2, 9),
      userId,
      type,
      status: "pending",
      data,
      createdAt: new Date().toISOString()
    };
    this.jobs.set(job.id, job);
    this.processJob(job);
    return job;
  }

  private async processJob(job: any) {
    job.status = "processing";
    try {
      if (job.type === "file_processing") {
        const { fileId, fileBufferBase64, mimeType } = job.data;
        const buffer = Buffer.from(fileBufferBase64, "base64");
        let content = "";

        try {
          if (mimeType === "application/pdf") {
            const data = await pdf(buffer);
            content = data.text;
          } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const data = await mammoth.extractRawText({ buffer });
            content = data.value;
          } else if (mimeType === "text/plain" || mimeType === "application/json" || mimeType === "text/markdown" || mimeType.startsWith("text/")) {
            content = buffer.toString("utf-8");
          } else {
            content = `[UNSUPPORTED_FORMAT:${mimeType}] Size: ${buffer.length} bytes`;
          }
        } catch (err) {
          console.error(`Extraction failed for ${fileId}:`, err);
          content = `[EXTRACTION_FAILED:${mimeType}] Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        content = content.replace(/\0/g, "");

        const result = await pool.query(
          `UPDATE files SET content = $1 WHERE id = $2`,
          [content, fileId]
        );

        if (result.rowCount === 0) {
          throw new Error(`File record with ID ${fileId} not found in database.`);
        }

        await chunkAndIndexDocument(fileId, content, job.userId);
        job.result = { fileId };
      } else if (job.type === "document_analysis") {
        const { documentId, content } = job.data;
        await this.orchestrator.runAnalysis(documentId, content, job.userId);
      } else if (job.type === "privacy_scanning") {
        job.result = await this.scanner.scanCookie(job.data.url, job.userId, job.data.scanDepth);
      } else if (job.type === "vulnerability_scanning") {
        job.result = await this.scanner.scanVulnerability(job.data.url, job.userId);
      }
      job.status = "completed";
    } catch (err: any) {
      job.status = "failed";
      job.error = err.message;
    }
  }

  getJob(id: string) {
    return this.jobs.get(id);
  }

  getUserJobs(userId: string) {
    return Array.from(this.jobs.values()).filter(j => j.userId === userId);
  }
}

export const jobQueue = new JobQueue();
