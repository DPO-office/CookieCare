import { useState, useEffect, useCallback } from "react";
import type { MouseEvent } from "react";
import { LibraryItem, LibraryTabId, VaultPendingUpload } from "../types";
import {
  fetchFolders, fetchLibraryItems, fetchDocuments,
  deleteFolder, deleteDocument, createFolder, createLibraryItem,
  uploadFileToFolder, uploadVaultAsset, VaultIngestCategory,
} from "../api/vaultApi";
import { apiUrl } from "../../../config";
import {
  VAULT_JUNK_FILE_NAMES,
  VAULT_MAX_UPLOAD_BYTES,
  VAULT_MAX_UPLOAD_FILES,
  VAULT_UPLOAD_CONCURRENCY,
  VAULT_UPLOAD_EXTENSIONS,
} from "../constants";

export function useLibrary(authToken: string, onRefresh: () => void) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResultMessage, setUploadResultMessage] = useState<string | null>(null);
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadProgressMessage, setUploadProgressMessage] = useState<string | null>(null);
  const [pendingVaultFiles, setPendingVaultFiles] = useState<VaultPendingUpload[]>([]);
  const [vaultBatchError, setVaultBatchError] = useState<string | null>(null);
  const [suggestedVaultFolderName, setSuggestedVaultFolderName] = useState("");
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

  const addVaultFiles = useCallback((incoming: FileList | File[]) => {
    const files = Array.from(incoming);
    const accepted: File[] = [];
    let unsupported = 0;
    let oversized = 0;

    for (const file of files) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (
        VAULT_JUNK_FILE_NAMES.has(file.name) ||
        file.size === 0 ||
        !VAULT_UPLOAD_EXTENSIONS.includes(extension)
      ) {
        unsupported++;
      } else if (file.size > VAULT_MAX_UPLOAD_BYTES) {
        oversized++;
      } else {
        accepted.push(file);
      }
    }

    const rootFolder = accepted
      .map((file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath)
      .find(Boolean)
      ?.split("/")[0];
    if (rootFolder) setSuggestedVaultFolderName(rootFolder);

    setPendingVaultFiles((current) => {
      const available = Math.max(0, VAULT_MAX_UPLOAD_FILES - current.length);
      const added = accepted.slice(0, available).map((file) => ({
        id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
        file,
        relativePath:
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined,
        status: "pending" as const,
      }));
      if (accepted.length > available) {
        setVaultBatchError(`Maximum ${VAULT_MAX_UPLOAD_FILES} files per upload. ${accepted.length - available} file(s) were not added.`);
      }
      return [...current, ...added];
    });

    if (oversized > 0) {
      setVaultBatchError(`${oversized} file(s) exceeded the 25 MB limit and were not added.`);
    } else if (unsupported > 0) {
      setVaultBatchError(`${unsupported} unsupported or empty file(s) were not added.`);
    } else if (accepted.length > 0) {
      setVaultBatchError(null);
    } else {
      setVaultBatchError("No supported documents were found.");
    }
  }, []);

  const removeVaultFile = useCallback((id: string) => {
    setPendingVaultFiles((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearVaultFiles = useCallback(() => {
    setPendingVaultFiles([]);
    setVaultBatchError(null);
    setSuggestedVaultFolderName("");
    resetUploadProgress();
  }, []);

  const handleCreateUploadFolder = async (name: string): Promise<string | null> => {
    const existing = items.find(
      (item) => item.type === "files" && item.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return existing.id;
    const created = await createFolder(authToken, name);
    return created?.id || null;
  };

  const handleTriggerUpload = async (targetFolderId: string): Promise<boolean> => {
    const files = pendingVaultFiles.filter(
      (item) => item.status === "pending" || item.status === "error"
    );
    if (files.length === 0 || !targetFolderId) return false;
    setUploadStatus("uploading");
    setUploadError(null);
    setUploadResultMessage(null);
    setUploadProgressPercent(0);
    setUploadProgressMessage(`Uploading 0 of ${files.length} files…`);

    let completed = 0;
    let failed = 0;
    const queue = [...files];

    const updateItem = (id: string, patch: Partial<VaultPendingUpload>) => {
      setPendingVaultFiles((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    };

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        updateItem(item.id, { status: "uploading", error: undefined });
        try {
          let jobId: string | undefined;
          const response = await uploadFileToFolder(
            authToken,
            targetFolderId,
            item.file,
            (id) => {
              jobId = id;
              updateItem(item.id, { status: "processing" });
            }
          );
          if (!response.sync) {
            if (!jobId) throw new Error("Upload did not return a job id.");
            await watchJob(jobId);
          }
          updateItem(item.id, { status: "done" });
        } catch (error: any) {
          failed++;
          updateItem(item.id, {
            status: "error",
            error: error.message || "Upload failed.",
          });
        } finally {
          completed++;
          setUploadProgressPercent(Math.round((completed / files.length) * 100));
          setUploadProgressMessage(`Processed ${completed} of ${files.length} files`);
        }
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(VAULT_UPLOAD_CONCURRENCY, files.length) },
          () => worker()
        )
      );
      await fetchLibraryData();
      onRefresh();
      if (failed > 0) {
        setUploadStatus("error");
        setUploadError(`${failed} of ${files.length} files failed. Remove them or retry.`);
        return false;
      }
      setUploadStatus("success");
      setUploadResultMessage(`${files.length} file${files.length === 1 ? "" : "s"} uploaded and parsed successfully!`);
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
    pendingVaultFiles, vaultBatchError, suggestedVaultFolderName,
    addVaultFiles, removeVaultFile, clearVaultFiles, handleCreateUploadFolder,
    fetchLibraryData, handleCopyId, handleDeleteItem, handleDeleteDraft,
    handleCreateNewItem, handleTriggerUpload, handleVaultAssetUpload, handleDeleteFileFromFolder,
  };
}
