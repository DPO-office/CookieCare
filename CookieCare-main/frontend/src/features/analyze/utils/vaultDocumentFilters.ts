/** Placeholder title used while a draft job is still running — not selectable in vault. */
const DRAFT_PLACEHOLDER_TITLES = new Set([
  "draft in progress...",
  "draft in progress",
]);

export function isPlaceholderVaultDocument(doc: { title?: string; type?: string }): boolean {
  const title = (doc.title ?? "").trim().toLowerCase();
  if (!title) return true;
  if (DRAFT_PLACEHOLDER_TITLES.has(title)) return true;
  return false;
}

export function isVaultFolderFile(doc: { type?: string; title?: string }): boolean {
  if (doc.type === "draft") return false;
  if (doc.type === "ephemeral_upload") return false;
  return !isPlaceholderVaultDocument(doc);
}

/**
 * A saved draft is selectable in the vault picker only when:
 *  - its type is "draft"
 *  - it has a real title (not a placeholder / empty)
 *  - it does not carry a "processing" or "queued" draft_status on its metadata
 *    (guards against partially-completed AI drafts that happened to get a real title
 *    before the job finished)
 */
export function isVaultSavedDraft(doc: {
  type?: string;
  title?: string;
  draft_status?: string;
  metadata?: { status?: string };
}): boolean {
  if (doc.type !== "draft") return false;
  if (isPlaceholderVaultDocument(doc)) return false;
  // Exclude drafts that are still being generated.
  const status = doc.draft_status ?? doc.metadata?.status ?? "";
  if (["processing", "queued", "generating"].includes(String(status).toLowerCase())) {
    return false;
  }
  return true;
}
