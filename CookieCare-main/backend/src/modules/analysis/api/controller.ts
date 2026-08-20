import { Request, Response } from "express";
import { addJobToQueue } from "../../../services/jobQueue.js";
import { AnalysisRequestSchema, ResumeAskRequestSchema } from "./schema.js";
import { withTransaction } from "../../../utils/dbUtils.js";
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

    const userId = req.user!.id;
    const userRole = req.user!.role ?? "USER";

    // Enforce ownership: the session must belong to a job owned by this user.
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        `SELECT asl.state_snapshot_json
         FROM analysis_state_ledger asl
         JOIN jobs j ON j.result->>'sessionId' = asl.session_id
         WHERE asl.session_id = $1
           AND j.user_id = current_setting('app.current_user_id', true)
         ORDER BY asl.version DESC
         LIMIT 1`,
        [sessionId]
      );
      return rows;
    });

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

/**
 * GET /api/analysis/history
 * Returns the user's past analysis sessions (CREATE runs only), newest first.
 */
export const getHistoryController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role ?? "USER";
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        `SELECT
           j.id                                AS job_id,
           j.status,
           j.created_at,
           j.payload->>'instruction'           AS instruction,
           j.result->>'sessionId'              AS session_id,
           j.result->>'renderedOutput'         AS rendered_output
         FROM jobs j
         WHERE j.user_id = current_setting('app.current_user_id', true)
           AND j.type    = 'analysis_pac'
           AND (j.payload->>'intent' = 'CREATE' OR j.payload->>'intent' IS NULL)
           AND j.status IN ('completed', 'failed')
         ORDER BY j.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return rows;
    });

    const history = rows.map((row: any) => ({
      jobId: row.job_id,
      sessionId: row.session_id ?? null,
      title: row.instruction
        ? String(row.instruction).replace(/\n[\s\S]*/g, "").slice(0, 120).trim()
        : "Untitled analysis",
      status: row.status,
      createdAt: row.created_at,
      renderedOutput: row.rendered_output ?? null,
    }));

    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
