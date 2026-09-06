import { useRef, useState, useEffect } from "react";
import {
  Paperclip,
  CornerDownLeft,
  Loader2,
  Archive,
  Zap,
  Microscope,
  ChevronDown,
} from "lucide-react";
import { useAutoResize } from "../hooks/useAutoResize";
import { AnswerStyle, AnalysisDepth } from "../types";
import { SelectedDocument } from "../documentSelection";
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
  playbookDocId?: string | null;
  onTogglePlaybook?: (doc: SelectedDocument) => void;
  answerStyle: AnswerStyle;
  analysisDepth: AnalysisDepth;
  onSetAnswerStyle: (style: AnswerStyle) => void;
  onSetAnalysisDepth: (depth: AnalysisDepth) => void;
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

const DEPTH_OPTIONS: { value: AnalysisDepth; label: string; icon: React.ReactNode }[] = [
  { value: "lite", label: "Lite", icon: <Zap className="h-[13px] w-[13px] shrink-0" strokeWidth={1.75} /> },
  { value: "deep", label: "Deep Dive", icon: <Microscope className="h-[13px] w-[13px] shrink-0" strokeWidth={1.75} /> },
];

/** Compact inline dropdown used for the below-composer setting controls. */
function SettingDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === value)!;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="analyze-setting-root">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="analyze-setting-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${active.label}`}
      >
        <span className="analyze-setting-label">{label}:</span>
        <span className="analyze-setting-value">{active.label}</span>
        <ChevronDown
          className={`analyze-setting-chevron${open ? " is-open" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="analyze-setting-menu" role="listbox" aria-label={label}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`analyze-setting-item${value === opt.value ? " is-active" : ""}`}
            >
              {opt.label}
              {value === opt.value && (
                <span className="analyze-setting-check" aria-hidden="true">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DepthDropdown({ depth, onChange, disabled }: { depth: AnalysisDepth; onChange: (d: AnalysisDepth) => void; disabled?: boolean; }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = DEPTH_OPTIONS.find((o) => o.value === depth)!;
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={containerRef} className="analyze-depth-dropdown-root">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} className="analyze-depth-dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`Analysis mode: ${active.label}`}>
        <span className="analyze-depth-dropdown-icon">{active.icon}</span>
        <span className="analyze-depth-dropdown-label">{active.label}</span>
        <ChevronDown className={`analyze-depth-dropdown-chevron${open ? " is-open" : ""}`} strokeWidth={2} />
      </button>
      {open && (
        <div className="analyze-depth-dropdown-menu" role="listbox" aria-label="Analysis mode">
          {DEPTH_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" role="option" aria-selected={depth === opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} className={`analyze-depth-dropdown-item${depth === opt.value ? " is-active" : ""}`}>
              <span className="analyze-depth-dropdown-item-icon">{opt.icon}</span>
              <span className="analyze-depth-dropdown-item-label">{opt.label}</span>
              {depth === opt.value && <span className="analyze-depth-dropdown-item-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalysisComposer({
  value, onChange, onAnalyze, onAttachFiles, onOpenVault,
  documents, onRemoveDocument, playbookDocId = null, onTogglePlaybook,
  answerStyle, analysisDepth,
  onSetAnswerStyle, onSetAnalysisDepth,
  canAnalyze: _canAnalyze, isAnalyzing, isUploading = false, uploadProgress, validationMessage,
  isDragging = false, onDragOver, onDragLeave, onDrop, variant = "landing",
}: AnalysisComposerProps) {
  const { ref: textareaRef, adjust } = useAutoResize(72, 168);
  const hasDocuments = documents.length > 0;
  const submitBlocked = isAnalyzing || isUploading;
  const isLanding = variant === "landing";
  const canSend = value.trim().length > 0 && !submitBlocked;

  useEffect(() => { adjust(); }, [value, adjust]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (value.trim() && !submitBlocked) onAnalyze(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); if (value.trim() && !submitBlocked) onAnalyze(); }
  };

  const placeholder = "Ask a question or describe the analysis you want LORA to perform\u2026";

  if (isLanding) {
    return (
      <div className="relative w-full max-w-[720px] mx-auto" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px]" style={{ background: "rgba(79, 91, 217, 0.06)" }}>
            <span className="text-[13px] font-medium text-[#4F5BD9]">Drop file to attach</span>
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
                  showPlaybookToggle={documents.length > 1 && doc.type !== "folder"}
                  isPlaybook={playbookDocId === doc.id}
                  onTogglePlaybook={onTogglePlaybook ? () => onTogglePlaybook(doc) : undefined}
                />
              ))}
            </div>
          )}

          <div className="flex items-start gap-3 px-5 pt-4 pb-1">
            <textarea
              ref={textareaRef} value={value} rows={3}
              onChange={(e) => { onChange(e.target.value); adjust(); }}
              onKeyDown={handleKeyDown} placeholder={placeholder} disabled={isAnalyzing}
              className="pcl-input flex-1 bg-transparent text-[14px] leading-[1.55] resize-none outline-none"
              style={{ minHeight: 72, maxHeight: 168, color: "#1a1a1a", fontWeight: 400 }}
              aria-label="Analysis request"
            />
          </div>

          {/* ── Toolbar row ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
            <button type="button" onClick={onAttachFiles} disabled={isAnalyzing || isUploading} className="analyze-icon-btn" aria-label="Attach file">
              <Paperclip className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>
            <button type="button" onClick={onOpenVault} disabled={isAnalyzing} className="analyze-icon-btn" aria-label="Select from Vault">
              <Archive className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>
            <div className="flex-1" />
            <DepthDropdown depth={analysisDepth} onChange={onSetAnalysisDepth} disabled={isAnalyzing} />
            <button type="button" disabled={!canSend} onClick={onAnalyze} className="analyze-enter-btn primary-gradient" aria-label={isAnalyzing ? "Analyzing\u2026" : "Analyze"}>
              {submitBlocked ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" strokeWidth={2} />}
            </button>
          </div>
        </div>

        {/* ── Settings row — below the composer, outside the box ───────── */}
        <div className="analyze-settings-row">
          <SettingDropdown
            label="Output"
            options={[
              { value: "narrative", label: "Narrative" },
              { value: "tabular",   label: "Tabular"   },
            ]}
            value={answerStyle}
            onChange={onSetAnswerStyle}
            disabled={isAnalyzing}
          />
        </div>

        {isUploading && (
          <p className="mt-3 text-center text-[12px] text-[#98A2B3]" role="status">
            {uploadProgress && uploadProgress.total > 0 ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}\u2026` : "Uploading\u2026"}
          </p>
        )}
        {validationMessage && !isUploading && (
          <p className="mt-3 text-center text-[13px] text-badge-red-text" role="alert">{validationMessage}</p>
        )}
      </div>
    );
  }

  // Default (compact) variant
  return (
    <div className="w-full relative max-w-[720px] mx-auto" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="pcl-composer relative overflow-visible">
        <div className="flex items-start gap-3 px-5 pt-4 pb-1">
          <textarea ref={textareaRef} value={value} onChange={(e) => { onChange(e.target.value); adjust(); }} onKeyDown={handleKeyDown} placeholder={placeholder} disabled={isAnalyzing} className="pcl-input flex-1 bg-transparent text-[14px] leading-[1.55] resize-none outline-none" style={{ minHeight: 72, maxHeight: 168, color: "#1a1a1a" }} rows={3} />
        </div>
        <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
          <button type="button" onClick={onAttachFiles} disabled={isAnalyzing || isUploading} className="pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full bg-[#F4F4F5] text-[#71717A]">
            <Paperclip className="w-[15px] h-[15px]" />
          </button>
          <div className="flex-1" />
          <button type="button" disabled={!canSend} onClick={onAnalyze} className="pcl-enter-btn w-9 h-9 flex items-center justify-center rounded-full disabled:opacity-40 bg-[#18181B] text-white">
            {submitBlocked ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerDownLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
