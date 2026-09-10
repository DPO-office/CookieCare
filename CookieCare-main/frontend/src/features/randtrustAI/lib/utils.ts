// ─── LORA AI — Pure utility helpers ─────────────────────────────────────
// No React dependencies. Safe to import from anywhere.

/**
 * Human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Short random UID — sufficient for local React keys and message IDs.
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
