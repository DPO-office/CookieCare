import { Request, Response } from "express";
import { addJobToQueue } from "../../../services/jobQueue.js";
import { AnalysisRequestSchema, ResumeAskRequestSchema } from "./schema.js";
import { pool } from "../../../config/database.js";
import type { AnalysisState } from "../models/analysis-state.js";

export const analyzePacController = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = AnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request payload",
        details: parsed.error.flatten(),
      });
      return;
    }

    const job = await addJobToQueue(req.user!.id, "analysis_pac", {
      ...parsed.data,
      intent: "CREATE",
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const resumeAskController = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ResumeAskRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid resume payload",
        details: parsed.error.flatten(),
      });
      return;
    }

    const job = await addJobToQueue(req.user!.id, "analysis_pac", {
      intent: "RESUME_ASK",
      sessionId: parsed.data.sessionId,
      answers: parsed.data.answers,
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getSessionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = String(req.params.sessionId || "");
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT state_snapshot_json
       FROM analysis_state_ledger
       WHERE session_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [sessionId]
    );

    if (!rows.length) {
      res.status(404).json({ error: "No analysis session found" });
      return;
    }

    const snapshot = rows[0].state_snapshot_json as AnalysisState;
    res.json({
      success: true,
      sessionId,
      findings: snapshot.findings ?? [],
      renderedOutput: snapshot.renderedOutput,
      declineMessage: snapshot.declineMessage,
      conversation: snapshot.conversation,
      agent: snapshot.agent,
      critique: snapshot.critique,
    });
  } catch (err: any) {
    // Table may not exist yet — return clear error
    res.status(500).json({ error: err.message });
  }
};
