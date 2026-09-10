import { useRef, useState, useCallback } from "react";
import { FileText, X } from "lucide-react";
import type { CompareFile, AgreementSlot } from "../types";
import { ACCEPTED_EXTENSIONS, SLOT_CONFIG } from "../constants";

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

interface CompareDropZoneProps {
  slot: AgreementSlot;
  file: CompareFile | null;
  onFileSelect: (slot: AgreementSlot, file: File) => void;
  onRemove: (slot: AgreementSlot) => void;
  onReplace: (slot: AgreementSlot, file: File) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

export function CompareDropZone({
  slot,
  file,
  onFileSelect,
  onRemove,
  onReplace,
}: CompareDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const config = SLOT_CONFIG[slot];

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files)[0];
      if (!dropped) return;
      file ? onReplace(slot, dropped) : onFileSelect(slot, dropped);
    },
    [slot, file, onFileSelect, onReplace],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      file ? onReplace(slot, selected) : onFileSelect(slot, selected);
    }
    e.target.value = "";
  };

  return (
    <div
      className={`compare-drop-zone flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[24px] bg-white px-8 py-12 text-center select-none ${
        isDragging ? "dragging" : ""
      } ${file ? "has-file" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-label={file ? `Replace ${file.name}` : `Upload ${config.label}`}
      style={{
        boxShadow: isDragging
          ? "0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08)"
          : CARD_SHADOW,
      }}
    >
      <p className="mb-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
        {config.label}
      </p>

      {file ? (
        <>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
            <FileText className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="m-0 mb-1 max-w-[240px] truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            {file.name}
          </p>
          <p className="m-0 mb-5 text-[12px] text-[#98A2B3]">{formatFileSize(file.size)}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(slot);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#F7F8FB] px-3.5 py-1.5 text-[12px] font-medium text-[#667085] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626]"
          >
            <X className="h-3.5 w-3.5" />
            Remove
          </button>
        </>
      ) : (
        <>
          <img
            src="/icons/info.svg"
            alt=""
            className="mx-auto mb-4 h-12 w-12 object-contain"
          />
          <h3 className="m-0 mb-1.5 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            {isDragging ? "Drop to add this agreement" : "Drag & drop your file"}
          </h3>
          <p className="m-0 text-[13px] text-[#667085]">
            {config.description} · or{" "}
            <span className="font-medium text-[#4F5BD9] underline underline-offset-2">
              browse files
            </span>
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
