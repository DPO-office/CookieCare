import { useRef, useState, useCallback } from "react";
import { Plus, FileText, X } from "lucide-react";
import type { CompareFile, AgreementSlot } from "../types";
import { ACCEPTED_EXTENSIONS } from "../constants";

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
    [slot, file, onFileSelect, onReplace]
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
      className={`compare-drop-zone flex-1 min-w-0 flex flex-col items-center justify-center px-8 py-14 cursor-pointer select-none ${
        isDragging ? "dragging" : ""
      }`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-label={file ? `Replace ${file.name}` : "Upload document"}
    >
      {file ? (
        <>
          <div className="w-10 h-10 rounded-lg bg-[#F4F4F5] flex items-center justify-center mb-4">
            <FileText className="w-5 h-5 text-[#52525B]" />
          </div>
          <p className="text-[14px] font-semibold text-[#18181B] mb-1 text-center truncate max-w-[220px]">
            {file.name}
          </p>
          <p className="text-[12px] text-[#A1A1AA] mb-4">{formatFileSize(file.size)}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(slot);
            }}
            className="flex items-center gap-1 text-[12px] text-[#A1A1AA] hover:text-[#52525B] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Remove
          </button>
        </>
      ) : (
        <>
          <Plus className="w-6 h-6 text-[#A1A1AA] mb-5" strokeWidth={1.5} />
          <p className="text-[14px] font-semibold text-[#18181B] mb-1.5">
            Drag &amp; Drop files
          </p>
          <p className="text-[13px] text-[#A1A1AA]">or browse files on your device</p>
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
