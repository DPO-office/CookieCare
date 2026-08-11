/**
 * compare/api/route.ts
 *
 * Mirrors modules/drafting/api/route.ts — Express router mounted at
 * /api/compare by src/routes/index.ts.
 */

import { Router } from "express";
import multer from "multer";
import { authenticateToken } from "../../../middleware/auth.js";
import { compareStartController } from "./controller.js";
import { compareChatController } from "./chat-controller.js";
import { COMPARE_MAX_FILE_SIZE_BYTES } from "./schema.js";

const router = Router();

// In-memory storage — buffers are passed through the job queue payload as
// Base64, the same approach used by the DPA review and drafting upload routes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COMPARE_MAX_FILE_SIZE_BYTES },
});

/**
 * POST /api/compare/start
 *
 * Accept two documents (original + revised) and start a comparison job.
 * Returns 202 { success: true, job_id: string }.
 * The client polls GET /api/jobs/:id or subscribes to GET /api/jobs/sse.
 */
router.post(
  "/start",
  authenticateToken,
  upload.fields([
    { name: "original", maxCount: 1 },
    { name: "revised", maxCount: 1 },
  ]),
  compareStartController
);

/**
 * POST /api/compare/chat
 *
 * Answer a follow-up question using the in-memory compare session.
 * Requires { sessionId, question, history? } in the JSON body.
 * Returns { answer: string } (markdown).
 */
router.post("/chat", authenticateToken, compareChatController);

/**
 * GET /api/compare/health
 * Liveness check — no auth required.
 */
router.get("/health", (_req, res) => {
  res.json({ status: "ok", module: "compare" });
});

export default router;
