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
  return !isPlaceholderVaultDocument(doc);
}

export function isVaultSavedDraft(doc: { type?: string; title?: string }): boolean {
  return doc.type === "draft" && !isPlaceholderVaultDocument(doc);
}
