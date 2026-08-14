/**
 * ComposerBar — The workspace input for Ask AI Lawyer.
 *
 * Design intent:
 *   The composer is not a form inside a card. It is the workspace.
 *   It should feel like a premium tool — confident proportions, generous
 *   internal breathing room, purposeful action layout.
 *
 *   Landing variant: Deep (4+ rows), white surface, prominent shadow.
 *   Chat variant: Compact (1-2 rows), sits cleanly on the page floor.
 *
 *   The send button earns its state — grey until there is content,
 *   brand blue the moment a character is typed.
 *
 *   Active context chips (jurisdictions, docs, format) appear inside the
 *   composer surface, above the textarea, only when set. The default
 *   state is completely clean.
 *
 *   Action icons live at the bottom-left of the surface. No labels.
 *   Their tooltips carry the affordance. They never compete with the text.
 */
import React, { useState, useCallback } from "react";
import {
  Gavel, Folder, ArrowUp, RefreshCw, Paperclip,
  FileText, X, Globe, CornerDownLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OutputFormat, PopoverType } from "../types";
import Popovers from "./Popovers";
import { KBFolder } from "../types";

interface ComposerBarProps {
  variant?: "landing" | "chat";
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  autoResizeTextarea: () => void;
  handleQueryDispatch: (e?: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  selectedJurisdictions: string[];
  toggleJurisdiction: (label: string) => void;
  selectedKBCount: number;
  selectedFolderCount: number;
  webDiscoveryUrls: string[];
  selectedFormat: OutputFormat;
  openPopover: PopoverType;
  togglePopover: (p: PopoverType) => void;
  setOpenPopover: (p: PopoverType) => void;
  composerRef: React.RefObject<HTMLDivElement | null>;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileUploadRef: React.RefObject<HTMLInputElement | null>;
  availableJurisdictions: any[];
  setSelectedJurisdictions: (v: string[]) => void;
  setSelectedFormat: (f: OutputFormat) => void;
  folders: KBFolder[];
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  handleAddFolder: (e: React.FormEvent) => void;
  toggleFolderSelection: (id: string) => void;
  handleDeleteFolder: (id: string, e: React.MouseEvent) => void;
  setActiveFolderForUpload: (id: string) => void;
  webDiscoveryUrlInput: string;
  setWebDiscoveryUrlInput: (v: string) => void;
  handleAddWebUrl: (e: React.FormEvent) => void;
  removeWebUrl: (url: string) => void;
}

const buildPopoverProps = (props: ComposerBarProps) => ({
  openPopover: props.openPopover,
  popoverRef: props.popoverRef,
  availableJurisdictions: props.availableJurisdictions,
  selectedJurisdictions: props.selectedJurisdictions,
  toggleJurisdiction: props.toggleJurisdiction,
  setSelectedJurisdictions: props.setSelectedJurisdictions,
  selectedFormat: props.selectedFormat,
  setSelectedFormat: props.setSelectedFormat,
  folders: props.folders,
  newFolderName: props.newFolderName,
  setNewFolderName: props.setNewFolderName,
  handleAddFolder: props.handleAddFolder,
  toggleFolderSelection: props.toggleFolderSelection,
  handleDeleteFolder: props.handleDeleteFolder,
  setActiveFolderForUpload: props.setActiveFolderForUpload,
  fileUploadRef: props.fileUploadRef,
  selectedKBCount: props.selectedKBCount,
  selectedFolderCount: props.selectedFolderCount,
  webDiscoveryUrlInput: props.webDiscoveryUrlInput,
  setWebDiscoveryUrlInput: props.setWebDiscoveryUrlInput,
  webDiscoveryUrls: props.webDiscoveryUrls,
  handleAddWebUrl: props.handleAddWebUrl,
  removeWebUrl: props.removeWebUrl,
  setOpenPopover: props.setOpenPopover,
});

// Active context chip — appears inside the composer when context is set
function ContextChip({
  label,
  icon: Icon,
  onRemove,
}: {
  label: string;
  icon: React.ElementType;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex select-none items-center gap-1.5 rounded-full bg-[#EEF2FF] py-1 pl-2.5 pr-1 text-[11px] font-medium leading-none text-[#4F5BD9]">
      <Icon className="h-2.5 w-2.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:text-[#DC2626]"
      >
        <X className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  );
}

// Bottom-bar icon action button
function ActionBtn({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none transition-colors duration-150"
      style={{
        color: active ? "#4F5BD9" : "#667085",
        background: active ? "#EEF2FF" : "transparent",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "#EEF2FF";
        el.style.color = "#4F5BD9";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = active ? "#4F5BD9" : "#667085";
        el.style.background = active ? "#EEF2FF" : "transparent";
      }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

export default function ComposerBar(props: ComposerBarProps) {
  const {
    variant = "chat",
    searchQuery,
    setSearchQuery,
    autoResizeTextarea,
    handleQueryDispatch,
    handleKeyDown,
    isStreaming,
    selectedJurisdictions,
    setSelectedJurisdictions,
    selectedKBCount,
    selectedFormat,
    setSelectedFormat,
    openPopover,
    togglePopover,
    composerRef,
    textareaRef,
    fileUploadRef,
    setActiveFolderForUpload,
    webDiscoveryUrls,
    folders,
    toggleFolderSelection,
  } = props;

  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isLanding = variant === "landing";

  const jurisdictionsActive = openPopover === "jurisdictions" || selectedJurisdictions.length > 0;
  const kbActive = openPopover === "kb" || selectedKBCount > 0;
  const formatActive = openPopover === "format" || selectedFormat !== "Brief Summary";

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      setActiveFolderForUpload("");
      fileUploadRef.current?.click();
    }
  }, [setActiveFolderForUpload, fileUploadRef]);

  // Build active context chips
  const chips: React.ReactNode[] = [];
  if (selectedJurisdictions.length > 0) {
    chips.push(
      <ContextChip
        key="j"
        label={selectedJurisdictions.length === 1 ? selectedJurisdictions[0] : `${selectedJurisdictions.length} Jurisdictions`}
        icon={Gavel}
        onRemove={() => setSelectedJurisdictions([])}
      />
    );
  }
  if (selectedKBCount > 0) {
    chips.push(
      <ContextChip
        key="kb"
        label={`${selectedKBCount} Doc${selectedKBCount > 1 ? "s" : ""}`}
        icon={Folder}
        onRemove={() => {
          folders.filter((f) => f.isSelected).forEach((f) => toggleFolderSelection(f.id));
        }}
      />
    );
  }
  if (selectedFormat !== "Brief Summary") {
    chips.push(
      <ContextChip
        key="fmt"
        label={selectedFormat}
        icon={FileText}
        onRemove={() => setSelectedFormat("Brief Summary")}
      />
    );
  }
  if (webDiscoveryUrls.length > 0) {
    chips.push(
      <ContextChip
        key="web"
        label={`${webDiscoveryUrls.length} Web source${webDiscoveryUrls.length > 1 ? "s" : ""}`}
        icon={Globe}
        onRemove={() => togglePopover("web")}
      />
    );
  }

  const hasContent = searchQuery.trim().length > 0;
  const canSend = hasContent && !isStreaming;

  if (isLanding) {
    return (
      <div
        className="w-full relative max-w-[720px] mx-auto"
        ref={composerRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-[#EEF2FF]/90">
            <span className="text-[13px] font-medium text-[#4F5BD9]">Drop file to attach</span>
          </div>
        )}

        <div className="pcl-composer relative overflow-hidden">
          <AnimatePresence>
            {chips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="flex flex-wrap gap-1.5 px-5 pt-3 pb-0"
              >
                {chips}
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`flex items-start gap-3 px-5 ${chips.length > 0 ? "pt-3 pb-1" : "pt-4 pb-1"}`}>
            <textarea
              ref={textareaRef}
              id="legal-prompt-input"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); autoResizeTextarea(); }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask a legal question, describe a clause, or paste an agreement excerpt…"
              className="pcl-input flex-1 resize-none bg-transparent text-[14px] leading-relaxed outline-none"
              style={{
                minHeight: 28,
                maxHeight: 120,
                color: "#1a1a1a",
                fontWeight: 400,
              }}
              aria-label="Legal query input"
            />
            <span className="shrink-0 select-none pt-0.5 text-[11px] tracking-wide text-[#98A2B3]">
              Ctrl+Y
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
            <button
              type="button"
              onClick={() => { setActiveFolderForUpload(""); fileUploadRef.current?.click(); }}
              className="pcl-attach-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]"
              aria-label="Attach document"
            >
              <Paperclip className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => togglePopover("jurisdictions")}
              className={`pcl-attach-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] ${
                jurisdictionsActive ? "text-[#4F5BD9]" : "text-[#667085]"
              }`}
              aria-label="Select jurisdictions"
            >
              <Gavel className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => togglePopover("kb")}
              className={`pcl-attach-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] ${
                kbActive ? "text-[#4F5BD9]" : "text-[#667085]"
              }`}
              aria-label="Knowledge base"
            >
              <Folder className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>
            <div className="flex-1" />
            <button
              id="legal-prompt-submit"
              type="button"
              onClick={() => handleQueryDispatch()}
              disabled={!canSend}
              className="pcl-enter-btn primary-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={isStreaming ? "Processing…" : "Submit"}
            >
              {isStreaming ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CornerDownLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <Popovers {...buildPopoverProps(props)} />
      </div>
    );
  }

  // Chat variant — compact pinned footer composer
  const borderColor = isDragging
    ? "rgba(79, 91, 217, 0.35)"
    : isFocused
    ? "rgba(16, 24, 40, 0.14)"
    : "transparent";

  return (
    <div
      className="w-full relative"
      ref={composerRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className="ask-lawyer-composer-chat w-full overflow-visible"
        style={{
          border: isDragging || isFocused ? `1px solid ${borderColor}` : undefined,
        }}
      >
        <AnimatePresence>
          {chips.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex flex-wrap gap-1.5 px-4 pt-3 pb-0"
              style={{ overflow: "hidden" }}
            >
              {chips}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`px-4 ${chips.length > 0 ? "pt-2.5" : "pt-3.5"} pb-1`}>
          <textarea
            ref={textareaRef}
            id="legal-prompt-input"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); autoResizeTextarea(); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isStreaming}
            placeholder="Ask a follow-up question…"
            rows={1}
            aria-label="Legal query input"
            className="block w-full resize-none bg-transparent text-[14px] leading-relaxed text-[#1a1a1a] outline-none placeholder:text-[#98A2B3]"
            style={{
              minHeight: "28px",
              maxHeight: "200px",
              caretColor: "#4F5BD9",
              overflowY: "auto",
            }}
          />
        </div>

        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-0.5">
            <ActionBtn
              icon={Paperclip}
              label="Attach document (PDF, DOCX, TXT)"
              onClick={() => { setActiveFolderForUpload(""); fileUploadRef.current?.click(); }}
            />
            <ActionBtn
              icon={Gavel}
              label={selectedJurisdictions.length > 0 ? `${selectedJurisdictions.length} jurisdiction${selectedJurisdictions.length > 1 ? "s" : ""} selected` : "Select jurisdictions"}
              active={jurisdictionsActive}
              onClick={() => togglePopover("jurisdictions")}
            />
            <ActionBtn
              icon={Folder}
              label={selectedKBCount > 0 ? `${selectedKBCount} docs in knowledge base` : "Knowledge base"}
              active={kbActive}
              onClick={() => togglePopover("kb")}
            />
          </div>

          <button
            id="legal-prompt-submit"
            type="button"
            onClick={() => handleQueryDispatch()}
            disabled={!canSend}
            aria-label={isStreaming ? "Processing…" : "Send message"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none transition-opacity duration-150 ${
              canSend ? "primary-gradient cursor-pointer" : "cursor-default bg-[#EEF2FF]"
            }`}
            style={{
              opacity: canSend ? 1 : 0.45,
            }}
          >
            {isStreaming
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#98A2B3]" strokeWidth={2} aria-hidden="true" />
              : <ArrowUp
                  className="h-3.5 w-3.5"
                  style={{ color: canSend ? "#FFFFFF" : "#98A2B3" }}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
            }
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[24px] bg-[#EEF2FF]/94"
          >
            <Paperclip className="mb-1.5 h-5 w-5 text-[#4F5BD9]" strokeWidth={1.5} aria-hidden="true" />
            <p className="m-0 text-[12px] font-medium text-[#4F5BD9]">Drop to attach</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Popovers {...buildPopoverProps(props)} />
    </div>
  );
}
