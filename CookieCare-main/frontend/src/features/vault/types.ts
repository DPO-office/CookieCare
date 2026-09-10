export type LibraryTabId =
  | "files"
  | "prompts"
  | "questions"
  | "rulebook"
  | "templates"
  | "clauses"
  | "websites"
  | "tags"
  | "saved-drafts";

/** Scope of a library item: belongs only to the current user, or shared org-wide. */
export type LibraryItemSource = "private" | "org";

export interface LibraryItem {
  id: string;
  type: "files" | "prompts" | "questions" | "rulebook" | "templates" | "clauses" | "websites" | "tags";
  name: string;
  description: string;
  tags: string;
  itemsCount: string | number;
  dateModified: string;
  createdBy: string;
  /** Ownership scope — defaults to 'private' for legacy rows without a value. */
  source: LibraryItemSource;
  details?: string | Record<string, unknown>;
  fileList?: Array<{ id?: string; name: string; size: string; type: string }>;
}

export interface VaultPendingUpload {
  id: string;
  file: File;
  relativePath?: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  error?: string;
}
