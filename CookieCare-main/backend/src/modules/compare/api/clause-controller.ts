/**
 * compare/api/clause-controller.ts
 *
 * GET /api/compare/:sessionId/clauses
 *
 * Returns the clause structure (id, title, sectionPath, text) for both
 * documents in a given comparison session.
 *
 * Priority order for clause data:
 *   1. In-memory compareSessionStore (fast, available immediately after pipeline)
 *   2. Persistent jobs table via job id (fallback for server restarts)
 *
 * Only exposes data already computed by the pipeline — no LLM calls.
 */

import { Request, Response } from "express";
import { compareSessionStore } from "../session/compare-session-store.js";
import { pool } from "../../../config/database.js";
import { withTransaction } from "../../../utils/dbUtils.js";

export interface ClauseRecord {
  id: string;
  title: string;
  sectionPath: string[];
  text: string;
}

export interface ClauseStructureResponse {
  sessionId: string;
  clausesA: ClauseRecord[];
  clausesB: ClauseRecord[];
}

export const compareClausesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { sessionId } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Invalid sessionId." });
    return;
  }

  // ── 1. Try in-memory session store first ─────────────────────────────────
  const session = compareSessionStore.get(sessionId);

  if (session) {
    // Auth guard: only the owner can access their clause data
    if (session.userId !== userId) {
      res.status(403).json({ error: "Access denied." });
      return;
    }

    if (session.clausesA && session.clausesB) {
      const response: ClauseStructureResponse = {
        sessionId,
        clausesA: session.clausesA.map((c) => ({
          id: c.id,
          title: c.title,
          // Session store strips sectionPath — treat as empty for chat sessions
          sectionPath: (c as any).sectionPath ?? [],
          text: c.text,
        })),
        clausesB: session.clausesB.map((c) => ({
          id: c.id,
          title: c.title,
          sectionPath: (c as any).sectionPath ?? [],
          text: c.text,
        })),
      };
      res.json(response);
      return;
    }
  }

  // ── 2. Fallback: load from persistent jobs table ─────────────────────────
  // The sessionId equals the job_id, so we can fetch the full result JSONB.
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT result FROM jobs WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)",
        [sessionId]
      );
      return rows;
    });

    if (!rows || rows.length === 0) {
      res.status(404).json({
        error: "Comparison session not found. It may have expired or been deleted.",
      });
      return;
    }

    const jobResult = rows[0].result;
    if (!jobResult) {
      res.status(404).json({ error: "No result data found for this comparison." });
      return;
    }

    const raw = typeof jobResult === "string" ? JSON.parse(jobResult) : jobResult;
    const structure = raw?.structure;

    if (!structure?.clausesA || !structure?.clausesB) {
      res.status(404).json({
        error: "Clause structure data is not available for this comparison.",
      });
      return;
    }

    const response: ClauseStructureResponse = {
      sessionId,
      clausesA: (structure.clausesA as any[]).map((c) => ({
        id: c.id,
        title: c.title,
        sectionPath: c.sectionPath ?? [],
        text: c.text,
      })),
      clausesB: (structure.clausesB as any[]).map((c) => ({
        id: c.id,
        title: c.title,
        sectionPath: c.sectionPath ?? [],
        text: c.text,
      })),
    };

    res.json(response);
  } catch (err: any) {
    console.error(`[compareClausesController] Error fetching clauses for ${sessionId}:`, err.message);
    res.status(500).json({ error: "Failed to retrieve clause data." });
  }
};
