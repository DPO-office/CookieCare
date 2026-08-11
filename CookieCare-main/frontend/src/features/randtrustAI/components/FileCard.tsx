// ─── FileCard ─────────────────────────────────────────────────────────────────
// Displays a single attached file in the composer with a remove button.

import { FileText, X } from "lucide-react";
import type { UploadedFile } from "../types";
import { formatFileSize } from "../lib/utils";

interface FileCardProps {
  file: UploadedFile;
  onRemove: (id: string) => void;
}

export function FileCard({ file, onRemove }: FileCardProps) {
  return (
    <div
      className="group flex items-center gap-2.5 rounded-xl px-3 py-2"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <FileText
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: "rgba(255,255,255,0.35)" }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] font-medium truncate"
          style={{ color: "rgba(255,255,255,0.8)" }}
        >
          {file.name}
        </p>
        <p className="text-[10.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
          {formatFileSize(file.size)}
        </p>
      </div>
      <button
        onClick={() => onRemove(file.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded"
        style={{ color: "rgba(255,255,255,0.35)" }}
        aria-label={`Remove ${file.name}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
