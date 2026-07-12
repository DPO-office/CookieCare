import { useState, useEffect } from "react";
import type { MouseEvent } from "react";
import { LibraryItem, LibraryTabId } from "../types";
import {
  fetchFolders, fetchLibraryItems, fetchDocuments,
  deleteFolder, deleteDocument, createFolder, createLibraryItem,
  uploadFileToFolder,
} from "../api/vaultApi";
import { apiUrl } from "../../../config";

export function useLibrary(authToken: string, onRefresh: () => void) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);

  const fetchLibraryData = async () => {
    try {
      const [foldersData, libraryItemsData, docsData] = await Promise.all([
        fetchFolders(authToken),
        fetchLibraryItems(authToken),
        fetchDocuments(authToken),
      ]);

      const formattedFolders: LibraryItem[] = foldersData.map((f: any) => ({
        id: f.id,
        type: "files" as const,
        name: f.name,
        description: "-",
        tags: "-",
        itemsCount: 0,
        dateModified: f.updated_at
          ? new Date(f.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-")
          : "-",
        createdBy: "User",
        fileList: docsData.filter((d: any) => d.folder_id === f.id)
          .map((d: any) => ({ name: d.title || d.name, size: "N/A", type: d.type })),
      }));

      const formattedItems: LibraryItem[] = libraryItemsData.map((i: any) => ({
        id: i.id, type: i.type, name: i.name,
        description: i.description || "-", tags: i.tags || "-",
        itemsCount: "1 item",
        dateModified: i.updated_at
          ? new Date(i.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-")
          : "-",
        createdBy: "User",
        details: i.details,
      }));

      const finalFolders = formattedFolders.map((f) => ({
        ...f,
        itemsCount: f.fileList?.length ?? 0,
      }));

      setItems([...finalFolders, ...formattedItems]);
      setSavedDrafts(docsData);
    } catch (err) {
      console.error("Failed to fetch library data", err);
    }
  };

  useEffect(() => { fetchLibraryData(); }, [authToken]);

  const handleCopyId = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteItem = async (id: string, type: LibraryTabId, e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      const ok = type === "files"
        ? await deleteFolder(authToken, id)
        : await deleteDocument(authToken, id);
      if (ok) { fetchLibraryData(); }
    } catch (err) { console.error("Delete failed", err); }
  };

  const handleDeleteDraft = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved draft?")) return;
    try {
      const ok = await deleteDocument(authToken, id);
      if (ok) { setSavedDrafts((prev) => prev.filter((d) => d.id !== id)); onRefresh(); }
    } catch (err) { console.error("Draft delete failed", err); }
  };

  const handleCreateNewItem = async (
    activeTab: LibraryTabId,
    formName: string, formDescription: string, formTags: string, formDetails: string
  ): Promise<boolean> => {
    if (!formName.trim()) return false;
    try {
      const ok = activeTab === "files"
        ? await createFolder(authToken, formName)
        : await createLibraryItem(authToken, activeTab, formName, formDescription, formTags, formDetails);
      if (ok) { fetchLibraryData(); return true; }
    } catch (err) { console.error("Creation failed", err); }
    return false;
  };

  const handleTriggerUpload = async (targetFolderId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !targetFolderId) return;
    setUploadProgress(true);
    try {
      const { sync } = await uploadFileToFolder(authToken, targetFolderId, files[0], (jobId) => {
        const es = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        es.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === jobId) {
            if (payload.job.status === "completed") { es.close(); setUploadProgress(false); fetchLibraryData(); }
            else if (payload.job.status === "failed") { es.close(); setUploadProgress(false); alert("Processing failed: " + payload.job.error); }
          }
        };
      });
      if (sync) { fetchLibraryData(); }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleDeleteFileFromFolder = (folderId: string, fileName: string) => {
    setItems(prev => prev.map((f) => {
      if (f.id !== folderId) return f;
      const updatedList = (f.fileList || []).filter((item) => item.name !== fileName);
      return { ...f, fileList: updatedList, itemsCount: updatedList.length };
    }));
  };

  return {
    items, setItems, savedDrafts, copiedId, uploadProgress,
    fetchLibraryData, handleCopyId, handleDeleteItem, handleDeleteDraft,
    handleCreateNewItem, handleTriggerUpload, handleDeleteFileFromFolder,
  };
}
