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

export interface LibraryItem {
  id: string;
  type: "files" | "prompts" | "questions" | "rulebook" | "templates" | "clauses" | "websites" | "tags";
  name: string;
  description: string;
  tags: string;
  itemsCount: string | number;
  dateModified: string;
  createdBy: string;
  details?: string;
  fileList?: Array<{ id?: string; name: string; size: string; type: string }>;
}
