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
  canAnalyze,
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
  const { ref: textareaRef, adjust } = useAutoResize(28, 120);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const hasDocuments = documents.length > 0;
  const busy = isAnalyzing || isUploading;
  const isLanding = variant === "landing";

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
      if (canAnalyze && !busy) onAnalyze();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (canAnalyze && !busy) onAnalyze();
    }
  };

  const placeholder =
    "Ask a question or describe the analysis you want RandTrust to perform…";

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
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none rounded-[22px]"
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
              onChange={(e) => {
                onChange(e.target.value);
                adjust();
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={busy}
              className="pcl-input flex-1 bg-transparent text-[14px] leading-relaxed resize-none outline-none"
              style={{
                minHeight: 28,
                maxHeight: 120,
                color: "#18181B",
                fontWeight: 400,
              }}
              aria-label="Analysis request"
            />
            <span className="shrink-0 text-[11px] pt-0.5 select-none text-[#D4D4D8] tracking-wide">
              Ctrl+Y
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
            <button
              type="button"
              onClick={onAttachFiles}
              disabled={busy}
              className="pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] text-[#71717A]"
              aria-label="Attach file"
            >
              <Paperclip className="w-[15px] h-[15px]" />
            </button>

            <button
              type="button"
              onClick={onOpenVault}
              disabled={busy}
              className="pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] text-[#71717A]"
              aria-label="Select from Vault"
            >
              <Archive className="w-[15px] h-[15px]" />
            </button>

            <div className="relative" ref={optionsRef}>
              <button
                type="button"
                onClick={() => setOptionsOpen((v) => !v)}
                disabled={busy}
                className="pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] text-[#71717A]"
                aria-label="Analysis options"
              >
                <SlidersHorizontal className="w-[15px] h-[15px]" />
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

            <button
              type="button"
              disabled={!canAnalyze || busy}
              onClick={onAnalyze}
              className="pcl-enter-btn w-9 h-9 flex items-center justify-center rounded-full shrink-0 disabled:opacity-40 disabled:cursor-not-allowed bg-[#18181B] text-white"
              aria-label={isAnalyzing ? "Analyzing…" : "Analyze"}
            >
              {busy ? (
                <Loader2 className="w-[16px] h-[16px] animate-spin" />
              ) : (
                <CornerDownLeft className="w-[16px] h-[16px]" />
              )}
            </button>
          </div>
        </div>

        {isUploading && (
          <p className="mt-3 text-center text-[12px] text-[#A1A1AA]" role="status">
            {uploadProgress && uploadProgress.total > 0
              ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}…`
              : "Uploading and indexing agreements…"}
          </p>
        )}

        {validationMessage && !isUploading && (
          <p className="mt-3 text-center text-[13px] text-[#DC2626]" role="alert">
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
            className="pcl-input flex-1 bg-transparent text-[14px] leading-relaxed resize-none outline-none"
            style={{ minHeight: 28, maxHeight: 120, color: "#18181B" }}
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
            disabled={!canAnalyze || busy}
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
