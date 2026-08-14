import { useState, useMemo } from "react";
import {
  X,
  Search,
  Folder,
  ChevronDown,
  ChevronUp,
  FileText,
  FileCode,
  Check,
} from "lucide-react";
import { CustomFolder, SavedDraft } from "../types";
import { isPlaceholderVaultDocument } from "../utils/vaultDocumentFilters";
import { ANALYZE_STYLES } from "../styles/analyzeStyles";
import { LibraryModalOverlay } from "./LibraryModalColumns";

interface VaultPickerSheetProps {
  folders: CustomFolder[];
  savedDrafts: SavedDraft[];
  onToggleFolderSelection: (id: string) => void;
  onToggleFolderExpanded: (id: string, e: React.MouseEvent) => void;
  onToggleFileSelection: (folderId: string, fileId: string, e: React.MouseEvent) => void;
  onToggleDraftSelection: (id: string) => void;
  onClose: () => void;
  description?: string;
}

function Checkbox({
  checked,
  indeterminate,
  size = "md",
}: {
  checked: boolean;
  indeterminate?: boolean;
  size?: "md" | "sm";
}) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-[5px] transition-colors`}
      style={{
        background: checked ? "#111827" : indeterminate ? "#EEF2FF" : "#ffffff",
        border: `1.5px solid ${checked || indeterminate ? "#111827" : "#D0D5DD"}`,
      }}
    >
      {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
      {indeterminate && !checked && <div className="h-0.5 w-2 rounded-full bg-[#111827]" />}
    </div>
  );
}

function sanitizeFolders(folders: CustomFolder[]): CustomFolder[] {
  return folders
    .map((folder) => ({
      ...folder,
      files: folder.files.filter((f) => !isPlaceholderVaultDocument(f)),
    }))
    .filter((folder) => folder.files.length > 0);
}

function sanitizeDrafts(drafts: SavedDraft[]): SavedDraft[] {
  return drafts.filter((d) => !isPlaceholderVaultDocument(d));
}

export function VaultPickerSheet({
  folders,
  savedDrafts,
  onToggleFolderSelection,
  onToggleFolderExpanded,
  onToggleFileSelection,
  onToggleDraftSelection,
  onClose,
  description = "Browse and select documents for this analysis.",
}: VaultPickerSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const cleanFolders = useMemo(() => sanitizeFolders(folders), [folders]);
  const cleanDrafts = useMemo(() => sanitizeDrafts(savedDrafts), [savedDrafts]);

  const filteredFolders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cleanFolders;
    return cleanFolders
      .map((folder) => {
        const folderMatch = folder.name.toLowerCase().includes(q);
        const matchingFiles = folder.files.filter((f) =>
          f.title.toLowerCase().includes(q)
        );
        if (folderMatch || matchingFiles.length > 0) {
          return {
            ...folder,
            expanded: true,
            files: folderMatch ? folder.files : matchingFiles,
          };
        }
        return null;
      })
      .filter(Boolean) as CustomFolder[];
  }, [cleanFolders, searchQuery]);

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cleanDrafts;
    return cleanDrafts.filter((d) => d.title.toLowerCase().includes(q));
  }, [cleanDrafts, searchQuery]);

  const selectedCount =
    cleanFolders.filter((f) => f.selected).length +
    cleanFolders.flatMap((f) => f.files.filter((fi) => fi.selected && !f.selected)).length +
    cleanDrafts.filter((d) => d.selected).length;

  const isEmpty = filteredFolders.length === 0 && filteredDrafts.length === 0;

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <LibraryModalOverlay label="Add from Vault" onClose={onClose} placement="right">
        <div
          className="flex h-full w-full max-w-[420px] flex-col overflow-hidden rounded-[24px] bg-white font-sans"
          style={{
            boxShadow:
              "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 24px 48px rgba(16,24,40,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-6 py-5">
            <div>
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                Add from Vault
              </h2>
              <p className="mb-0 mt-1 text-[13px] leading-relaxed text-dark-200">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#F7F8FB] hover:text-[#1a1a1a]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="shrink-0 px-6 pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search folders and documents…"
                className="lib-modal-search"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            {isEmpty ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF]">
                  <Folder className="h-4 w-4 text-[#4F5BD9]" />
                </div>
                <p className="m-0 text-[13px] font-medium text-[#1a1a1a]">
                  {searchQuery ? "No documents match your search." : "No documents in your vault yet."}
                </p>
                <p className="m-0 mt-1.5 text-[12px] text-dark-200">
                  {searchQuery
                    ? "Try a different search term."
                    : "Upload files to get started."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFolders.map((folder) => {
                  const visibleFiles = folder.files;
                  const someSelected = visibleFiles.some((fi) => fi.selected);
                  const allSelected =
                    visibleFiles.length > 0 && visibleFiles.every((fi) => fi.selected);
                  const isIndeterminate = someSelected && !allSelected;

                  return (
                    <div key={folder.id}>
                      <div className="flex items-center justify-between gap-2 rounded-[18px] bg-[#F7F8FB] px-3.5 py-3">
                        <button
                          type="button"
                          onClick={() => onToggleFolderSelection(folder.id)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-none bg-transparent p-0 text-left"
                        >
                          <Checkbox checked={allSelected} indeterminate={isIndeterminate} />
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                            <Folder className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </span>
                          <span
                            className="text-[13px] font-semibold leading-snug tracking-[-0.01em] text-[#1a1a1a]"
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {folder.name}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="score-badge bg-[#EEF2FF] text-[10px] font-semibold tabular-nums text-[#4F5BD9]">
                            {visibleFiles.length}
                          </span>
                          {visibleFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => onToggleFolderExpanded(folder.id, e)}
                              className="cursor-pointer rounded-full border-none bg-transparent p-1.5 hover:bg-white"
                            >
                              {folder.expanded ? (
                                <ChevronUp className="h-3.5 w-3.5 text-[#98A2B3]" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-[#98A2B3]" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {folder.expanded && visibleFiles.length > 0 && (
                        <div className="mt-1 space-y-0.5 pl-2">
                          {visibleFiles.map((file) => (
                            <button
                              key={file.id}
                              type="button"
                              onClick={(e) => onToggleFileSelection(folder.id, file.id, e)}
                              className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border-none px-3 py-2.5 text-left transition-colors ${
                                file.selected ? "bg-[#F7F8FB]" : "bg-transparent hover:bg-[#F7F8FB]"
                              }`}
                            >
                              <div className="pt-0.5">
                                <Checkbox checked={file.selected} size="sm" />
                              </div>
                              <FileText
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F5BD9]"
                                strokeWidth={1.75}
                              />
                              <span
                                className="min-w-0 flex-1 text-[13px] leading-snug"
                                style={{
                                  color: file.selected ? "#1a1a1a" : "#667085",
                                  fontWeight: file.selected ? 600 : 500,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {file.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredDrafts.length > 0 && (
                  <div className="pt-4">
                    <p className="m-0 mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                      Saved drafts
                    </p>
                    <div className="space-y-0.5">
                      {filteredDrafts.map((draft) => (
                        <button
                          key={draft.id}
                          type="button"
                          onClick={() => onToggleDraftSelection(draft.id)}
                          className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border-none px-3 py-2.5 text-left transition-colors ${
                            draft.selected ? "bg-[#F7F8FB]" : "hover:bg-[#F7F8FB]"
                          }`}
                        >
                          <div className="pt-0.5">
                            <Checkbox checked={draft.selected} size="sm" />
                          </div>
                          <FileCode
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F5BD9]"
                            strokeWidth={1.75}
                          />
                          <span
                            className="min-w-0 flex-1 text-[13px] leading-snug"
                            style={{
                              color: draft.selected ? "#1a1a1a" : "#667085",
                              fontWeight: draft.selected ? 600 : 500,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {draft.title}
                          </span>
                          <span className="score-badge mt-0.5 shrink-0 bg-badge-yellow text-[10px] font-medium text-badge-yellow-text">
                            Draft
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
            <span className="text-[13px] text-[#98A2B3]">
              {selectedCount} document{selectedCount === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              onClick={onClose}
              className="h-10 cursor-pointer rounded-full primary-gradient px-6 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      </LibraryModalOverlay>
    </>
  );
}
