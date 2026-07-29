import { useState, useCallback, useRef } from "react";
import { apiUrl } from "../../../config";
import { waitForJob } from "../../../shared/utils/jobStatus";
import { CustomFolder, PendingUpload } from "../types";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_BYTES,
  UPLOAD_CONCURRENCY,
  JUNK_FILE_NAMES,
} from "../constants";

function isAllowedFile(file: File): boolean {
  if (JUNK_FILE_NAMES.has(file.name)) return false;
  if (file.size === 0) return false;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ACCEPTED_UPLOAD_EXTENSIONS.includes(ext);
}

function fileKey(f: File): string {
  return `${f.name}::${f.size}::${f.lastModified}`;
}

function extractFolderName(files: File[]): string | undefined {
  for (const f of files) {
    const rel = (f as any).webkitRelativePath as string | undefined;
    if (rel) {
      const first = rel.split("/")[0];
      if (first) return first;
    }
  }
  return undefined;
}

async function readAllEntries(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => {
      (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([]));
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const all: File[] = [];
    const readBatch = (): Promise<File[]> =>
      new Promise((resolve) => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(all);
            return;
          }
          for (const e of entries) {
            const files = await readAllEntries(e);
            all.push(...files);
          }
          resolve(await readBatch());
        }, () => resolve(all));
      });
    return readBatch();
  }
  return [];
}

