import { useState } from "react";
import { apiUrl } from "../../../config";
import { CustomFolder } from "../types";

export function useUpload(
  authToken: string,
  folders: CustomFolder[],
  fetchFoldersAndDocs: () => Promise<void>,
  onRefresh: () => Promise<void>
) {
  const [uploadSelectedFolder, setUploadSelectedFolder] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => setIsDraggingFile(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFileName(file.name);
      setSelectedFile(file);
    }
  };

  const handleFileBrowseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setSelectedFile(file);
    }
  };

  const executeUploadSubmission = async (e: React.FormEvent, onClose: () => void) => {
    e.preventDefault();
    if (!uploadedFileName || !selectedFile) return;

    setIsUploading(true);
    let waitingForJob = false;
    try {
      const targetFolder = folders.find((f) => f.name === uploadSelectedFolder);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", uploadedFileName);
      if (targetFolder) formData.append("folder_id", targetFolder.id);

      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to process document upload.");

      if (res.status === 202 && payload.job_id) {
        waitingForJob = true;
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "job_update" && data.job.id === payload.job_id) {
            if (data.job.status === "completed") {
              eventSource.close();
              fetchFoldersAndDocs().then(() => onRefresh());
              setIsUploading(false);
              onClose();
            } else if (data.job.status === "failed") {
              eventSource.close();
              setIsUploading(false);
              alert("Processing failed: " + data.job.error);
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setIsUploading(false);
          alert("Processing failed: job connection interrupted");
        };
        return;
      }

      await fetchFoldersAndDocs();
      await onRefresh();
      setUploadedFileName("");
      setSelectedFile(null);
      onClose();
    } catch (err: any) {
      console.error("Upload failed", err.message);
    } finally {
      if (!waitingForJob) setIsUploading(false);
    }
  };

  return {
    uploadSelectedFolder,
    setUploadSelectedFolder,
    isDraggingFile,
    isUploading,
    uploadedFileName,
    selectedFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileBrowseChange,
    executeUploadSubmission,
  };
}
