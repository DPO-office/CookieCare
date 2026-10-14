// ─── useDragDrop ──────────────────────────────────────────────────────────────
// Handles drag-over / drag-leave / drop events for the composer drop zone.

import { useState, useCallback } from "react";

interface UseDragDropOptions {
  onDrop: (files: FileList) => void;
}

export function useDragDrop({ onDrop }: UseDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        onDrop(e.dataTransfer.files);
      }
    },
    [onDrop]
  );

  return { isDragging, handleDragOver, handleDragLeave, handleDrop };
}
