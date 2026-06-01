import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { ScannerService } from "./scannerService.js";

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
        const { fileBufferBase64 } = job.data;
        const content = Buffer.from(fileBufferBase64, "base64").toString("utf-8");
        await chunkAndIndexDocument(job.id, content, job.userId);
      } else if (job.type === "document_analysis") {
        const { documentId, content } = job.data;
        await this.orchestrator.runAnalysis(documentId, content, job.userId);
      } else if (job.type === "privacy_scanning") {
        await this.scanner.scanCookie(job.data.url, job.userId);
      } else if (job.type === "vulnerability_scanning") {
        await this.scanner.scanVulnerability(job.data.url, job.userId);
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
