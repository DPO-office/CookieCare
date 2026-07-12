import React from "react";
import { FolderPlus, Upload, CheckCircle, Loader2 } from "lucide-react";
import { SidePanelType, CustomFolder } from "../types";

interface SideDrawerProps {
  sidePanelType: SidePanelType;
  folders: CustomFolder[];
  newFolderName: string;
  uploadSelectedFolder: string;
  isDraggingFile: boolean;
  isUploading: boolean;
  uploadedFileName: string;
  onClose: () => void;
  onSetNewFolderName: (v: string) => void;
  onSetUploadSelectedFolder: (v: string) => void;
  onAddNewFolder: (e: React.FormEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileBrowseChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadSubmit: (e: React.FormEvent) => void;
}

export default function SideDrawer({
  sidePanelType,
  folders,
  newFolderName,
  uploadSelectedFolder,
  isDraggingFile,
  isUploading,
  uploadedFileName,
  onClose,
  onSetNewFolderName,
  onSetUploadSelectedFolder,
  onAddNewFolder,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileBrowseChange,
  onUploadSubmit,
}: SideDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 max-w-full flex">
        <div className="w-[380px] bg-white shadow-xl flex flex-col h-full rounded-l-2xl overflow-hidden border-l border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <div>
              <h4 className="text-[13px] font-semibold text-gray-900">
                {sidePanelType === "folder" ? "New Folder" : "Upload File"}
              </h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {sidePanelType === "folder" ? "Create a new folder in your workspace" : "Attach a document to a folder"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all text-lg leading-none shrink-0"
            >
              ×
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
                className="w-full bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.15)] mt-6"
              >
                <FolderPlus className="w-3.5 h-3.5 text-gray-300" />
                <span>Create Folder</span>
              </button>
            </form>
          ) : (
            <form onSubmit={onUploadSubmit} className="flex-1 flex flex-col justify-between p-6">
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 block">Target folder</label>
                  <select
                    value={uploadSelectedFolder}
                    onChange={(e) => onSetUploadSelectedFolder(e.target.value)}
                    className="w-full text-[13px] border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 rounded-xl cursor-pointer appearance-none"
                  >
                    <option value="">Uploaded Documents (default)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 block">File</label>
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`border-2 border-dashed rounded-xl p-8 text-center select-none transition-all flex flex-col items-center justify-center cursor-pointer ${
                      isDraggingFile ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-gray-50/60 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <Upload className={`w-5 h-5 mb-2.5 ${isDraggingFile ? "text-emerald-500" : "text-gray-400"}`} />
                    <p className="text-[13px] font-medium text-gray-600">Drop file here</p>
                    <p className="text-[11px] text-gray-400 mt-1">PDF, DOCX, TXT, CSV</p>
                    <label className="inline-flex items-center mt-4 text-[12px] font-medium text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer">
                      <span>Browse files</span>
                      <input type="file" accept=".txt,.md,.json,.pdf,.docx,.csv" onChange={onFileBrowseChange} className="hidden" />
                    </label>
                  </div>
                  {uploadedFileName && (
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-emerald-200 bg-emerald-50 rounded-xl">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-[12px] font-medium text-emerald-700 truncate flex-1">{uploadedFileName}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!uploadedFileName || isUploading}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.15)] disabled:opacity-30 mt-6"
              >
                {isUploading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" /><span>Uploading...</span></>
                ) : (
                  <><Upload className="w-3.5 h-3.5 text-gray-300" /><span>Upload File</span></>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
