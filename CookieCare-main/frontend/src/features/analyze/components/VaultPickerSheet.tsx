import { useState, useMemo, CSSProperties } from "react";
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

interface VaultPickerSheetProps {
  folders: CustomFolder[];
  savedDrafts: SavedDraft[];
  onToggleFolderSelection: (id: string) => void;
  onToggleFolderExpanded: (id: string, e: React.MouseEvent) => void;
  onToggleFileSelection: (folderId: string, fileId: string, e: React.MouseEvent) => void;
  onToggleDraftSelection: (id: string) => void;
  onClose: () => void;
}

const PANEL_STYLE: CSSProperties = {
  width: "min(100vw, 480px)",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#ffffff",
  borderLeft: "1px solid #ebebeb",
  boxShadow: "-8px 0 32px rgba(0,0,0,0.08)",
};

function Checkbox({
  checked,
  indeterminate,
  size = "md",
}: {
  checked: boolean;
  indeterminate?: boolean;
  size?: "md" | "sm";
}) {
  const dim = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <div
      className={`${dim} rounded flex items-center justify-center shrink-0 transition-colors`}
      style={{
        background: checked ? "#18181B" : indeterminate ? "#F4F4F5" : "#ffffff",
        border: `1.5px solid ${checked || indeterminate ? "#18181B" : "#D4D4D8"}`,
      }}
    >
      {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      {indeterminate && !checked && (
        <div className="w-2 h-0.5 rounded-full bg-[#18181B]" />
      )}
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
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex" style={{ maxWidth: "100%" }}>
        <div style={PANEL_STYLE} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-6 pt-6 pb-4 shrink-0 border-b border-[#F0F0F0]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#18181B] tracking-[-0.02em] m-0">
                  Add from Vault
                </h2>
                <p className="text-[13px] text-[#A1A1AA] mt-1 mb-0 leading-relaxed">
                  Browse and select documents for this analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors border-none bg-transparent cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search folders and documents…"
                className="w-full pl-10 pr-4 py-2.5 text-[13px] rounded-full border border-[#E4E4E7] bg-[#FAFAFA] text-[#18181B] placeholder:text-[#C4C4C4] outline-none transition-all focus:border-[#D4D4D8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(24,24,27,0.05)]"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
            {isEmpty ? (
              <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-[#E4E4E7] bg-[#FAFAFA]">
                <p className="text-[13px] text-[#A1A1AA] m-0 leading-relaxed">
                  {searchQuery
                    ? "No documents match your search."
                    : "No documents in your Vault yet. Upload files to get started."}
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
                      <div
                        className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl transition-colors"
                        style={{
                          background: allSelected ? "#FAFAFA" : "#F9F9F9",
                          border: `1px solid ${allSelected ? "#E4E4E7" : "#F0F0F0"}`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleFolderSelection(folder.id)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left border-none bg-transparent cursor-pointer p-0"
                        >
                          <Checkbox checked={allSelected} indeterminate={isIndeterminate} />
                          <Folder className="w-4 h-4 shrink-0 text-[#A1A1AA]" />
                          <span
                            className="text-[13px] font-medium text-[#18181B] leading-snug"
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {folder.name}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full tabular-nums bg-white text-[#A1A1AA] border border-[#F0F0F0]">
                            {visibleFiles.length}
                          </span>
                          {visibleFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => onToggleFolderExpanded(folder.id, e)}
                              className="p-1.5 rounded-lg hover:bg-white border-none bg-transparent cursor-pointer"
                            >
                              {folder.expanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-[#C4C4C4]" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-[#C4C4C4]" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {folder.expanded && visibleFiles.length > 0 && (
                        <div className="mt-1.5 ml-3 pl-3 border-l border-[#F0F0F0] space-y-0.5">
                          {visibleFiles.map((file) => (
                            <button
                              key={file.id}
                              type="button"
                              onClick={(e) => onToggleFileSelection(folder.id, file.id, e)}
                              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors text-left border-none cursor-pointer ${
                                file.selected ? "bg-[#FAFAFA]" : "bg-transparent hover:bg-[#FAFAFA]"
                              }`}
                            >
                              <div className="pt-0.5">
                                <Checkbox checked={file.selected} size="sm" />
                              </div>
                              <FileText className="w-3.5 h-3.5 shrink-0 text-[#C4C4C4] mt-0.5" />
                              <span
                                className="text-[13px] leading-snug flex-1 min-w-0"
                                style={{
                                  color: file.selected ? "#18181B" : "#52525B",
                                  fontWeight: file.selected ? 500 : 400,
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
                    <p className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider mb-2 px-1 m-0">
                      Saved drafts
                    </p>
                    <div className="space-y-0.5">
                      {filteredDrafts.map((draft) => (
                        <button
                          key={draft.id}
                          type="button"
                          onClick={() => onToggleDraftSelection(draft.id)}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors text-left border-none cursor-pointer ${
                            draft.selected ? "bg-[#FAFAFA]" : "hover:bg-[#FAFAFA]"
                          }`}
                        >
                          <div className="pt-0.5">
                            <Checkbox checked={draft.selected} size="sm" />
                          </div>
                          <FileCode className="w-3.5 h-3.5 shrink-0 text-[#C4C4C4] mt-0.5" />
                          <span
                            className="text-[13px] leading-snug flex-1 min-w-0"
                            style={{
                              color: draft.selected ? "#18181B" : "#52525B",
                              fontWeight: draft.selected ? 500 : 400,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {draft.title}
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-[#F4F4F5] text-[#A1A1AA] mt-0.5">
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

          {/* Footer */}
          <div className="px-6 py-4 shrink-0 flex items-center justify-between gap-3 border-t border-[#F0F0F0] bg-[#FAFAFA]/80">
            <span className="text-[13px] text-[#A1A1AA]">
              {selectedCount} document{selectedCount === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-6 rounded-full text-[13px] font-semibold text-white bg-[#18181B] hover:bg-[#262626] transition-colors border-none cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
