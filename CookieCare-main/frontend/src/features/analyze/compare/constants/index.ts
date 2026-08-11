// ─── Compare Documents — Constants ───────────────────────────────────────────

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export const ACCEPTED_EXTENSIONS = ".pdf,.doc,.docx,.txt";

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const SLOT_CONFIG = {
  original: {
    label: "Original Agreement",
    description: "Upload the base version",
  },
  revised: {
    label: "Revised Agreement",
    description: "Upload the updated version",
  },
} as const;
