import { Request, Response } from "express";
import { jobRegistry } from "../services/jobQueue.js";

export const getJobs = async (req: Request, res: Response) => {
  try {
    const userJobs = await jobRegistry.getUserJobs(req.user!.id);
    res.json(userJobs);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    const job = await jobRegistry.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Background task not found." });
    }
    if (job.userId !== req.user!.id) {
      return res.status(403).json({ error: "Access denied. Multi-tenant boundary constraint rule." });
    }
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch job details" });
  }
};

export const streamJobs = (req: Request, res: Response) => {
  const userId = req.user!.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const clientId = jobRegistry.addClient(userId, res);

  req.on("close", () => {
    jobRegistry.removeClient(clientId);
  });

  res.write(`data: ${JSON.stringify({ event: "handshake", status: "online" })}\n\n`);
};
