import { useRef, useState, useEffect } from "react";
import {
  Paperclip,
  CornerDownLeft,
  Loader2,
  Archive,
  SlidersHorizontal,
} from "lucide-react";
import { useAutoResize } from "../hooks/useAutoResize";
import { DocumentMode, AnswerStyle } from "../types";
import { SelectedDocument } from "../documentSelection";
import { AnalysisOptionsMenu } from "./AnalysisOptionsMenu";
import { ComposerDocumentCard } from "./ComposerDocumentCard";

interface AnalysisComposerProps {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onAttachFiles: () => void;
  onOpenVault: () => void;
  onOpenPrompts: () => void;
  onOpenQuestions: () => void;
  documents: SelectedDocument[];
  onRemoveDocument: (doc: SelectedDocument) => void;
  documentMode: DocumentMode;
  answerStyle: AnswerStyle;
  onSetDocumentMode: (mode: DocumentMode) => void;
  onSetAnswerStyle: (style: AnswerStyle) => void;
  canAnalyze: boolean;
  isAnalyzing: boolean;
  isUploading?: boolean;
  uploadProgress?: { done: number; total: number };
  validationMessage?: string;
  isDragging?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  variant?: "landing" | "default";
}

export function AnalysisComposer({
  value,
  onChange,
  onAnalyze,
  onAttachFiles,
  onOpenVault,
  documents,
  onRemoveDocument,
  documentMode,
  answerStyle,
  onSetDocumentMode,
  onSetAnswerStyle,
  canAnalyze: _canAnalyze,
  isAnalyzing,
  isUploading = false,
  uploadProgress,
  validationMessage,
  isDragging = false,
  onDragOver,
  onDragLeave,
  onDrop,
  variant = "landing",
}: AnalysisComposerProps) {
  const { ref: textareaRef, adjust } = useAutoResize(72, 168);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const hasDocuments = documents.length > 0;
  const busy = isAnalyzing || isUploading;
  const isLanding = variant === "landing";
  const canSend = value.trim().length > 0 && !busy;

  useEffect(() => {
    adjust();
  }, [value, adjust]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    };
    if (optionsOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [optionsOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !busy) onAnalyze();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (value.trim() && !busy) onAnalyze();
    }
  };

  const placeholder =
    "Ask a question or describe the analysis you want LORA to perform…";

  if (isLanding) {
    return (
      <div
        className="relative w-full max-w-[720px] mx-auto"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragging && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px]"
            style={{ background: "rgba(79, 91, 217, 0.06)" }}
          >
            <span className="text-[13px] font-medium text-[#4F5BD9]">
              Drop file to attach
            </span>
          </div>
        )}

        <div className="pcl-composer relative overflow-visible">
          {hasDocuments && (
            <div className="flex flex-wrap gap-1.5 px-5 pt-3 pb-0">
              {documents.map((doc) => (
                <ComposerDocumentCard
                  key={`${doc.type}-${doc.id}`}
                  document={doc}
                  onRemove={() => onRemoveDocument(doc)}
                />
              ))}
            </div>
          )}

          <div className="flex items-start gap-3 px-5 pt-4 pb-1">
            <textarea
              ref={textareaRef}
              value={value}
              rows={3}
              onChange={(e) => {
                onChange(e.target.value);
                adjust();
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={busy}
              className="pcl-input flex-1 bg-transparent text-[14px] leading-[1.55] resize-none outline-none"
              style={{
                minHeight: 72,
                maxHeight: 168,
                color: "#1a1a1a",
                fontWeight: 400,
              }}
              aria-label="Analysis request"
            />
          </div>

          <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
            <button
              type="button"
              onClick={onAttachFiles}
              disabled={busy}
              className="analyze-icon-btn"
              aria-label="Attach file"
            >
              <Paperclip className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={onOpenVault}
              disabled={busy}
              className="analyze-icon-btn"
              aria-label="Select from Vault"
            >
              <Archive className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>

            <div className="relative" ref={optionsRef}>
              <button
                type="button"
                onClick={() => setOptionsOpen((v) => !v)}
                disabled={busy}
                className="analyze-icon-btn"
                aria-label="Analysis options"
              >
                <SlidersHorizontal className="h-[15px] w-[15px]" strokeWidth={1.75} />
              </button>
              {optionsOpen && (
                <AnalysisOptionsMenu
                  documentMode={documentMode}
                  answerStyle={answerStyle}
                  onSetDocumentMode={onSetDocumentMode}
                  onSetAnswerStyle={onSetAnswerStyle}
                  onClose={() => setOptionsOpen(false)}
                />
              )}
            </div>

            <div className="flex-1" />

            <span className="hidden shrink-0 select-none text-[11px] tracking-wide text-[#98A2B3] sm:inline">
              Ctrl+Y
            </span>

            <button
              type="button"
              disabled={!canSend}
              onClick={onAnalyze}
              className="analyze-enter-btn primary-gradient"
              aria-label={isAnalyzing ? "Analyzing…" : "Analyze"}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CornerDownLeft className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>

        {isUploading && (
          <p className="mt-3 text-center text-[12px] text-[#98A2B3]" role="status">
            {uploadProgress && uploadProgress.total > 0
              ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}…`
              : "Uploading and indexing agreements…"}
          </p>
        )}

        {validationMessage && !isUploading && (
          <p className="mt-3 text-center text-[13px] text-badge-red-text" role="alert">
            {validationMessage}
          </p>
        )}
      </div>
    );
  }

  // Default variant — kept for any non-landing usage
  return (
    <div
      className="w-full relative max-w-[720px] mx-auto"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pcl-composer relative overflow-visible">
        <div className="flex items-start gap-3 px-5 pt-4 pb-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              adjust();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={busy}
            className="pcl-input flex-1 bg-transparent text-[14px] leading-[1.55] resize-none outline-none"
            style={{ minHeight: 72, maxHeight: 168, color: "#1a1a1a" }}
            rows={3}
          />
        </div>
        <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
          <button
            type="button"
            onClick={onAttachFiles}
            disabled={busy}
            className="pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full bg-[#F4F4F5] text-[#71717A]"
          >
            <Paperclip className="w-[15px] h-[15px]" />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            disabled={!canSend}
            onClick={onAnalyze}
            className="pcl-enter-btn w-9 h-9 flex items-center justify-center rounded-full disabled:opacity-40 bg-[#18181B] text-white"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerDownLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
