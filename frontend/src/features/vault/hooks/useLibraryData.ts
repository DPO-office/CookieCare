/**
 * useLibraryData
 *
 * Owns: remote data fetching, items state, savedDrafts state.
 * Responsibilities: load, create, delete items/folders/drafts, copy ID.
 */

import { useState, useEffect } from "react";
import type { MouseEvent } from "react";
import { LibraryItem, LibraryTabId } from "../types";
import {
  loadLibraryData,
  deleteFolder,
  deleteDocument,
  deleteLibraryItem,
  createFolder,
  createLibraryItem,
} from "../services/libraryService";

export function useLibraryData(authToken: string, onRefresh: () => void) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLibraryData = async () => {
    try {
      const data = await loadLibraryData(authToken);
      setItems(data.items);
      setSavedDrafts(data.savedDrafts);
    } catch (err) {
      console.error("Failed to fetch library data", err);
    }
  };

  useEffect(() => {
    fetchLibraryData();
  }, [authToken]);

  const handleCopyId = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteItem = async (
    id: string,
    type: LibraryTabId,
    e: MouseEvent
  ): Promise<boolean> => {
    // Confirm BEFORE stopPropagation. In some environments (iframes, webviews)
    // window.confirm() is suppressed after stopPropagation() has been called on
    // the originating event — it silently returns false, making delete appear broken.
    if (!window.confirm("Are you sure you want to delete this item?")) return false;
    e.stopPropagation();
    try {
      let ok: boolean;
      if (type === "files") {
        // Folders live in the `folders` table → DELETE /api/folders/:id
        ok = await deleteFolder(authToken, id);
      } else if (type === "saved-drafts") {
        // Saved drafts live in the `files` table → DELETE /api/documents/:id
        ok = await deleteDocument(authToken, id);
      } else {
        // All other vault types (rulebook, templates, clauses, prompts,
        // questions, websites, tags) live in `library_items` → DELETE /api/library-items/:id
        ok = await deleteLibraryItem(authToken, id);
      }
      if (ok) await fetchLibraryData();
      return ok;
    } catch (err) {
      console.error("Delete failed", err);
      return false;
    }
  };

  const handleDeleteDraft = async (id: string, e: MouseEvent) => {
    // Same ordering fix as handleDeleteItem above.
    if (!window.confirm("Are you sure you want to delete this saved draft?")) return;
    e.stopPropagation();
    try {
      const ok = await deleteDocument(authToken, id);
      if (ok) {
        setSavedDrafts((prev) => prev.filter((d) => d.id !== id));
        onRefresh();
      }
    } catch (err) {
      console.error("Draft delete failed", err);
    }
  };

  const handleCreateNewItem = async (
    activeTab: LibraryTabId,
    formName: string,
    formDescription: string,
    formTags: string,
    formDetails: string,
    source: "private" | "org" = "private"
  ): Promise<boolean> => {
    if (!formName.trim()) return false;
    try {
      const ok =
        activeTab === "files"
          ? await createFolder(authToken, formName)
          : await createLibraryItem(
              authToken,
              activeTab,
              formName,
              formDescription,
              formTags,
              formDetails,
              source
            );
      if (ok) {
        await fetchLibraryData();
        return true;
      }
    } catch (err) {
      console.error("Creation failed", err);
    }
    return false;
  };

  const handleDeleteFileFromFolder = async (
    folderId: string,
    fileId: string
  ) => {
    if (!fileId) return;
    try {
      const ok = await deleteDocument(authToken, fileId);
      if (ok) {
        setItems((prev) =>
          prev.map((f) => {
            if (f.id !== folderId) return f;
            const updatedList = (f.fileList || []).filter(
              (item) => item.id !== fileId
            );
            return { ...f, fileList: updatedList, itemsCount: updatedList.length };
          })
        );
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to delete file from folder", err);
    }
  };

  return {
    items,
    setItems,
    savedDrafts,
    copiedId,
    fetchLibraryData,
    handleCopyId,
    handleDeleteItem,
    handleDeleteDraft,
    handleCreateNewItem,
    handleDeleteFileFromFolder,
  };
}
