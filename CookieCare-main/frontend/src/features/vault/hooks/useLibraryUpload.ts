/**
 * useLibraryUpload
 *
 * Owns: upload state machine, pending file queue, batch upload logic,
 * vault asset ingest (rulebook / templates / clauses).
 */

import { useState, useCallback } from "react";
import { VaultPendingUpload } from "../types";
import {
  createFolder,
  uploadFileToFolder,
  uploadVaultAsset,
  invalidateVaultCache,
} from "../services/libraryService";
import { waitForJob } from "../../../shared/utils/jobStatus";
import {
  VAULT_JUNK_FILE_NAMES,
  VAULT_MAX_UPLOAD_BYTES,
  VAULT_MAX_UPLOAD_FILES,
  VAULT_UPLOAD_CONCURRENCY,
  VAULT_UPLOAD_EXTENSIONS,
} from "../constants";
import type { LibraryItem } from "../types";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export function useLibraryUpload(
  authToken: string,
  items: LibraryItem[],
  onRefresh: () => void,
  fetchLibraryData: () => Promise<void>
) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResultMessage, setUploadResultMessage] = useState<string | null>(null);
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadProgressMessage, setUploadProgressMessage] = useState<string | null>(null);
  const [pendingVaultFiles, setPendingVaultFiles] = useState<VaultPendingUpload[]>([]);
  const [vaultBatchError, setVaultBatchError] = useState<string | null>(null);
  const [suggestedVaultFolderName, setSuggestedVaultFolderName] = useState("");

  const uploadProgress = uploadStatus === "uploading";

  const resetUploadProgress = useCallback(() => {
    setUploadProgressPercent(0);
    setUploadProgressMessage(null);
  }, []);

  // ── File queue management ────────────────────────────────────────────────

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
      .map(
        (file) =>
          (file as File & { webkitRelativePath?: string }).webkitRelativePath
      )
      .find(Boolean)
      ?.split("/")[0];
    if (rootFolder) setSuggestedVaultFolderName(rootFolder);

    // Collect all warning/error messages so nothing is silently dropped.
    // Compute everything before touching state so there are no races.
    const batchErrorParts: string[] = [];

    if (oversized > 0) {
      batchErrorParts.push(
        `${oversized} file${oversized === 1 ? "" : "s"} exceeded the 25 MB limit`
      );
    }
    if (unsupported > 0) {
      batchErrorParts.push(
        `${unsupported} unsupported or empty file${unsupported === 1 ? "" : "s"}`
      );
    }

    // Pre-compute how many accepted files will be skipped by the queue cap
    // so we can report it without relying on the state updater's closure.
    setPendingVaultFiles((current) => {
      const available = Math.max(0, VAULT_MAX_UPLOAD_FILES - current.length);
      const capped = accepted.slice(0, available);
      const skippedByLimit = accepted.length - capped.length;

      if (skippedByLimit > 0) {
        // Safe to mutate here — batchErrorParts is a local array in the outer scope
        // and this updater runs synchronously before setVaultBatchError is called.
        batchErrorParts.unshift(
          `maximum ${VAULT_MAX_UPLOAD_FILES} files per upload — ${skippedByLimit} file${skippedByLimit === 1 ? "" : "s"} not added`
        );
      }

      const added = capped.map((file) => ({
        id:
          globalThis.crypto?.randomUUID?.() ||
          Math.random().toString(36).slice(2),
        file,
        relativePath:
          (file as File & { webkitRelativePath?: string })
            .webkitRelativePath || undefined,
        status: "pending" as const,
      }));

      return [...current, ...added];
    });

    // After the state updater runs synchronously, apply the combined error.
    if (accepted.length === 0 && batchErrorParts.length === 0) {
      // Every file was rejected but no specific category caught — generic fallback.
      setVaultBatchError("No supported documents were found.");
    } else if (batchErrorParts.length > 0) {
      // Capitalise first letter and join with "; " for readability.
      const msg = batchErrorParts.join("; ");
      setVaultBatchError(msg.charAt(0).toUpperCase() + msg.slice(1) + ".");
    } else {
      // All files accepted cleanly — clear any stale error from a prior call.
      setVaultBatchError(null);
    }
  }, []);

  const removeVaultFile = useCallback((id: string) => {
    setPendingVaultFiles((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearVaultFiles = useCallback(() => {
    setPendingVaultFiles([]);
    setVaultBatchError(null);
    setSuggestedVaultFolderName("");
    setUploadProgressPercent(0);
    setUploadProgressMessage(null);
  }, []);

  // ── Folder creation helper ───────────────────────────────────────────────

  const handleCreateUploadFolder = async (
    name: string
  ): Promise<string | null> => {
    const existing = items.find(
      (item) =>
        item.type === "files" &&
        item.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return existing.id;
    const created = await createFolder(authToken, name);
    return created?.id || null;
  };

  // ── Batch upload ─────────────────────────────────────────────────────────

  const handleTriggerUpload = async (
    targetFolderId: string
  ): Promise<boolean> => {
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
        current.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        )
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
            await waitForJob(authToken, jobId);
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
          setUploadProgressPercent(
            Math.round((completed / files.length) * 100)
          );
          setUploadProgressMessage(
            `Processed ${completed} of ${files.length} files`
          );
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
        setUploadError(
          `${failed} of ${files.length} files failed. Remove them or retry.`
        );
        return false;
      }
      setUploadStatus("success");
      setUploadResultMessage(
        `${files.length} file${files.length === 1 ? "" : "s"} uploaded and parsed successfully!`
      );
      return true;
    } catch (err: any) {
      setUploadStatus("error");
      setUploadError(err.message || "Upload failed.");
      return false;
    }
  };

  // ── Vault asset ingest (rulebook / templates / clauses) ──────────────────

  const handleVaultAssetUpload = async (params: {
    tab: "rulebook" | "templates" | "clauses";
    file: File;
    contractType?: string;
    jurisdiction?: string;
    source?: "private" | "org";
  }): Promise<boolean> => {
    if (params.tab === "templates" && !params.contractType?.trim()) {
      setUploadStatus("error");
      setUploadError("Contract type is required for templates.");
      return false;
    }

    const categoryMap = {
      rulebook: "playbook",
      templates: "templates",
      clauses: "clauses",
    } as const;

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

      const uploadRes = await uploadVaultAsset(
        authToken,
        {
          file: params.file,
          category: categoryMap[params.tab],
          contractType: params.contractType?.trim() || undefined,
          jurisdiction: params.jurisdiction?.trim() || undefined,
          source: params.source ?? "private",
        },
        (jobId) => {
          // Only update the progress bar while the job runs — no full data
          // reload inside the polling loop. The cache is busted once at the end.
          pendingJob = waitForJob(authToken, jobId, {
            onProgress: (progress, message) => {
              setUploadProgressPercent(Math.max(5, Math.min(99, progress)));
              if (message) setUploadProgressMessage(message);
            },
          });
        }
      );

      // If the server immediately returned a library item id, the row already
      // exists — invalidate so the next fetchLibraryData gets a fresh read.
      if (uploadRes.libraryItemId) {
        invalidateVaultCache(authToken);
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

      // Single cache-busted reload now that the job is fully complete.
      invalidateVaultCache(authToken);
      await fetchLibraryData();
      onRefresh();
      return true;
    } catch (err: any) {
      setUploadStatus("error");
      setUploadError(err.message || "Vault ingest failed.");
      // Still refresh so any partial progress (e.g. the placeholder row) is visible.
      invalidateVaultCache(authToken);
      fetchLibraryData();
      return false;
    }
  };

  return {
    uploadProgress,
    uploadStatus,
    setUploadStatus,
    uploadError,
    uploadResultMessage,
    uploadProgressPercent,
    uploadProgressMessage,
    resetUploadProgress,
    pendingVaultFiles,
    vaultBatchError,
    suggestedVaultFolderName,
    addVaultFiles,
    removeVaultFile,
    clearVaultFiles,
    handleCreateUploadFolder,
    handleTriggerUpload,
    handleVaultAssetUpload,
  };
}
