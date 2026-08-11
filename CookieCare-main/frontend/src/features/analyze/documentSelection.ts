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
