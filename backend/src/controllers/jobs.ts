import { Request, Response } from "express";
import { jobQueue } from "../services/jobQueue.js";

export const getJobs = (req: Request, res: Response) => {
  const userJobs = jobQueue.getUserJobs(req.user!.id);
  res.json(userJobs);
};

export const getJobById = (req: Request, res: Response) => {
  const job = jobQueue.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Background task not found." });
  }
  if (job.userId !== req.user!.id) {
    return res.status(403).json({ error: "Access denied. Multi-tenant boundary constraint rule." });
  }
  res.json(job);
};

export const streamJobs = (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ event: "handshake", status: "online" })}\n\n`);
};
