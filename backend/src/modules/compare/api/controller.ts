/**
 * compare/api/controller.ts
 *
 * HTTP controller for the Compare Agreements endpoint.
 *
 * Pattern mirrors modules/drafting/api/controller.ts:
 *   - Validate the request
 *   - Dispatch to the job queue (async, returns job_id)
 *   - Return 202 Accepted
 *
 * For Phase 1 the job runs the pipeline synchronously inside the job handler
 * and returns the structured CompareState as the job result.  The client can
 * poll GET /api/jobs/:id or subscribe to SSE at GET /api/jobs/sse to receive
 * completion.
 */

import { Request, Response } from "express";
import { fileTypeFromBuffer } from "file-type";
import {
  COMPARE_ALLOWED_MIME_TYPES,
  COMPARE_MAX_FILE_SIZE_BYTES,
  CompareStartRequestSchema,
} from "./schema.js";
import { addJobToQueue } from "../../../services/jobQueue.js";
import { compareSessionStore } from "../session/compare-session-store.js";

/**
 * GET /api/compare/:jobId/pdf?doc=original|revised
 *
 * Stream the stored PDF for a comparison session back to the requesting user.
 * Only the user who owns the session may access it.
 */
export const comparePdfController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { jobId } = req.params;
  const doc = req.query.doc as string;

  if (doc !== "original" && doc !== "revised") {
    res.status(400).json({ error: 'Query param "doc" must be "original" or "revised".' });
    return;
  }

  const session = compareSessionStore.get(jobId);

  if (!session) {
    res.status(404).json({ error: "Comparison session not found or has expired." });
    return;
  }

  // Ownership check — same user that started the comparison
  if (session.userId !== req.user!.id) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const pdfBuffer = doc === "original" ? session.pdfA : session.pdfB;

  if (!pdfBuffer || pdfBuffer.length === 0) {
    res.status(404).json({
      error: `PDF for ${doc} document is not available in this session.`,
    });
    return;
  }

  const fileName =
    doc === "original" ? session.originalFileName : session.revisedFileName;
  const safeFileName = fileName.replace(/[^\w.\-]/g, "_").replace(/\.docx?$/i, ".pdf");

  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": String(pdfBuffer.length),
    "Content-Disposition": `inline; filename="${safeFileName}"`,
    // Cache for the session TTL — avoids re-fetching on every tab focus
    "Cache-Control": "private, max-age=14400",
  });

  res.send(pdfBuffer);
};

/**
 * POST /api/compare/start
 *
 * Accept two document uploads (original + revised), validate them, and
 * dispatch a contract_comparison job to the queue.  Returns 202 Accepted
 * with the job_id so the client can poll for results.
 */
export const compareStartController = async (
  req: Request,
  res: Response
): Promise<void> => {
  // ── Validate body fields ────────────────────────────────────────────────
  const bodyParse = CompareStartRequestSchema.safeParse(req.body);
  if (!bodyParse.success) {
    res.status(400).json({
      error: "Invalid request payload",
      details: bodyParse.error.flatten(),
    });
    return;
  }

  // ── Validate file uploads ────────────────────────────────────────────────
  // multer fields() names must match the frontend slot names: "original", "revised"
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const originalFile = files?.["original"]?.[0];
  const revisedFile = files?.["revised"]?.[0];

  if (!originalFile) {
    res.status(400).json({
      error:
        'No original document uploaded. Send a multipart/form-data request with an "original" file field.',
    });
    return;
  }
  if (!revisedFile) {
    res.status(400).json({
      error:
        'No revised document uploaded. Send a multipart/form-data request with a "revised" file field.',
    });
    return;
  }

  // ── Size guard ───────────────────────────────────────────────────────────
  if (originalFile.size > COMPARE_MAX_FILE_SIZE_BYTES) {
    res.status(400).json({
      error: `Original document exceeds the ${COMPARE_MAX_FILE_SIZE_BYTES / 1024 / 1024}MB size limit.`,
    });
    return;
  }
  if (revisedFile.size > COMPARE_MAX_FILE_SIZE_BYTES) {
    res.status(400).json({
      error: `Revised document exceeds the ${COMPARE_MAX_FILE_SIZE_BYTES / 1024 / 1024}MB size limit.`,
    });
    return;
  }

  // ── MIME type validation (declared) ──────────────────────────────────────
  for (const [slot, file] of [
    ["original", originalFile],
    ["revised", revisedFile],
  ] as const) {
    if (!COMPARE_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      res.status(400).json({
        error: `Unsupported file type for ${slot} document. Only PDF, DOCX, DOC, and TXT files are accepted.`,
      });
      return;
    }
  }

  // ── Magic-byte validation (matches documents.ts controller pattern) ───────
  for (const [slot, file] of [
    ["original", originalFile],
    ["revised", revisedFile],
  ] as const) {
    try {
      const detected = await fileTypeFromBuffer(file.buffer);
      if (detected && !COMPARE_ALLOWED_MIME_TYPES.has(detected.mime)) {
        res.status(400).json({
          error: `File signature mismatch for ${slot} document. The file content does not match its declared type.`,
        });
        return;
      }
    } catch {
      // fileTypeFromBuffer failure is non-fatal — proceed with declared MIME
    }
  }

  // ── Queue the job ────────────────────────────────────────────────────────
  // Buffers are serialised as Base64 so they survive the job queue payload
  // (same pattern used in executeFileProcessing in jobQueue.ts).
  const title =
    bodyParse.data.title ||
    `${originalFile.originalname} vs ${revisedFile.originalname}`;

  try {
    const job = await addJobToQueue(req.user!.id, "contract_comparison", {
      title,
      original: {
        fileBufferBase64: originalFile.buffer.toString("base64"),
        mimeType: originalFile.mimetype,
        fileName: originalFile.originalname,
      },
      revised: {
        fileBufferBase64: revisedFile.buffer.toString("base64"),
        mimeType: revisedFile.mimetype,
        fileName: revisedFile.originalname,
      },
    });

    console.log(
      `[compare/start] Queued contract_comparison job ${job.id} for user ${req.user!.id} — ` +
        `"${originalFile.originalname}" vs "${revisedFile.originalname}"`
    );

    res.status(202).json({ success: true, job_id: job.id });
  } catch (queueErr: any) {
    console.error("[compare/start] Failed to queue job:", queueErr.message);
    res.status(500).json({
      error: "Failed to start comparison. Please try again.",
    });
  }
};
