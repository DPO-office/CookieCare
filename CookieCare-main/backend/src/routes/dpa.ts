/**
 * POST /api/dpa/review
 *
 * Accepts a multipart/form-data upload of a DPA document (PDF, DOCX, TXT).
 * Extracts text server-side, queues a dpa_review background job, and returns
 * a job_id so the frontend can subscribe via SSE (/api/jobs/sse).
 *
 * Follows the same pattern as /api/analyze/interact and /api/lawyer/ask.
 */

import { Router } from "express";
import { Request, Response } from "express";
import multer from "multer";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
import { fileTypeFromBuffer } from "file-type";
import { authenticateToken } from "../middleware/auth.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();

// Accept files up to 25 MB, in memory — same limit as documents upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
]);

/**
 * Extract plaintext from a file buffer.
 * Reuses the same extraction logic as executeFileProcessing in jobQueue.ts
 * so behaviour is consistent across the codebase.
 */
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const data = await pdf(buffer);
    return data.text;
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const data = await mammoth.extractRawText({ buffer });
    return data.value;
  }

  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }

  // Best-effort fallback for any other content
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}

// POST /api/dpa/review
router.post(
  "/review",
  authenticateToken,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ error: "No file uploaded. Send a multipart/form-data request with a 'file' field." });
    }

    // ── MIME type validation ────────────────────────────────────────────────
    // Check declared MIME type first, then verify magic bytes
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        error:
          "Unsupported file type. Only PDF, DOCX, and TXT files are accepted for DPA review.",
      });
    }

    try {
      const detected = await fileTypeFromBuffer(file.buffer);
      // For text files, fileTypeFromBuffer returns undefined — that's fine
      if (detected && !ALLOWED_MIME_TYPES.has(detected.mime)) {
        return res.status(400).json({
          error: "File signature mismatch. The file content does not match its declared type.",
        });
      }
    } catch {
      // Non-fatal — proceed with declared MIME
    }

    // ── Text extraction ─────────────────────────────────────────────────────
    let documentText: string;
    try {
      documentText = await extractText(file.buffer, file.mimetype);
    } catch (extractErr: any) {
      console.error("[dpa/review] Text extraction failed:", extractErr.message);
      return res.status(422).json({
        error: `Failed to extract text from the uploaded file: ${extractErr.message}`,
      });
    }

    // Sanity check — reject empty or near-empty documents
    const cleanedText = documentText.replace(/\s+/g, " ").trim();
    if (cleanedText.length < 100) {
      return res.status(422).json({
        error:
          "The uploaded file appears to be empty or contains insufficient text for analysis.",
      });
    }

    // ── Queue the job ───────────────────────────────────────────────────────
    try {
      const job = await addJobToQueue(req.user!.id, "dpa_review", {
        documentText: cleanedText,
        fileName: file.originalname,
        // fileId is omitted here because the DPA is reviewed ephemerally —
        // it is not persisted to the documents vault unless the user chooses to.
        // Pass fileId from req.body if the caller has already uploaded it.
        fileId: req.body?.file_id ?? undefined,
      });

      console.log(
        `[dpa/review] Queued dpa_review job ${job.id} for user ${req.user!.id}, ` +
          `file: "${file.originalname}", text length: ${cleanedText.length}`
      );

      return res.status(202).json({ success: true, job_id: job.id });
    } catch (queueErr: any) {
      console.error("[dpa/review] Failed to queue job:", queueErr.message);
      return res.status(500).json({ error: "Failed to start DPA review. Please try again." });
    }
  }
);

export default router;
