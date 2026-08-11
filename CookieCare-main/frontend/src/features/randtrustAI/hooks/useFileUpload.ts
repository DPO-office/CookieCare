// ─── useFileUpload ────────────────────────────────────────────────────────────
// Manages the list of pending uploaded files in the composer.

import { useState, useCallback } from "react";
import type { UploadedFile } from "../types";
import { uid } from "../lib/utils";

export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    setUploadedFiles((prev) => [
      ...prev,
      ...incoming.map((f) => ({ id: uid(), file: f, name: f.name, size: f.size })),
    ]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setUploadedFiles([]);
  }, []);

  return { uploadedFiles, addFiles, removeFile, clearFiles };
}
