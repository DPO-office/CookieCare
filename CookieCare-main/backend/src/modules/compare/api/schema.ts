import { z } from "zod";

// ─── Allowed file types — mirrors the frontend ACCEPTED_MIME_TYPES constant ──
export const COMPARE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
]);

/** 50 MB — mirrors the frontend MAX_FILE_SIZE_MB constant */
export const COMPARE_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Validated body fields that may accompany the multipart upload.
 * Kept minimal for Phase 1; future phases can extend without breaking
 * existing callers.
 */
export const CompareStartRequestSchema = z.object({
  /**
   * Optional human-readable label for the comparison job.
   * When omitted the API derives a title from the two file names.
   */
  title: z.string().max(200).optional(),
});

export type CompareStartRequest = z.infer<typeof CompareStartRequestSchema>;
