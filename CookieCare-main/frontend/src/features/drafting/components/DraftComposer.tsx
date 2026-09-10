import { useRef, useEffect } from "react";
import { Paperclip, CornerDownLeft, Loader2, X, Archive } from "lucide-react";
import { useAutoResize } from "../../randtrustAI/hooks/useAutoResize";
import { DRAFT_PAGE_STYLES } from "../styles/draftPageStyles";

export interface DraftComposerDoc {
  id: string;
  title: string;
}

export interface DraftComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onFileSelect: (file: File) => void;
  attachedFileName?: string;
  onRemoveFile?: () => void;
  vaultDocuments?: DraftComposerDoc[];
  onRemoveVaultDocument?: (id: string) => void;
  onOpenVault?: () => void;
  hasContext?: boolean;
  isLoading?: boolean;
  isParsing?: boolean;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  placeholder?: string;
  variant?: "landing" | "chat";
}

export function DraftComposer({
  value,
  onChange,
  onSubmit,
  onFileSelect,
  attachedFileName,
  onRemoveFile,
  vaultDocuments = [],
  onRemoveVaultDocument,
  onOpenVault,
  hasContext = false,
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
  const isChat = variant === "chat";
  const minH = isChat ? 36 : 72;
  const maxH = isChat ? 96 : 168;
  const { ref: taRef, adjust } = useAutoResize(minH, maxH);
  const busy = isLoading || isParsing;
  const hasVaultDocs = vaultDocuments.length > 0;
  const canSubmit =
    (value.trim().length > 0 || !!attachedFileName || hasVaultDocs || hasContext) && !busy;

  useEffect(() => {
    adjust();
  }, [value, adjust]);

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
    <>
      <style>{DRAFT_PAGE_STYLES}</style>
    <div
      className={`relative w-full ${isChat ? "" : "mx-auto max-w-[720px]"}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px]"
          style={{ background: "rgba(79, 91, 217, 0.06)" }}
        >
          <span className="text-[13px] font-medium text-[#4F5BD9]">Drop file to attach</span>
        </div>
      )}

      <div className={isChat ? "draft-composer-chat relative" : "draft-composer relative overflow-hidden"}>
        {(attachedFileName || hasVaultDocs) && (
          <div className="flex flex-wrap gap-1.5 px-5 pt-3 pb-0">
            {vaultDocuments.map((doc) => (
              <span
                key={doc.id}
                className="score-badge max-w-[16rem] bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]"
              >
                <Archive className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{doc.title}</span>
                {onRemoveVaultDocument && !busy && (
                  <button
                    type="button"
                    onClick={() => onRemoveVaultDocument(doc.id)}
                    className="ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70 hover:text-[#B54A45]"
                    aria-label={`Remove ${doc.title}`}
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                )}
              </span>
            ))}
            {attachedFileName && (
              <span className="score-badge max-w-[16rem] bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
                <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{attachedFileName}</span>
                {onRemoveFile && !busy && (
                  <button
                    type="button"
                    onClick={onRemoveFile}
                    className="ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70 hover:text-[#B54A45]"
                    aria-label="Remove attachment"
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        <div className={isChat ? "flex items-end gap-2 px-3 py-2.5" : "flex items-start gap-3 px-5 pt-4 pb-1"}>
          {isChat && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="draft-icon-btn mb-0.5"
                aria-label="Attach file"
              >
                <Paperclip className="h-[15px] w-[15px]" strokeWidth={1.75} />
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
            </>
          )}
          <textarea
            ref={taRef}
            value={value}
            rows={isChat ? 1 : 3}
            onChange={(e) => {
              onChange(e.target.value);
              adjust();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={busy}
            className="draft-input flex-1 bg-transparent text-[14px] outline-none"
            style={{ minHeight: minH, maxHeight: maxH }}
            aria-label="Message input"
          />
          {isChat && (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="draft-enter-btn mb-0.5 primary-gradient"
              aria-label="Submit"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CornerDownLeft className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          )}
        </div>

        {!isChat && (
        <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="draft-icon-btn"
            aria-label="Attach file"
          >
            <Paperclip className="h-[15px] w-[15px]" strokeWidth={1.75} />
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

          {onOpenVault && (
            <button
              type="button"
              onClick={onOpenVault}
              disabled={busy}
              className="draft-icon-btn"
              aria-label="Select from Vault"
            >
              <Archive className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>
          )}

          <div className="flex-1" />

          <span className="hidden shrink-0 select-none text-[11px] tracking-wide text-[#98A2B3] sm:inline">
            Ctrl+Y
          </span>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="draft-enter-btn primary-gradient"
            aria-label="Submit"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CornerDownLeft className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
        )}
      </div>
    </div>
    </>
  );
}
