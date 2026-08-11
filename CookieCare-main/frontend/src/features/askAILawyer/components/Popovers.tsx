/**
 * Popovers — Context configuration panels for the ComposerBar.
 *
 * Renders inline above the composer when a toolbar button is active.
 * Panels: Jurisdictions | Knowledge Base | Output Format | Web Discovery
 *
 * Follows the RandTrust Design System: shadow-md, radius-lg, no glows,
 * semantic colors only, clean enterprise typography.
 */
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload, Folder, FileText,
  Plus, Trash2, Check, X, Globe, FileCode,
} from "lucide-react";
import { KBFolder, OutputFormat, PopoverType } from "../types";

interface PopoversProps {
  openPopover: PopoverType;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  availableJurisdictions: any[];
  selectedJurisdictions: string[];
  toggleJurisdiction: (label: string) => void;
  setSelectedJurisdictions: (v: string[]) => void;
  selectedFormat: OutputFormat;
  setSelectedFormat: (f: OutputFormat) => void;
  folders: KBFolder[];
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  handleAddFolder: (e: React.FormEvent) => void;
  toggleFolderSelection: (id: string) => void;
  handleDeleteFolder: (id: string, e: React.MouseEvent) => void;
  setActiveFolderForUpload: (id: string) => void;
  fileUploadRef: React.RefObject<HTMLInputElement | null>;
  selectedKBCount: number;
  selectedFolderCount: number;
  webDiscoveryUrlInput: string;
  setWebDiscoveryUrlInput: (v: string) => void;
  webDiscoveryUrls: string[];
  handleAddWebUrl: (e: React.FormEvent) => void;
  removeWebUrl: (url: string) => void;
  setOpenPopover: (p: PopoverType) => void;
}

const FORMAT_OPTIONS: { fmt: OutputFormat; desc: string }[] = [
  {
    fmt: "Brief Summary",
    desc: "Concise overview with key findings and practical recommendations.",
  },
  {
    fmt: "CREAC",
    desc: "Conclusion · Rule · Explanation · Application · Conclusion.",
  },
];

/** Shared popover surface styles */
const popoverSurface: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E4E4E7",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

