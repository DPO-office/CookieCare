import React from "react";
import { FolderPlus, Upload, CheckCircle, Loader2, XCircle, FileText, FolderOpen, AlertCircle } from "lucide-react";
import { SidePanelType, CustomFolder, PendingUpload } from "../types";
import { ACCEPTED_UPLOAD_ACCEPT_STRING } from "../constants";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const statusIcon = (status: PendingUpload["status"]) => {
  switch (status) {
    case "done":
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case "error":
      return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case "uploading":
    case "processing":
      return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  }
};

interface SideDrawerProps {
  sidePanelType: SidePanelType;
  folders: CustomFolder[];
  newFolderName: string;
  uploadSelectedFolder: string;
  isDraggingFile: boolean;
  isUploading: boolean;
  pendingFiles: PendingUpload[];
  batchError: string;
  uploadProgress: { done: number; total: number };
  onClose: () => void;
  onSetNewFolderName: (v: string) => void;
  onSetUploadSelectedFolder: (v: string) => void;
  onAddNewFolder: (e: React.FormEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileBrowseChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFolderBrowseChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onUploadSubmit: (e: React.FormEvent) => void;
}

export default function SideDrawer({
  sidePanelType,
  folders,
  newFolderName,
  uploadSelectedFolder,
  isDraggingFile,
  isUploading,
  pendingFiles,
  batchError,
  uploadProgress,
  onClose,
  onSetNewFolderName,
  onSetUploadSelectedFolder,
  onAddNewFolder,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileBrowseChange,
  onFolderBrowseChange,
  onRemoveFile,
  onClearFiles,
  onUploadSubmit,
}: SideDrawerProps) {
  const fileCount = pendingFiles.length;
  const canSubmit = fileCount > 0 && !isUploading;
  const hasErrors = pendingFiles.some((p) => p.status === "error");

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        onClick={isUploading ? undefined : onClose}
        style={isUploading ? { cursor: "not-allowed" } : undefined}
      />
      <div className="absolute inset-y-0 right-0 max-w-full flex">
        <div className="w-[400px] bg-white shadow-xl flex flex-col h-full rounded-l-2xl overflow-hidden border-l border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <div>
              <h4 className="text-[13px] font-semibold text-gray-900">
                {sidePanelType === "folder" ? "New Folder" : "Upload Documents"}
              </h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {sidePanelType === "folder"
                  ? "Create a new folder in your workspace"
                  : "Upload one or more documents, or an entire folder"}
              </p>
            </div>
            <button
              onClick={isUploading ? undefined : onClose}
              disabled={isUploading}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all text-lg leading-none shrink-0 disabled:opacity-30"
            >
              ·
            </button>
          </div>

          {sidePanelType === "folder" ? (
            <form onSubmit={onAddNewFolder} className="flex-1 flex flex-col justify-between p-6">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600 block">Folder name</label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => onSetNewFolderName(e.target.value)}
                  placeholder="e.g. Q3 Vendor Agreements"
                  className="w-full text-[13px] border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-xl placeholder:text-gray-400 transition-shadow"
                />
              </div>
              <button
                type="submit"
                className="w-full hover:opacity-90 text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.15)] mt-6"
                style={{ background: "#2175D9" }}
              >
                <FolderPlus className="w-3.5 h-3.5 text-gray-300" />
                <span>Create Folder</span>
              </button>
            </form>
          ) : (
            <form onSubmit={onUploadSubmit} className="flex-1 flex flex-col justify-between p-6 overflow-hidden">
              <div className="space-y-4 flex-1 min-h-0 flex flex-col">
                {/* Target folder selector */}
                <div className="space-y-1.5 shrink-0">
                  <label className="text-xs font-medium text-gray-600 block">Target folder</label>
                  <select
                    value={uploadSelectedFolder}
                    onChange={(e) => onSetUploadSelectedFolder(e.target.value)}
                    disabled={isUploading}
                    className="w-full text-[13px] border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 rounded-xl cursor-pointer appearance-none disabled:opacity-50"
                  >
                    <option value="">Uploaded Documents (default)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Drop zone */}
                <div className="space-y-1.5 shrink-0">
                  <label className="text-xs font-medium text-gray-600 block">Files</label>
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`border-2 border-dashed rounded-xl p-6 text-center select-none transition-all flex flex-col items-center justify-center ${
                      isDraggingFile
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-gray-200 bg-gray-50/60 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <Upload className={`w-5 h-5 mb-2 ${isDraggingFile ? "text-emerald-500" : "text-gray-400"}`} />
                    <p className="text-[13px] font-medium text-gray-600">Drop files or a folder here</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">PDF, DOCX, DOC, TXT, MD, CSV, JSON — max 25 MB each</p>
                    <div className="flex items-center gap-2 mt-3">
                      <label className="inline-flex items-center text-[12px] font-medium text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer gap-1.5">
                        <FileText className="w-3 h-3 text-gray-400" />
                        <span>Browse files</span>
                        <input
                          type="file"
                          accept={ACCEPTED_UPLOAD_ACCEPT_STRING}
                          multiple
                          onChange={onFileBrowseChange}
                          className="hidden"
                        />
                      </label>
                      <label className="inline-flex items-center text-[12px] font-medium text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer gap-1.5">
                        <FolderOpen className="w-3 h-3 text-gray-400" />
                        <span>Upload folder</span>
                        <input
                          type="file"
                          {...({ webkitdirectory: "", directory: "" } as any)}
                          onChange={onFolderBrowseChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Batch error */}
                {batchError && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-amber-700">{batchError}</span>
                  </div>
                )}

                {/* File list */}
                {fileCount > 0 && (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5 shrink-0">
                      <span className="text-[11px] font-medium text-gray-500">
                        {fileCount} file{fileCount !== 1 ? "s" : ""} selected
                      </span>
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={onClearFiles}
                          className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                      {pendingFiles.map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] ${
                            p.status === "error"
                              ? "border-red-200 bg-red-50"
                              : p.status === "done"
                              ? "border-emerald-200 bg-emerald-50"
                              : p.status === "uploading" || p.status === "processing"
                              ? "border-blue-200 bg-blue-50"
                              : "border-gray-100 bg-white"
                          }`}
                        >
                          {statusIcon(p.status)}
                          <span className="truncate flex-1 font-medium text-gray-700">{p.file.name}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(p.file.size)}</span>
                          {!isUploading && p.status !== "done" && (
                            <button
                              type="button"
                              onClick={() => onRemoveFile(p.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {p.status === "error" && p.error && (
                            <span className="text-[10px] text-red-500 shrink-0 max-w-[100px] truncate" title={p.error}>
                              {p.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Progress footer + submit */}
              <div className="shrink-0 mt-4 space-y-2">
                {isUploading && (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span>
                      Processed {uploadProgress.done} of {uploadProgress.total} file{uploadProgress.total !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full hover:opacity-90 text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.15)] disabled:opacity-30"
                  style={{ background: "#2175D9" }}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-gray-300" />
                      <span>
                        {fileCount === 0
                          ? "Upload Documents"
                          : hasErrors
                          ? `Retry ${pendingFiles.filter((p) => p.status === "error").length} failed`
                          : `Upload ${fileCount} file${fileCount !== 1 ? "s" : ""}`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
