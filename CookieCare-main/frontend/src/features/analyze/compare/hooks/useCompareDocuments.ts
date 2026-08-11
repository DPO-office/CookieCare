// ─── useCompareDocuments Hook ────────────────────────────────────────────────
// State management for the Compare Documents modal (file slots only).
// The compare execution logic lives in useCompare.ts and is wired at
// RandTrustAI.tsx level so results land in the canonical chat message stream.

import { useState, useCallback } from "react";
import type { CompareFile, AgreementSlot } from "../types";
import { MAX_FILE_SIZE_BYTES, ACCEPTED_MIME_TYPES } from "../constants";

interface UseCompareDocumentsReturn {
  isOpen: boolean;
  original: CompareFile | null;
  revised: CompareFile | null;
  canCompare: boolean;
  open: () => void;
  close: () => void;
  setFile: (slot: AgreementSlot, file: File | null) => void;
  removeFile: (slot: AgreementSlot) => void;
  replaceFile: (slot: AgreementSlot, file: File) => void;
  /** Clears both slots (e.g. when starting a new comparison session). */
  clear: () => void;
}

function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit` };
  }
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: "Unsupported file type" };
  }
  return { valid: true };
}

function createCompareFile(file: File): CompareFile {
  return {
    id: `${file.name}-${file.size}-${Date.now()}`,
    file,
    name: file.name,
    size: file.size,
  };
}

export function useCompareDocuments(): UseCompareDocumentsReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [original, setOriginal] = useState<CompareFile | null>(null);
  const [revised, setRevised] = useState<CompareFile | null>(null);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setFile = useCallback((slot: AgreementSlot, file: File | null) => {
    if (!file) {
      if (slot === "original") setOriginal(null);
      else setRevised(null);
      return;
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      console.error(validation.error);
      return;
    }

    const compareFile = createCompareFile(file);
    if (slot === "original") setOriginal(compareFile);
    else setRevised(compareFile);
  }, []);

  const removeFile = useCallback((slot: AgreementSlot) => {
    if (slot === "original") setOriginal(null);
    else setRevised(null);
  }, []);

  const replaceFile = useCallback((slot: AgreementSlot, file: File) => {
    setFile(slot, file);
  }, [setFile]);

  const clear = useCallback(() => {
    setOriginal(null);
    setRevised(null);
  }, []);

  const canCompare = Boolean(original && revised);

  return {
    isOpen,
    original,
    revised,
    canCompare,
    open,
    close,
    setFile,
    removeFile,
    replaceFile,
    clear,
  };
}
