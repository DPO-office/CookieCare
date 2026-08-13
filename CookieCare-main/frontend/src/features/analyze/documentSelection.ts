import { CustomFolder, SavedDraft } from "./types";

export type SelectedDocumentType = "folder" | "file" | "draft";

export interface SelectedDocument {
  id: string;
  title: string;
  type: SelectedDocumentType;
  folderId?: string;
}

export function getSelectedDocuments(
  folders: CustomFolder[],
  savedDrafts: SavedDraft[]
): SelectedDocument[] {
  const result: SelectedDocument[] = [];

  for (const folder of folders) {
    if (folder.selected) {
      result.push({ id: folder.id, title: folder.name, type: "folder" });
      continue;
    }
    for (const file of folder.files) {
      if (file.selected) {
        result.push({
          id: file.id,
          title: file.title,
          type: "file",
          folderId: folder.id,
        });
      }
    }
  }

  for (const draft of savedDrafts) {
    if (draft.selected) {
      result.push({ id: draft.id, title: draft.title, type: "draft" });
    }
  }

  return result;
}

export function hasSelectedDocuments(
  folders: CustomFolder[],
  savedDrafts: SavedDraft[]
): boolean {
  return getSelectedDocuments(folders, savedDrafts).length > 0;
}

/**
 * Flatten vault selection (folders / files / drafts) into file ids for Analysis PAC.
 * Selecting a folder includes every file in that folder.
 */
export function collectAnalysisDocumentIds(
  folders: CustomFolder[],
  savedDrafts: SavedDraft[]
): { documentIds: string[]; firstTitle: string } {
  const ids: string[] = [];
  const seen = new Set<string>();
  let firstTitle = "";

  const add = (id: string, title: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
    if (!firstTitle) firstTitle = title;
  };

  for (const folder of folders) {
    if (folder.selected) {
      for (const file of folder.files) add(file.id, file.title || folder.name);
      continue;
    }
    for (const file of folder.files) {
      if (file.selected) add(file.id, file.title);
    }
  }

  for (const draft of savedDrafts) {
    if (draft.selected) add(draft.id, draft.title);
  }

  return { documentIds: ids, firstTitle };
}
