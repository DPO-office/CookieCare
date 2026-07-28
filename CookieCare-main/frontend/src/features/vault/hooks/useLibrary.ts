import { useState, useEffect } from "react";
import type { MouseEvent } from "react";
import { LibraryItem, LibraryTabId } from "../types";
import {
  fetchFolders, fetchLibraryItems, fetchDocuments,
  deleteFolder, deleteDocument, createFolder, createLibraryItem,
  uploadFileToFolder, uploadVaultAsset, VaultIngestCategory,
} from "../api/vaultApi";
import { apiUrl } from "../../../config";

export function useLibrary(authToken: string, onRefresh: () => void) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResultMessage, setUploadResultMessage] = useState<string | null>(null);
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadProgressMessage, setUploadProgressMessage] = useState<string | null>(null);
  const uploadProgress = uploadStatus === "uploading";

  const resetUploadProgress = () => {
    setUploadProgressPercent(0);
    setUploadProgressMessage(null);
  };

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
          .map((d: any) => ({ id: d.id, name: d.title || d.name, size: "N/A", type: d.type })),
      }));

      const formattedItems: LibraryItem[] = libraryItemsData.map((i: any) => {
        let detailsObj: Record<string, unknown> | null = null;
        try {
          detailsObj =
            typeof i.details === "string"
              ? JSON.parse(i.details)
              : i.details && typeof i.details === "object"
                ? i.details
                : null;
        } catch {
          detailsObj = null;
        }

        // Prefer short contract-type chips over giant jurisdiction dumps stored in tags.
        let displayTags = i.tags || "-";
        const contractType =
          typeof detailsObj?.contractType === "string"
            ? detailsObj.contractType.trim()
            : "";
        const jurisdiction =
          typeof detailsObj?.jurisdiction === "string"
            ? detailsObj.jurisdiction.trim()
            : "";
        const shortJuris =
          jurisdiction &&
          jurisdiction.length <= 28 &&
          !/^not\s*specified$/i.test(jurisdiction)
            ? jurisdiction
            : "";
        if (contractType && (i.type === "templates" || i.type === "clauses" || i.type === "rulebook")) {
          displayTags = [contractType, shortJuris].filter(Boolean).join(", ");
        }

        return {
          id: i.id,
          type: i.type,
          name: i.name,
          description: i.description || "-",
          tags: displayTags,
          itemsCount: "1 item",
          dateModified: i.updated_at
            ? new Date(i.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-")
            : "-",
          createdBy: "User",
          details: i.details,
        };
      });

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

  const watchJob = (
    jobId: string,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<any> =>
    new Promise((resolve, reject) => {
      const es = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
      es.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.event !== "job_update" || payload.job?.id !== jobId) return;

        const status = String(payload.job.status || "").toLowerCase();
        const progress =
          typeof payload.job.progress === "number" ? payload.job.progress : undefined;
        const message =
          typeof payload.job.message === "string" ? payload.job.message : undefined;

        if (progress != null || message) {
          onProgress?.(progress ?? 0, message);
        }

        if (status === "completed") {
          onProgress?.(100, message || "Done");
          es.close();
          resolve(payload.job.result);
        } else if (status === "failed") {
          es.close();
          reject(new Error(payload.job.error || message || "Processing failed."));
        }
      };
      es.onerror = () => {
        es.close();
        reject(new Error("Job connection interrupted."));
      };
    });

  const handleTriggerUpload = async (targetFolderId: string, files: FileList | null): Promise<boolean> => {
    if (!files || files.length === 0 || !targetFolderId) return false;
    setUploadStatus("uploading");
    setUploadError(null);
    setUploadResultMessage(null);
    try {
      let pendingJob: Promise<any> | null = null;
      const res = await uploadFileToFolder(authToken, targetFolderId, files[0], (jobId) => {
        pendingJob = watchJob(jobId);
      });
      if (pendingJob) await pendingJob;
      else if (!res.sync) throw new Error("Upload did not return a job id.");
      setUploadStatus("success");
      setUploadResultMessage("File uploaded and parsed successfully!");
      fetchLibraryData();
      return true;
    } catch (err: any) {
      setUploadStatus("error");
      setUploadError(err.message || "Upload failed.");
      return false;
    }
  };

  /**
   * Structured vault ingest for rulebook / templates / clauses tabs.
   * Maps UI tabs → backend upload category.
   * - templates: contractType required
   * - clauses: contractType optional (defaults to General)
   * - rulebook/playbook: company-wide — no contractType
   */
  const handleVaultAssetUpload = async (params: {
    tab: "rulebook" | "templates" | "clauses";
    file: File;
    contractType?: string;
    jurisdiction?: string;
  }): Promise<boolean> => {
    if (params.tab === "templates" && !params.contractType?.trim()) {
      setUploadStatus("error");
      setUploadError("Contract type is required for templates.");
      return false;
    }

    const categoryMap: Record<"rulebook" | "templates" | "clauses", VaultIngestCategory> = {
      rulebook: "playbook",
      templates: "templates",
      clauses: "clauses",
    };

    setUploadStatus("uploading");
    setUploadError(null);
    setUploadResultMessage(null);
    setUploadProgressPercent(5);
    setUploadProgressMessage(
      params.tab === "rulebook"
        ? "Uploading playbook…"
        : params.tab === "templates"
          ? "Uploading template…"
          : "Uploading clause pack…"
    );

    try {
      let pendingJob: Promise<any> | null = null;
      let lastLibraryRefreshAt = 0;
      const uploadRes = await uploadVaultAsset(
        authToken,
        {
          file: params.file,
          category: categoryMap[params.tab],
          contractType: params.contractType?.trim() || undefined,
          jurisdiction: params.jurisdiction?.trim() || undefined,
        },
        (jobId) => {
          pendingJob = watchJob(jobId, (progress, message) => {
            setUploadProgressPercent(Math.max(5, Math.min(99, progress)));
            if (message) setUploadProgressMessage(message);
            // Refresh library occasionally so stage text on the row stays current.
            const now = Date.now();
            if (now - lastLibraryRefreshAt > 8_000) {
              lastLibraryRefreshAt = now;
              fetchLibraryData();
            }
          });
        }
      );

      // All vault ingest categories create a processing library row immediately.
      if (uploadRes.libraryItemId) {
        fetchLibraryData();
      }

      const jobResult = pendingJob ? await pendingJob : null;

      const summary =
        params.tab === "rulebook"
          ? `Playbook ingested (${jobResult?.processedRulesCount ?? "?"} rules).`
          : params.tab === "templates"
            ? `Template stored (${jobResult?.name || jobResult?.templateId || "ok"}).`
            : `Clauses ingested (${jobResult?.processedClausesCount ?? "?"} items).`;

      setUploadProgressPercent(100);
      setUploadProgressMessage(summary);
      setUploadStatus("success");
      setUploadResultMessage(summary);
      fetchLibraryData();
      onRefresh();
      return true;
    } catch (err: any) {
      setUploadStatus("error");
      setUploadError(err.message || "Vault ingest failed.");
      fetchLibraryData();
      return false;
    }
  };

  const handleDeleteFileFromFolder = async (folderId: string, fileId: string) => {
    if (!fileId) return;
    try {
      const ok = await deleteDocument(authToken, fileId);
      if (ok) {
        setItems(prev => prev.map((f) => {
          if (f.id !== folderId) return f;
          const updatedList = (f.fileList || []).filter((item) => item.id !== fileId);
          return { ...f, fileList: updatedList, itemsCount: updatedList.length };
        }));
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to delete file from folder", err);
    }
  };

  return {
    items, setItems, savedDrafts, copiedId, uploadProgress,
    uploadStatus, uploadError, uploadResultMessage, setUploadStatus,
    uploadProgressPercent, uploadProgressMessage, resetUploadProgress,
    fetchLibraryData, handleCopyId, handleDeleteItem, handleDeleteDraft,
    handleCreateNewItem, handleTriggerUpload, handleVaultAssetUpload, handleDeleteFileFromFolder,
  };
}
