/**
 * POST /api/ai-ethics
 *
 * Accepts multipart/form-data with:
 *   - files[]    : one or more AI documents (PDF, DOCX, TXT) — optional
 *   - websiteUrl : AI company website URL — optional
 *
 * At least one of files or websiteUrl must be provided.
 *
 * Extracts text server-side, queues an ai_ethics_review background job, and
 * returns a job_id so the frontend can subscribe via SSE (/api/jobs/sse).
 *
 * Follows the same pattern as /api/vendor-review.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
import { fileTypeFromBuffer } from "file-type";
import { authenticateToken } from "../middleware/auth.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();

// Accept up to 10 files, each up to 25 MB — same limits as the document vault
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
]);

/**
 * Extract plaintext from a single file buffer.
 * Reuses the same extraction strategy as routes/dpa.ts and routes/vendorReview.ts.
 */
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const data = await pdf(buffer);
    return data.text;
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const data = await mammoth.extractRawText({ buffer });
    return data.value;
  }

  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }

  // Best-effort fallback
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}

// POST /api/ai-ethics
router.post(
  "/",
  authenticateToken,
  upload.array("files", 10),
  async (req: Request, res: Response) => {
    const files     = req.files as Express.Multer.File[] | undefined;
    const websiteUrl = (req.body?.websiteUrl ?? "").trim();

    // ── Validate: at least one input required ──────────────────────────────
    const hasFiles = Array.isArray(files) && files.length > 0;
    const hasUrl   = websiteUrl.length > 0;

    if (!hasFiles && !hasUrl) {
      return res.status(400).json({
        error:
          "At least one AI document or a website URL is required. " +
          "Send files in a 'files' multipart field and/or a 'websiteUrl' text field.",
      });
    }

    // ── MIME validation for uploaded files ─────────────────────────────────
    if (hasFiles) {
      for (const file of files!) {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return res.status(400).json({
            error: `Unsupported file type for "${file.originalname}". Only PDF, DOCX, and TXT are accepted.`,
          });
        }

        try {
          const detected = await fileTypeFromBuffer(file.buffer);
          if (detected && !ALLOWED_MIME_TYPES.has(detected.mime)) {
            return res.status(400).json({
              error: `File signature mismatch for "${file.originalname}". Content does not match declared type.`,
            });
          }
        } catch {
          // Non-fatal — proceed with declared MIME
        }
      }
    }

    // ── Text extraction from uploaded documents ────────────────────────────
    const extractedTexts: string[] = [];

    if (hasFiles) {
      for (const file of files!) {
        try {
          const text    = await extractText(file.buffer, file.mimetype);
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned.length > 50) {
            extractedTexts.push(`[DOCUMENT: ${file.originalname}]\n${cleaned}`);
            console.log(
              `[ai-ethics] Extracted ${cleaned.length} chars from "${file.originalname}"`
            );
          } else {
            console.warn(
              `[ai-ethics] "${file.originalname}" yielded insufficient text (${cleaned.length} chars) — skipping`
            );
          }
        } catch (extractErr: any) {
          console.error(
            `[ai-ethics] Text extraction failed for "${file.originalname}":`,
            extractErr.message
          );
          return res.status(422).json({
            error: `Failed to extract text from "${file.originalname}": ${extractErr.message}`,
          });
        }
      }

      if (!hasUrl && extractedTexts.length === 0) {
        return res.status(422).json({
          error: "All uploaded files appear to be empty or contain insufficient text for analysis.",
        });
      }
    }

    const mergedDocumentText = extractedTexts.join("\n\n---\n\n");
    const fileNames          = hasFiles ? files!.map((f) => f.originalname) : [];

    // ── Queue the ai_ethics_review job ─────────────────────────────────────
    try {
      const job = await addJobToQueue(req.user!.id, "ai_ethics_review", {
        documentText: mergedDocumentText,
        websiteUrl:   hasUrl ? websiteUrl : undefined,
        fileNames,
        fileIds:      [] as string[], // ephemeral upload: no DB-persisted file IDs yet
      });

      console.log(
        `[ai-ethics] Queued ai_ethics_review job ${job.id} for user ${req.user!.id} — ` +
          `files: ${fileNames.join(", ") || "none"}, url: ${websiteUrl || "none"}, ` +
          `mergedTextLen: ${mergedDocumentText.length}`
      );

      return res.status(202).json({ success: true, job_id: job.id });
    } catch (queueErr: any) {
      console.error("[ai-ethics] Failed to queue job:", queueErr.message);
      return res.status(500).json({
        error: "Failed to start AI Ethics review. Please try again.",
      });
    }
  }
);

export default router;
