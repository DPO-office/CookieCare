import React from "react";
import { X, Folder, Upload, AlertCircle, FileText, Trash2 } from "lucide-react";
import { LibraryItem } from "../types";

interface FolderDetailViewProps {
  folder: LibraryItem;
  onClose: () => void;
  onAddFiles: (folderId: string) => void;
  onDeleteFile: (folderId: string, fileId: string) => void;
  onDeleteFolder: (id: string, e: React.MouseEvent) => void;
}

export function FolderDetailView({
  folder,
  onClose,
  onAddFiles,
  onDeleteFile,
  onDeleteFolder,
}: FolderDetailViewProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-2xl bg-white border border-gray-100 shadow-2xl rounded-2xl relative overflow-hidden">
        {/* Top accent */}
        <div className="h-1 w-full" style={{ background: "var(--brand-primary)" }} />

        <div className="p-6">
          <button
            onClick={onClose}
            className="absolute right-4 top-5 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="mb-5 pb-4 border-b border-gray-100 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-lg text-gray-900 truncate tracking-tight">{folder.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                {folder.id} · By {folder.createdBy}
              </p>
            </div>
            <button
              onClick={() => onAddFiles(folder.id)}
              className="inline-flex items-center gap-2 text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition shrink-0 cursor-pointer shadow-sm hover:opacity-90"
              style={{ background: "var(--brand-primary)" }}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Add files</span>
            </button>
          </div>

          {/* File list */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Files <span className="text-gray-600 font-bold">({folder.fileList?.length || 0})</span>
            </p>
          </div>

          {!folder.fileList || folder.fileList.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center bg-gray-50">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No files yet</p>
              <p className="text-xs text-gray-400 mt-1">Use the button above to upload files.</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-100 p-2.5 rounded-2xl bg-gray-50">
              {folder.fileList.map((file, idx) => (
                <div
                  key={file.id ?? idx}
                  className="bg-white border border-gray-200 rounded-xl p-3 flex justify-between items-center hover:border-gray-300 hover:shadow-sm transition text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-gray-900 font-semibold truncate tracking-tight">{file.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                        {file.size} · {file.type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
                      Synced
                    </span>
                    <button
                      onClick={() => {
                        if (file.id) onDeleteFile(folder.id, file.id);
                      }}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center pt-5 border-t border-gray-100 mt-5">
            <button
              onClick={(e) => {
                onDeleteFolder(folder.id, e);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete folder
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 rounded-xl text-sm font-semibold transition cursor-pointer text-gray-700 shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
