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
    <span
      className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium select-none"
      style={{
        background: "#F4F4F5",
        border: "1px solid #E4E4E7",
        color: "#52525B",
        lineHeight: 1,
      }}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="w-4 h-4 flex items-center justify-center rounded-full transition-colors duration-100 cursor-pointer ml-0.5 border-none bg-transparent"
        style={{ color: "#A1A1AA" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#DC2626")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#A1A1AA")}
      >
        <X className="w-2.5 h-2.5" strokeWidth={2} aria-hidden="true" />
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
      className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-100 cursor-pointer shrink-0 border-none"
      style={{
        color: active ? "#18181B" : "#71717A",
        background: active ? "#F4F4F5" : "transparent",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "#F4F4F5";
        el.style.color = "#18181B";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = active ? "#18181B" : "#71717A";
        el.style.background = active ? "#F4F4F5" : "transparent";
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
        onRemove={() => togglePopover("kb")}
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
          <div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none rounded-[22px]"
            style={{
              background: "rgba(0, 0, 0, 0.04)",
              border: "2px dashed rgba(0, 0, 0, 0.12)",
            }}
          >
            <span className="text-[13px] font-medium text-[#52525B]">Drop file to attach</span>
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
              className="pcl-input flex-1 bg-transparent text-[14px] leading-relaxed resize-none outline-none"
              style={{
                minHeight: 28,
                maxHeight: 120,
                color: "#18181B",
                fontWeight: 400,
              }}
              aria-label="Legal query input"
            />
            <span className="shrink-0 text-[11px] pt-0.5 select-none text-[#D4D4D8] tracking-wide">
              Ctrl+Y
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 pb-3.5 pt-2">
            <button
              type="button"
              onClick={() => { setActiveFolderForUpload(""); fileUploadRef.current?.click(); }}
              className="pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] text-[#71717A]"
              aria-label="Attach document"
            >
              <Paperclip className="w-[15px] h-[15px]" />
            </button>
            <button
              type="button"
              onClick={() => togglePopover("jurisdictions")}
              className={`pcl-attach-btn w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-[#F4F4F5] ${
                jurisdictionsActive ? "text-[#18181B]" : "text-[#71717A]"
              }`}
              aria-label="Select jurisdictions"
            >
              <Gavel className="w-[15px] h-[15px]" />
            </button>
            <div className="flex-1" />
            <button
              id="legal-prompt-submit"
              type="button"
              onClick={() => handleQueryDispatch()}
              disabled={!canSend}
              className="pcl-enter-btn w-9 h-9 flex items-center justify-center rounded-full shrink-0 disabled:opacity-40 disabled:cursor-not-allowed bg-[#18181B] text-white"
              aria-label={isStreaming ? "Processing…" : "Submit"}
            >
              {isStreaming ? (
                <RefreshCw className="w-[16px] h-[16px] animate-spin" />
              ) : (
                <CornerDownLeft className="w-[16px] h-[16px]" />
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
    ? "#18181B"
    : isFocused
    ? "#D4D4D8"
    : "#E4E4E7";

  const shadow = isFocused
    ? "0 0 0 3px rgba(24,24,27,0.05), 0 2px 8px rgba(0,0,0,0.05)"
    : "0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.04)";

  return (
    <div
      className="w-full relative"
      ref={composerRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className="w-full overflow-visible"
        style={{
          background: "#FFFFFF",
          border: `1px solid ${borderColor}`,
          boxShadow: shadow,
          borderRadius: 22,
          transition: "border-color 120ms ease, box-shadow 120ms ease",
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
            className="w-full bg-transparent focus:outline-none resize-none block placeholder:select-none placeholder:text-[#C4C4C4]"
            style={{
              minHeight: "28px",
              maxHeight: "200px",
              fontSize: "14px",
              lineHeight: "1.6",
              color: "#18181B",
              caretColor: "#18181B",
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
          </div>

          <button
            id="legal-prompt-submit"
            type="button"
            onClick={() => handleQueryDispatch()}
            disabled={!canSend}
            aria-label={isStreaming ? "Processing…" : "Send message"}
            className="flex items-center justify-center rounded-full transition-all duration-150 shrink-0 border-none"
            style={{
              width: "36px",
              height: "36px",
              background: canSend ? "#18181B" : "#F4F4F5",
              cursor: canSend ? "pointer" : "default",
            }}
          >
            {isStreaming
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: "#A1A1AA" }} strokeWidth={2} aria-hidden="true" />
              : <ArrowUp
                  className="w-3.5 h-3.5"
                  style={{ color: canSend ? "#FFFFFF" : "#C4C4C4" }}
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
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
            style={{
              background: "rgba(250,250,250,0.94)",
              border: "2px dashed #D4D4D8",
              borderRadius: 22,
            }}
          >
            <Paperclip className="w-5 h-5 mb-1.5" style={{ color: "#71717A" }} strokeWidth={1.5} aria-hidden="true" />
            <p style={{ fontSize: "12px", fontWeight: 500, color: "#52525B" }}>Drop to attach</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Popovers {...buildPopoverProps(props)} />
    </div>
  );
}