/** Shared popover header */
function PopoverHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: "1px solid #F0F0F2" }}
    >
      <div>
        <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
            {subtitle}
          </p>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
          style={{ color: "#9CA3AF" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#F3F4F6";
            (e.currentTarget as HTMLElement).style.color = "#374151";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "#9CA3AF";
          }}
        >
          <X className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function Popovers({
  openPopover,
  popoverRef,
  availableJurisdictions,
  selectedJurisdictions,
  toggleJurisdiction,
  setSelectedJurisdictions,
  selectedFormat,
  setSelectedFormat,
  folders,
  newFolderName,
  setNewFolderName,
  handleAddFolder,
  toggleFolderSelection,
  handleDeleteFolder,
  setActiveFolderForUpload,
  fileUploadRef,
  selectedKBCount,
  selectedFolderCount,
  webDiscoveryUrlInput,
  setWebDiscoveryUrlInput,
  webDiscoveryUrls,
  handleAddWebUrl,
  removeWebUrl,
  setOpenPopover,
}: PopoversProps) {
  return (
    <AnimatePresence>
      {openPopover && (
        <motion.div
          key={openPopover}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full mb-2.5 left-0 z-50 w-full max-w-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div ref={popoverRef} className="w-full">

            {/* ── JURISDICTIONS ── */}
            {openPopover === "jurisdictions" && (
              <div style={popoverSurface}>
                <PopoverHeader
                  title="Select Jurisdictions"
                  subtitle={`${selectedJurisdictions.length} selected`}
                />
                <div className="p-3 max-h-64 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {availableJurisdictions.map((jc) => {
                      const sel = selectedJurisdictions.includes(jc.label);
                      return (
                        <button
                          key={jc.key}
                          type="button"
                          onClick={() => toggleJurisdiction(jc.label)}
                          aria-pressed={sel}
                          aria-label={`${sel ? "Remove" : "Add"} ${jc.label}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium transition-all duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                          style={{
                            background: sel ? "#EBF2FD" : "#F3F4F6",
                            border: `1px solid ${sel ? "#BFDBFE" : "#E4E4E7"}`,
                            color: sel ? "#1A5BAD" : "#374151",
                          }}
                        >
                          {sel && (
                            <Check className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                          )}
                          {jc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {selectedJurisdictions.length > 0 && (
                  <div
                    className="px-4 py-3 flex justify-between items-center"
                    style={{ borderTop: "1px solid #F0F0F2" }}
                  >
                    <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                      {selectedJurisdictions.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedJurisdictions([])}
                      className="text-[11px] font-medium cursor-pointer transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
                      style={{ color: "#DC2626" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#B91C1C"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#DC2626"}
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── KNOWLEDGE BASE ── */}
            {openPopover === "kb" && (
              <div style={popoverSurface}>
                <PopoverHeader
                  title="Knowledge Base"
                  subtitle={`${selectedKBCount} doc${selectedKBCount !== 1 ? "s" : ""} active across ${selectedFolderCount} folder${selectedFolderCount !== 1 ? "s" : ""}`}
                />
                <div className="p-3 space-y-2">
                  {/* Folder list */}
                  <div className="max-h-52 overflow-y-auto space-y-1.5">
                    {folders.length === 0 ? (
                      <p
                        className="text-[12px] text-center py-4"
                        style={{ color: "#9CA3AF" }}
                      >
                        No folders yet. Upload a document to get started.
                      </p>
                    ) : (
                      folders.map((f) => (
                        <div
                          key={f.id}
                          className="rounded-lg transition-all duration-100"
                          style={{
                            border: `1px solid ${f.isSelected ? "#BFDBFE" : "#E4E4E7"}`,
                            background: f.isSelected ? "#F7FBFF" : "#F9FAFB",
                          }}
                        >
                          <div
                            className="flex items-center justify-between px-3 py-2 cursor-pointer"
                            onClick={() => toggleFolderSelection(f.id)}
                            role="button"
                            tabIndex={0}
                            aria-pressed={f.isSelected}
                            aria-label={`${f.isSelected ? "Deselect" : "Select"} folder ${f.name}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleFolderSelection(f.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {/* Checkbox */}
                              <div
                                className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
                                style={{
                                  background: f.isSelected ? "#2175D9" : "#FFFFFF",
                                  border: `1.5px solid ${f.isSelected ? "#2175D9" : "#D1D5DB"}`,
                                }}
                                aria-hidden="true"
                              >
                                {f.isSelected && (
                                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                                )}
                              </div>
                              <Folder
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: f.isSelected ? "#2175D9" : "#D1D5DB" }}
                                strokeWidth={1.5}
                                aria-hidden="true"
                              />
                              <span
                                className="text-[12px] truncate"
                                style={{
                                  color: f.isSelected ? "#111827" : "#9CA3AF",
                                  fontWeight: f.isSelected ? 500 : 400,
                                }}
                              >
                                {f.name}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: "#F3F4F6", color: "#6B7280" }}
                              >
                                {f.files.length}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  setActiveFolderForUpload(f.id);
                                  e.stopPropagation();
                                  fileUploadRef.current?.click();
                                }}
                                className="w-5 h-5 flex items-center justify-center transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2175D9] rounded"
                                style={{ color: "#D1D5DB" }}
                                title="Upload to this folder"
                                aria-label={`Upload document to folder ${f.name}`}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#6B7280"}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#D1D5DB"}
                              >
                                <Upload className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteFolder(f.id, e)}
                                className="w-5 h-5 flex items-center justify-center transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626] rounded"
                                style={{ color: "#D1D5DB" }}
                                aria-label={`Delete folder ${f.name}`}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#DC2626"}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#D1D5DB"}
                              >
                                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>

                          {/* File list (expanded when selected) */}
                          {f.isSelected && f.files.length > 0 && (
                            <div
                              className="px-3 pb-2 pt-0.5 space-y-0.5"
                              style={{ borderTop: "1px solid #DBEAFE" }}
                            >
                              {f.files.slice(0, 3).map((file, fi) => (
                                <div key={fi} className="flex items-center gap-1.5">
                                  <FileText
                                    className="w-2.5 h-2.5 shrink-0"
                                    style={{ color: "#D1D5DB" }}
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                  />
                                  <span
                                    className="text-[10px] truncate"
                                    style={{ color: "#6B7280" }}
                                  >
                                    {file.name}
                                  </span>
                                </div>
                              ))}
                              {f.files.length > 3 && (
                                <p
                                  className="text-[10px]"
                                  style={{ color: "#9CA3AF" }}
                                >
                                  +{f.files.length - 3} more
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add folder form */}
                  <form onSubmit={handleAddFolder} className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New folder name…"
                      aria-label="New folder name"
                      className="flex-1 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none transition-colors duration-100"
                      style={{
                        background: "#F9FAFB",
                        border: "1px solid #E4E4E7",
                        color: "#111827",
                      }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#BFDBFE";
                        (e.currentTarget as HTMLElement).style.background = "#F7FBFF";
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#E4E4E7";
                        (e.currentTarget as HTMLElement).style.background = "#F9FAFB";
                      }}
                    />
                    <button
                      type="submit"
                      aria-label="Add folder"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-colors duration-100 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                      style={{ background: "#2175D9" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#1D66C2"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#2175D9"}
                    >
                      <Plus className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </form>

                  {/* Upload shortcut */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolderForUpload("");
                      setOpenPopover(null);
                      fileUploadRef.current?.click();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium rounded-lg py-2 transition-all duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                    style={{ border: "1px dashed #D1D5DB", color: "#6B7280" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#2175D9";
                      (e.currentTarget as HTMLElement).style.color = "#1A5BAD";
                      (e.currentTarget as HTMLElement).style.background = "#EBF2FD";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#D1D5DB";
                      (e.currentTarget as HTMLElement).style.color = "#6B7280";
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <Upload className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
                    Upload document
                  </button>
                </div>
              </div>
            )}

            {/* ── WEB DISCOVERY ── */}
            {openPopover === "web" && (
              <div style={popoverSurface}>
                <PopoverHeader
                  title="Web Discovery"
                  subtitle="External sources to reference during research"
                  onClose={() => setOpenPopover(null)}
                />
                <div className="p-3 space-y-2">
                  <form onSubmit={handleAddWebUrl} className="flex gap-1.5">
                    <input
                      type="url"
                      value={webDiscoveryUrlInput}
                      onChange={(e) => setWebDiscoveryUrlInput(e.target.value)}
                      placeholder="https://gazette.gov"
                      aria-label="Web URL to add"
                      className="flex-1 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none transition-colors duration-100"
                      style={{ background: "#F9FAFB", border: "1px solid #E4E4E7", color: "#111827" }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#BFDBFE";
                        (e.currentTarget as HTMLElement).style.background = "#F7FBFF";
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#E4E4E7";
                        (e.currentTarget as HTMLElement).style.background = "#F9FAFB";
                      }}
                    />
                    <button
                      type="submit"
                      aria-label="Add URL"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-colors duration-100 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                      style={{ background: "#2175D9" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#1D66C2"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#2175D9"}
                    >
                      <Plus className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </form>

                  {webDiscoveryUrls.length === 0 ? (
                    <p
                      className="text-[11px] text-center py-3"
                      style={{ color: "#9CA3AF" }}
                    >
                      No URLs added — will use standard legal index.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {webDiscoveryUrls.map((url, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg"
                          style={{ border: "1px solid #E4E4E7", background: "#F9FAFB" }}
                        >
                          <Globe
                            className="w-3 h-3 shrink-0"
                            style={{ color: "#9CA3AF" }}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <span
                            className="text-[11px] truncate flex-1"
                            style={{ color: "#374151" }}
                          >
                            {url}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeWebUrl(url)}
                            aria-label={`Remove ${url}`}
                            className="shrink-0 cursor-pointer transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626] rounded"
                            style={{ color: "#D1D5DB" }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#DC2626"}
                            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#D1D5DB"}
                          >
                            <X className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── OUTPUT FORMAT ── */}
            {openPopover === "format" && (
              <div style={popoverSurface}>
                <PopoverHeader title="Output Format" />
                <div className="p-3 space-y-1.5">
                  {FORMAT_OPTIONS.map(({ fmt, desc }) => {
                    const sel = selectedFormat === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => { setSelectedFormat(fmt); setOpenPopover(null); }}
                        aria-pressed={sel}
                        className="w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-all duration-100 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                        style={{
                          background: sel ? "#EBF2FD" : "#FFFFFF",
                          border: `1px solid ${sel ? "#BFDBFE" : "#E4E4E7"}`,
                        }}
                        onMouseEnter={(e) => {
                          if (!sel)
                            (e.currentTarget as HTMLElement).style.background = "#F3F4F6";
                        }}
                        onMouseLeave={(e) => {
                          if (!sel)
                            (e.currentTarget as HTMLElement).style.background = "#FFFFFF";
                        }}
                      >
                        {/* Radio indicator */}
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-100"
                          style={{
                            borderColor: sel ? "#2175D9" : "#D1D5DB",
                            background: sel ? "#2175D9" : "transparent",
                          }}
                          aria-hidden="true"
                        >
                          {sel && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <div>
                          <p
                            className="text-[12px] font-semibold"
                            style={{ color: sel ? "#1A5BAD" : "#111827" }}
                          >
                            {fmt}
                          </p>
                          <p
                            className="text-[11px] mt-0.5 leading-relaxed"
                            style={{ color: sel ? "#1A5BAD" : "#9CA3AF" }}
                          >
                            {desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
