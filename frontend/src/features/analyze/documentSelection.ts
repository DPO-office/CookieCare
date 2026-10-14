import { CustomFolder, SavedDraft } from "./types";
import type { EphemeralFile } from "./hooks/useAnalyzeData";

export type SelectedDocumentType = "folder" | "file" | "draft" | "ephemeral";

export interface SelectedDocument {
  id: string;
  title: string;
  type: SelectedDocumentType;
  folderId?: string;
}

export function getSelectedDocuments(
  folders: CustomFolder[],
  savedDrafts: SavedDraft[],
  ephemeralFiles: EphemeralFile[] = []
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

  // Ephemeral files are always "selected" — they were attached directly by the user
  for (const ef of ephemeralFiles) {
    result.push({ id: ef.id, title: ef.title, type: "ephemeral" });
  }

  return result;
}

export function hasSelectedDocuments(
  folders: CustomFolder[],
  savedDrafts: SavedDraft[],
  ephemeralFiles: EphemeralFile[] = []
): boolean {
  return getSelectedDocuments(folders, savedDrafts, ephemeralFiles).length > 0;
}

/**
 * Flatten vault selection (folders / files / drafts / ephemeral) into file ids
 * for the Analysis PAC job. Selecting a folder includes every file in that folder.
 */
export function collectAnalysisDocumentIds(
  folders: CustomFolder[],
  savedDrafts: SavedDraft[],
  ephemeralFiles: EphemeralFile[] = []
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

  // Always include ephemeral files — they were just uploaded for this analysis
  for (const ef of ephemeralFiles) {
    add(ef.id, ef.title);
  }

  return { documentIds: ids, firstTitle };
}
