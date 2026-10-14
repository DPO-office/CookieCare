import { useState, useCallback } from "react";
import type { UploadedFileEntry } from "../types";

interface UseFileUploadReturn {
  uploadedFiles: UploadedFileEntry[];
  dragging: boolean;
  addFiles: (incoming: FileList | File[]) => void;
  removeFile: (id: string) => void;
  setDragging: (val: boolean) => void;
  clear: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setUploadedFiles((prev) => {
      const existing = new Set(prev.map((e) => e.file.name));
      const newEntries = arr
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, id: Math.random().toString(36).slice(2) }));
      return [...prev, ...newEntries];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clear = useCallback(() => setUploadedFiles([]), []);

  return { uploadedFiles, dragging, addFiles, removeFile, setDragging, clear };
}
