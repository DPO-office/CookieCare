import React from "react";
import { Folder, ChevronDown, ChevronUp, FileText, FileCode, Plus, FolderPlus } from "lucide-react";
import { CustomFolder, SavedDraft } from "../types";

interface DocumentSelectorProps {
  folders: CustomFolder[];
  savedDrafts: SavedDraft[];
  searchQuery: string;
  savedDraftsExpanded: boolean;
  onSearchChange: (q: string) => void;
  onToggleSavedDraftsExpanded: () => void;
  onToggleFolderSelection: (id: string) => void;
  onToggleFolderExpanded: (id: string, e: React.MouseEvent) => void;
  onToggleFileSelection: (folderId: string, fileId: string, e: React.MouseEvent) => void;
  onToggleDraftSelection: (id: string) => void;
  onOpenUpload: () => void;
  onOpenNewFolder: () => void;
}

export default function DocumentSelector({
  folders,
  savedDrafts,
  searchQuery,
  savedDraftsExpanded,
  onSearchChange,
  onToggleSavedDraftsExpanded,
  onToggleFolderSelection,
  onToggleFolderExpanded,
  onToggleFileSelection,
  onToggleDraftSelection,
  onOpenUpload,
  onOpenNewFolder,
}: DocumentSelectorProps) {
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
      <div className="mb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">1</span>
          <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Select document folders</h3>
        </div>
        <p className="text-xs text-gray-400 ml-7 leading-relaxed">Choose the folders to load into the analysis context</p>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        <input
          type="text"
          placeholder="Search folders..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 max-w-sm text-sm border border-gray-200 bg-gray-50/80 px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-lg placeholder:text-gray-400 transition-shadow"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenUpload}
            className="bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-gray-400" />
            <span>Upload</span>
          </button>
          <button
            onClick={onOpenNewFolder}
            className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5 text-gray-300" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-0.5">
        {filteredFolders.length === 0 ? (
          <div className="col-span-2 text-center py-10 bg-gray-50 rounded-xl text-sm text-gray-400 border border-dashed border-gray-200">
            No folders found. Create one to get started.
          </div>
        ) : (
          filteredFolders.map((folder) => {
            const someSelected = folder.files.some((fi) => fi.selected);
            const allSelected = folder.files.length > 0 && folder.files.every((fi) => fi.selected);
            const isIndeterminate = someSelected && !allSelected;
            return (
              <div key={folder.id} className="flex flex-col">
                <div
                  onClick={() => onToggleFolderSelection(folder.id)}
                  className={`flex items-center justify-between px-3.5 py-2.5 border rounded-xl transition-all cursor-pointer select-none ${
                    allSelected
                      ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
                      : isIndeterminate
                      ? "border-gray-300 bg-gray-50/60"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = isIndeterminate; }}
                      readOnly
                      className="rounded cursor-pointer accent-gray-900 h-3.5 w-3.5 shrink-0"
                    />
                    <Folder className={`w-4 h-4 shrink-0 ${allSelected || isIndeterminate ? "text-gray-700" : "text-gray-400"}`} />
                    <span className={`text-[13px] text-gray-800 truncate ${allSelected ? "font-semibold" : isIndeterminate ? "font-medium" : "font-normal"}`}>
                      {folder.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium tabular-nums">{folder.filesCount}</span>
                    <button onClick={(e) => onToggleFolderExpanded(folder.id, e)} className="p-1 hover:bg-gray-100 rounded-lg">
                      {folder.expanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                    </button>
                  </div>
                </div>

                {folder.expanded && folder.files.length > 0 && (
                  <div className="border-l border-r border-b border-gray-200 rounded-b-xl bg-white overflow-hidden">
                    {folder.files.map((file) => (
                      <div
                        key={file.id}
                        onClick={(e) => onToggleFileSelection(folder.id, file.id, e)}
                        className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer select-none transition-colors border-b last:border-b-0 border-gray-50 ${file.selected ? "bg-gray-50" : "hover:bg-gray-50/80"}`}
                      >
                        <input type="checkbox" checked={file.selected} readOnly className="rounded cursor-pointer accent-black h-3 w-3 shrink-0" />
                        <FileText className={`w-3.5 h-3.5 shrink-0 ${file.selected ? "text-gray-600" : "text-gray-300"}`} />
                        <span className={`text-[12px] truncate ${file.selected ? "text-gray-800 font-medium" : "text-gray-500"}`}>{file.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {folder.expanded && folder.files.length === 0 && (
                  <div className="border-l border-r border-b border-gray-200 rounded-b-xl bg-white px-4 py-3 text-xs text-gray-400">
                    No files in this folder.
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {savedDrafts.length > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[13px] font-medium text-gray-600">Saved Drafts</span>
              <span className="text-[11px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full tabular-nums">
                {savedDrafts.filter((d) => d.selected).length}/{savedDrafts.length}
              </span>
            </div>
            <button onClick={onToggleSavedDraftsExpanded} className="p-1 hover:bg-gray-100 rounded-lg">
              {savedDraftsExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          </div>
          {savedDraftsExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {savedDrafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => onToggleDraftSelection(draft.id)}
                  className={`flex items-center justify-between px-3.5 py-2.5 border rounded-xl transition-all cursor-pointer select-none ${
                    draft.selected
                      ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input type="checkbox" checked={draft.selected} readOnly className="rounded cursor-pointer accent-gray-900 h-3.5 w-3.5 shrink-0" />
                    <FileCode className={`w-4 h-4 shrink-0 ${draft.selected ? "text-gray-700" : "text-gray-400"}`} />
                    <span className={`text-[13px] truncate ${draft.selected ? "text-gray-800 font-medium" : "text-gray-600"}`}>{draft.title}</span>
                  </div>
                  <span className="text-[11px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium ml-2 shrink-0">Draft</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
