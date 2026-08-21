import { useState, useEffect, useRef } from "react";
import { CustomFolder, SavedDraft } from "../types";
import {
  SYSTEM_FOLDER_NAME,
  DEFAULT_PROMPT_LIBRARY,
  DEFAULT_QUESTIONS_LIBRARY,
} from "../constants";
import { isVaultFolderFile, isVaultSavedDraft } from "../utils/vaultDocumentFilters";
import {
  fetchFolders,
  fetchDocuments,
  fetchLibraryItems as fetchSharedLibraryItems,
  invalidateVaultCache,
} from "../../vault/api/vaultApi";

export interface PromptLibraryItem {
  title: string;
  prompt: string;
}

/** A file uploaded ephemerally (analyze-only, never stored in the vault). */
export interface EphemeralFile {
  id: string;
  title: string;
}

export function useAnalyzeData(authToken: string) {
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<PromptLibraryItem[]>([]);
  const [questionsLibrary, setQuestionsLibrary] = useState<string[]>([]);
  /** File ids waiting to be selected after the next folders refresh. */
  const pendingSelectIdsRef = useRef<Set<string>>(new Set());
  /** Ephemeral files uploaded directly in the composer — never in the vault. */
  const [ephemeralFiles, setEphemeralFiles] = useState<EphemeralFile[]>([]);

  /**
   * Refresh folders + docs. Pass `forceRefresh: true` after a mutation
   * (upload, delete) to bypass the shared cache and get a live read.
   */
  const fetchFoldersAndDocs = async (options?: { selectFileIds?: string[]; forceRefresh?: boolean }) => {
    try {
      if (options?.selectFileIds?.length) {
        options.selectFileIds.forEach((id) => pendingSelectIdsRef.current.add(id));
      }
      if (options?.forceRefresh) {
        invalidateVaultCache(authToken);
      }

      // Use the shared vault cache — avoids duplicate network calls when both
      // the vault page and the analyze page are mounted at the same time.
      const [foldersData, docsData] = await Promise.all([
        fetchFolders(authToken),
        fetchDocuments(authToken),
      ]);

      const pendingSelect = pendingSelectIdsRef.current;

      // Keep all folders in state (including "Uploaded Documents") so file IDs
      // from on-the-go uploads resolve correctly via selectFilesByIds.
      // The vault picker UI explicitly hides the "Uploaded Documents" folder via
      // sanitizeFolders in VaultPickerSheet — state keeps it for id resolution only.
      const analyzeFolders = [...foldersData].sort((a: any, b: any) => {
        if (a.name === SYSTEM_FOLDER_NAME) return -1;
        if (b.name === SYSTEM_FOLDER_NAME) return 1;
        return String(a.name).localeCompare(String(b.name));
      });

      setFolders((prev) =>
        analyzeFolders.map((f: any) => {
          const existing = prev.find((p) => p.id === f.id);
          const folderDocs = docsData.filter(
            (d: any) => d.folder_id === f.id && isVaultFolderFile(d)
          );
          const files = folderDocs.map((d: any) => {
            const wasSelected =
              existing?.files.find((fi) => fi.id === d.id)?.selected ??
              (existing?.selected ?? false);
            return {
              id: d.id,
              title: d.title,
              selected: wasSelected || pendingSelect.has(d.id),
            };
          });
          const allSelected = files.length > 0 && files.every((fi) => fi.selected);
          const touchedPending = files.some((fi) => pendingSelect.has(fi.id));
          return {
            id: f.id,
            name: f.name,
            filesCount: folderDocs.length,
            selected: allSelected,
            expanded: Boolean(existing?.expanded) || touchedPending || f.name === SYSTEM_FOLDER_NAME,
            files,
          } as CustomFolder;
        })
      );

      // Clear only ids that are now present in the document list.
      const knownIds = new Set(docsData.map((d: any) => d.id as string));
      pendingSelectIdsRef.current = new Set(
        [...pendingSelect].filter((id) => !knownIds.has(id))
      );

      const drafts = docsData.filter((d: any) => isVaultSavedDraft(d));
      setSavedDrafts((prev) =>
        drafts.map((d: any) => ({
          id: d.id,
          title: d.title,
          draft_status: d.draft_status ?? d.metadata?.status ?? "",
          selected: prev.find((p) => p.id === d.id)?.selected ?? false,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  const fetchLibraryItems = async () => {
    try {
      // Uses the shared vault cache — no duplicate network call if vault page
      // already fetched library items in the same session window.
      const data = await fetchSharedLibraryItems(authToken);

      const prompts = data
        .filter((i: any) => i.type === "prompts" && !String(i.tags ?? "").toLowerCase().includes("drafting"))
        .map((p: any) => ({ title: p.name, prompt: p.details }));
      const questions = data
        .filter((i: any) => i.type === "questions")
        .flatMap((q: any) =>
          q.details.split("\n").filter((l: string) => l.trim())
        );

      setPromptLibrary(prompts.length > 0 ? prompts : DEFAULT_PROMPT_LIBRARY);
      setQuestionsLibrary(questions.length > 0 ? questions : DEFAULT_QUESTIONS_LIBRARY);
    } catch (err) {
      console.error("Library items fetch failed", err);
    }
  };

  useEffect(() => {
    fetchFoldersAndDocs();
    fetchLibraryItems();
  }, [authToken]);

  // --- Selection helpers ---
  const toggleFolderSelection = (id: string) => {
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const newSelected = !f.selected;
        return { ...f, selected: newSelected, files: f.files.map((fi) => ({ ...fi, selected: newSelected })) };
      })
    );
  };

  const toggleFolderExpanded = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, expanded: !f.expanded } : f))
    );
  };

  const toggleFileSelection = (folderId: string, fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id !== folderId) return f;
        const updatedFiles = f.files.map((fi) =>
          fi.id === fileId ? { ...fi, selected: !fi.selected } : fi
        );
        const allSelected = updatedFiles.length > 0 && updatedFiles.every((fi) => fi.selected);
        return { ...f, files: updatedFiles, selected: allSelected };
      })
    );
  };

  const toggleDraftSelection = (id: string) => {
    setSavedDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d))
    );
  };

  const deselectDocument = (
    id: string,
    type: "folder" | "file" | "draft" | "ephemeral",
    folderId?: string
  ) => {
    if (type === "ephemeral") {
      setEphemeralFiles((prev) => prev.filter((f) => f.id !== id));
      return;
    }
    if (type === "draft") {
      setSavedDrafts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, selected: false } : d))
      );
      return;
    }
    if (type === "folder") {
      setFolders((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, selected: false, files: f.files.map((fi) => ({ ...fi, selected: false })) }
            : f
        )
      );
      return;
    }
    if (type === "file" && folderId) {
      setFolders((prev) =>
        prev.map((f) => {
          if (f.id !== folderId) return f;
          const updatedFiles = f.files.map((fi) =>
            fi.id === id ? { ...fi, selected: false } : fi
          );
          return { ...f, files: updatedFiles, selected: false };
        })
      );
    }
  };

  const selectFile = (folderId: string, fileId: string) => {
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id !== folderId) return f;
        const updatedFiles = f.files.map((fi) =>
          fi.id === fileId ? { ...fi, selected: true } : fi
        );
        const allSelected = updatedFiles.length > 0 && updatedFiles.every((fi) => fi.selected);
        return { ...f, files: updatedFiles, selected: allSelected };
      })
    );
  };

  /** Select uploaded files by id; queues ids for the next refresh if not loaded yet. */
  const selectFilesByIds = (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    fileIds.forEach((id) => pendingSelectIdsRef.current.add(id));
    const idSet = new Set(fileIds);
    setFolders((prev) =>
      prev.map((f) => {
        const updatedFiles = f.files.map((fi) =>
          idSet.has(fi.id) ? { ...fi, selected: true } : fi
        );
        const touched = updatedFiles.some((fi, i) => fi.selected !== f.files[i].selected);
        if (!touched) return f;
        const allSelected = updatedFiles.length > 0 && updatedFiles.every((fi) => fi.selected);
        return {
          ...f,
          files: updatedFiles,
          selected: allSelected,
          expanded: true,
        };
      })
    );
  };

  /**
   * Register ephemeral files (direct uploads from the composer).
   * These are never stored in the vault — they live only in this state
   * and are passed straight to the analysis job by ID.
   */
  const addEphemeralFiles = (files: EphemeralFile[]) => {
    if (files.length === 0) return;
    setEphemeralFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id));
      const newOnes = files.filter((f) => !existingIds.has(f.id));
      return [...prev, ...newOnes];
    });
  };

  const removeEphemeralFile = (id: string) => {
    setEphemeralFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearEphemeralFiles = () => setEphemeralFiles([]);

  return {
    folders,
    savedDrafts,
    ephemeralFiles,
    promptLibrary,
    questionsLibrary,
    fetchFoldersAndDocs,
    toggleFolderSelection,
    toggleFolderExpanded,
    toggleFileSelection,
    toggleDraftSelection,
    deselectDocument,
    selectFile,
    selectFilesByIds,
    addEphemeralFiles,
    removeEphemeralFile,
    clearEphemeralFiles,
  };
}
