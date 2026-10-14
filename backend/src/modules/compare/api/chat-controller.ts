/**
 * compare/api/chat-controller.ts
 *
 * HTTP controller for POST /api/compare/chat
 *
 * Accepts a follow-up question plus a sessionId (= job_id from compare/start).
 * Retrieves the in-memory compare session, selects minimal relevant context,
 * and returns a markdown answer from the CompareChatAgent.
 *
 * No database access — sessions live in compareSessionStore.
 * No pipeline re-runs — the comparison context is already in memory.
 */

import { Request, Response } from "express";
import { z } from "zod";
import { compareSessionStore } from "../session/compare-session-store.js";
import { compareChatAgent, ChatTurn } from "../agents/compare-chat-agent.js";

// ─── Request validation ───────────────────────────────────────────────────────

const CompareChatRequestSchema = z.object({
  /**
   * The job_id returned by POST /api/compare/start.
   * This is the session key — no separate session token needed.
   */
  sessionId: z.string().min(1),

  /** The user's follow-up question */
  question: z.string().min(1).max(2000),

  /**
   * Prior conversation turns for continuity.
   * The client keeps these in its local message list and sends the last N turns.
   * Maximum 12 turns accepted — older history is dropped server-side.
   */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(12)
    .optional()
    .default([]),
});

// ─── Controller ───────────────────────────────────────────────────────────────

export const compareChatController = async (
  req: Request,
  res: Response
): Promise<void> => {
  // ── Validate body ────────────────────────────────────────────────────────
  const parsed = CompareChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request payload",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { sessionId, question, history } = parsed.data;
  const userId = req.user!.id;

  // ── Retrieve session ─────────────────────────────────────────────────────
  const session = compareSessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({
      error:
        "Comparison session not found or has expired. " +
        "Please run a new comparison to continue the conversation.",
    });
    return;
  }

  // ── Authorisation guard — only the user who started the comparison can chat ──
  if (session.userId !== userId) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  // ── Answer the question ───────────────────────────────────────────────────
  try {
    const answer = await compareChatAgent.answer({
      session,
      question,
      history: history as ChatTurn[],
    });

    res.json({ answer });
  } catch (err: any) {
    console.error(
      `[compareChatController] Agent error for session ${sessionId}:`,
      err.message
    );
    res.status(500).json({
      error: err.message ?? "Failed to generate an answer. Please try again.",
    });
  }
};
