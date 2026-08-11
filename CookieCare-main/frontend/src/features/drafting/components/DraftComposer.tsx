import { useRef } from "react";
import {
  Paperclip,
  CornerDownLeft,
  Loader2,
  X,
} from "lucide-react";import { useAutoResize } from "../../randtrustAI/hooks/useAutoResize";

export interface DraftComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onFileSelect: (file: File) => void;
  attachedFileName?: string;
  onRemoveFile?: () => void;
  isLoading?: boolean;
  isParsing?: boolean;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  placeholder?: string;
  /** "landing" = full-page composer; "chat" = split-view pill composer */
  variant?: "landing" | "chat";
}

export function DraftComposer({
  value,
  onChange,
  onSubmit,
  onFileSelect,
  attachedFileName,
  onRemoveFile,
  isLoading = false,
  isParsing = false,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  placeholder = "Describe the agreement you want to draft…",
  variant = "landing",
}: DraftComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ref: taRef, adjust } = useAutoResize(28, 120);
  const busy = isLoading || isParsing;
  const canSubmit = (value.trim().length > 0 || !!attachedFileName) && !busy;
  const isChat = variant === "chat";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <div
      className={`relative w-full ${isChat ? "" : "max-w-[720px] mx-auto"}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none ${
            isChat ? "rounded-[28px]" : "rounded-[22px]"
          }`}
          style={{
            background: "rgba(0, 0, 0, 0.04)",
            border: "2px dashed rgba(0, 0, 0, 0.12)",
          }}
        >
          <span className="text-[13px] font-medium text-[#52525B]">
            Drop file to attach
          </span>
        </div>
      )}

      <div
        className={
          isChat
            ? "draft-composer-chat relative"
            : "draft-composer relative overflow-hidden"
        }
      >
        {/* Input row */}
        <div className={`flex items-start gap-3 ${isChat ? "px-5 pt-4 pb-1" : "px-5 pt-4 pb-1"}`}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              adjust();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={busy}
            className="draft-input flex-1 bg-transparent text-[14px] leading-relaxed resize-none outline-none"
            style={{
              minHeight: isChat ? 24 : 28,
              maxHeight: 120,
              color: "#18181B",
              fontWeight: 400,
            }}
            aria-label="Message input"
          />
          <span className="shrink-0 text-[11px] pt-0.5 select-none text-[#D4D4D8] tracking-wide">
            Ctrl+Y
          </span>
        </div>

        {/* Attached file chip */}
        {attachedFileName && (
          <div className="px-5 pb-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] rounded-full px-3 py-1 bg-[#F4F4F5] text-[#52525B] border border-[#EBEBEB]">
              <Paperclip className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[200px]">{attachedFileName}</span>
              {onRemoveFile && !busy && (
                <button
                  type="button"
                  onClick={onRemoveFile}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-black/5 transition-colors"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          </div>
        )}

        {/* Bottom action row */}
        <div className={`flex items-center gap-2 ${isChat ? "px-4 pb-3.5 pt-1.5" : "px-4 pb-3.5 pt-2"}`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="draft-attach-btn w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] text-[#71717A]"
            aria-label="Attach file"
          >
            <Paperclip className="w-[15px] h-[15px]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
              e.target.value = "";
            }}
          />

          <div className="flex-1" />

          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="draft-enter-btn w-9 h-9 flex items-center justify-center rounded-full shrink-0 disabled:opacity-40 disabled:cursor-not-allowed bg-[#18181B] text-white"
            aria-label="Submit"
          >
            {busy ? (
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
