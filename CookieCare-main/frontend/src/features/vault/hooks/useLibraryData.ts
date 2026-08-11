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
  ) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      const ok =
        type === "files"
          ? await deleteFolder(authToken, id)
          : await deleteDocument(authToken, id);
      if (ok) fetchLibraryData();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleDeleteDraft = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved draft?")) return;
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
    formDetails: string
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
              formDetails
            );
      if (ok) {
        fetchLibraryData();
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