export function useUpload(
  authToken: string,
  folders: CustomFolder[],
  fetchFoldersAndDocs: () => Promise<void>,
  onRefresh: () => Promise<void>
) {
  const [uploadSelectedFolder, setUploadSelectedFolder] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([]);
  const [batchError, setBatchError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [suggestedFolderName, setSuggestedFolderName] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const abortRef = useRef(false);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const accepted = arr.filter(isAllowedFile);
    const skipped = arr.length - accepted.length;

    const folderName = extractFolderName(accepted);
    if (folderName) setSuggestedFolderName(folderName);

    setPendingFiles((prev) => {
      const existingKeys = new Set(prev.map((p) => fileKey(p.file)));
      const newEntries: PendingUpload[] = accepted
        .filter((f) => !existingKeys.has(fileKey(f)))
        .map((f) => ({
          id: Math.random().toString(36).slice(2),
          file: f,
          relativePath: (f as any).webkitRelativePath || undefined,
          status: "pending" as const,
        }));

      const combined = [...prev, ...newEntries];
      if (combined.length > MAX_UPLOAD_FILES) {
        setBatchError(`Maximum ${MAX_UPLOAD_FILES} files allowed. ${combined.length - MAX_UPLOAD_FILES} file(s) were not added.`);
        return combined.slice(0, MAX_UPLOAD_FILES);
      }
      return combined;
    });

    const oversized = accepted.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized.length > 0) {
      setBatchError(`${oversized.length} file(s) exceed the 25 MB limit and will fail on upload.`);
    } else if (skipped > 0) {
      setBatchError(`${skipped} unsupported file(s) were filtered out.`);
    } else {
      setBatchError("");
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.id !== id));
    setBatchError("");
  }, []);

  const clearFiles = useCallback(() => {
    setPendingFiles([]);
    setBatchError("");
    setSuccessMessage("");
    setSuggestedFolderName("");
    setUploadProgress({ done: 0, total: 0 });
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => setIsDraggingFile(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const allFiles: File[] = [];
      const entries: FileSystemEntry[] = [];

      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      if (entries.length > 0) {
        const droppedFolder = entries.find((entry) => entry.isDirectory);
        if (droppedFolder?.name) {
          setSuggestedFolderName(droppedFolder.name);
          setUploadSelectedFolder("");
        }
        for (const entry of entries) {
          const files = await readAllEntries(entry);
          allFiles.push(...files);
        }
        if (allFiles.length > 0) {
          addFiles(allFiles);
          return;
        }
      }
    }

    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileBrowseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleFolderBrowseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setUploadSelectedFolder("");
      addFiles(e.target.files);
    }
    e.target.value = "";
  };

  const updateFileStatus = (id: string, patch: Partial<PendingUpload>) => {
    setPendingFiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const resolveOrCreateFolder = async (name: string): Promise<string | undefined> => {
    const existing = folders.find((f) => f.name === name);
    if (existing) return existing.id;

    try {
      const res = await fetch(apiUrl("/api/folders"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const row = await res.json();
        return row.id;
      }
    } catch {
      // fall through
    }
    return undefined;
  };

  const uploadSingleFile = async (
    item: PendingUpload,
    folderId: string | undefined
  ): Promise<{ jobId?: string; fileId?: string; error?: string }> => {
    updateFileStatus(item.id, { status: "uploading" });

    try {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("title", item.file.name);
      if (folderId) formData.append("folder_id", folderId);

      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      const payload = await res.json();
      if (!res.ok) {
        const errMsg = payload.error || "Upload failed";
        updateFileStatus(item.id, { status: "error", error: errMsg });
        return { error: errMsg };
      }

      if (res.status === 202 && payload.job_id) {
        updateFileStatus(item.id, { status: "processing", jobId: payload.job_id, fileId: payload.file_id });
        return { jobId: payload.job_id, fileId: payload.file_id };
      }

      updateFileStatus(item.id, { status: "done", fileId: payload.file_id || payload.id });
      return { fileId: payload.file_id || payload.id };
    } catch (err: any) {
      const errMsg = err.message || "Upload failed";
      updateFileStatus(item.id, { status: "error", error: errMsg });
      return { error: errMsg };
    }
  };

  const executeUploadSubmission = async (_e: React.FormEvent, onClose: () => void) => {
    _e.preventDefault();
    const toUpload = pendingFiles.filter((p) => p.status === "pending" || p.status === "error");
    if (toUpload.length === 0) return;

    setIsUploading(true);
    setBatchError("");
    setSuccessMessage("");
    abortRef.current = false;
    setUploadProgress({ done: 0, total: toUpload.length });

    let folderId: string | undefined;
    // A local folder upload always becomes a root-level Vault folder.
    // Never place it inside a target selected before folder mode was detected.
    if (suggestedFolderName) {
      folderId = await resolveOrCreateFolder(suggestedFolderName);
    } else {
      const targetFolder = folders.find((f) => f.name === uploadSelectedFolder);
      if (targetFolder) folderId = targetFolder.id;
    }

    let failedCount = 0;

    const queue = [...toUpload];
    const runNext = async (): Promise<void> => {
      while (queue.length > 0 && !abortRef.current) {
        const item = queue.shift()!;
        const result = await uploadSingleFile(item, folderId);

        if (result.error) {
          failedCount++;
        } else if (result.jobId) {
          try {
            await waitForJob(authToken, result.jobId);
            updateFileStatus(item.id, { status: "done" });
          } catch (err: any) {
            failedCount++;
            updateFileStatus(item.id, {
              status: "error",
              error: err.message || "Processing failed",
            });
          }
        } else {
          updateFileStatus(item.id, { status: "done" });
        }

        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };

    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, toUpload.length) }, () => runNext());
    await Promise.all(workers);

    await fetchFoldersAndDocs();
    await onRefresh();
    setIsUploading(false);

    if (failedCount > 0) {
      setBatchError(
        `${failedCount} of ${toUpload.length} file${toUpload.length === 1 ? "" : "s"} failed. Remove them or press upload to retry.`
      );
      return;
    }

    const uploadedCount = toUpload.length;
    setSuccessMessage(
      `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded and indexed successfully.`
    );
    setTimeout(() => {
      clearFiles();
      onClose();
    }, 1500);
  };

  return {
    uploadSelectedFolder,
    setUploadSelectedFolder,
    isDraggingFile,
    isUploading,
    pendingFiles,
    batchError,
    successMessage,
    suggestedFolderName,
    uploadProgress,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileBrowseChange,
    handleFolderBrowseChange,
    addFiles,
    removeFile,
    clearFiles,
    executeUploadSubmission,
  };
}
