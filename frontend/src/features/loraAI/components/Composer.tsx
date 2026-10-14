// ─── Composer ────────────────────────────────────────────────────────────────
// Premium pill-style message input — matches Draft / Analyze landing composers.

import { useRef } from "react";
import { CornerDownLeft, Paperclip, Loader2 } from "lucide-react";
import { FileCard } from "./FileCard";
import { DropOverlay } from "./DropOverlay";
import { useAutoResize } from "../hooks/useAutoResize";
import type { UploadedFile } from "../types";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onFileAdd: (files: FileList) => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (id: string) => void;
  isLoading: boolean;
  placeholder?: string;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  /** When false, hides the paperclip attach button (e.g. compare follow-up chat) */
  showAttachButton?: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onFileAdd,
  uploadedFiles,
  onRemoveFile,
  isLoading,
  placeholder = "Ask a legal question, or upload a document to begin…",
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  showAttachButton = true,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ref: taRef, adjust } = useAutoResize(28, 120);
  const canSend = value.trim().length > 0 || uploadedFiles.length > 0;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !isLoading) onSubmit();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (canSend && !isLoading) onSubmit();
    }
  };

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <div
        className="relative rounded-[22px] border border-[#E4E4E7] bg-white overflow-hidden transition-all duration-200 focus-within:border-[#D4D4D8] focus-within:shadow-[0_0_0_3px_rgba(24,24,27,0.05),0_1px_2px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.07)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_28px_rgba(0,0,0,0.06)]"
        onDragOver={showAttachButton ? onDragOver : undefined}
        onDragLeave={showAttachButton ? onDragLeave : undefined}
        onDrop={showAttachButton ? onDrop : undefined}
      >
        <DropOverlay active={showAttachButton && isDragging} />

        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pt-4 pb-1">
            {uploadedFiles.map((f) => (
              <FileCard key={f.id} file={f} onRemove={onRemoveFile} />
            ))}
          </div>
        )}

        <div className="flex items-start gap-3 px-5 pt-4 pb-1">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              adjust();
            }}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 bg-transparent text-[14px] leading-relaxed resize-none outline-none placeholder:text-[#D4D4D8]"
            style={{
              minHeight: 28,
              maxHeight: 120,
              color: "#18181B",
            }}
            aria-label="Message input"
          />
          <span className="shrink-0 text-[11px] pt-0.5 select-none text-[#D4D4D8] tracking-wide">
            Ctrl+Y
          </span>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
          {showAttachButton && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] text-[#71717A] hover:bg-[#EBEBEB] hover:text-[#3F3F46] transition-colors disabled:opacity-50"
                aria-label="Attach file"
              >
                <Paperclip className="w-[15px] h-[15px]" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) onFileAdd(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}

          <div className="flex-1" />

          <button
            type="button"
            disabled={!canSend || isLoading}
            onClick={onSubmit}
            className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 disabled:opacity-40 disabled:cursor-not-allowed bg-[#18181B] text-white hover:bg-[#27272A] active:scale-95 transition-all"
            aria-label="Send"
          >
            {isLoading ? (
              <Loader2 className="w-[16px] h-[16px] animate-spin" />
            ) : (
              <CornerDownLeft className="w-[16px] h-[16px]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
