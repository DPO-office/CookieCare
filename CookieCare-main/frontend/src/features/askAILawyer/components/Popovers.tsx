import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload, Folder, Gavel, FileCode, FileText,
  Plus, Trash2, Check, ChevronDown, X, Globe,
} from "lucide-react";
import { KBFolder, OutputFormat, PopoverType } from "../types";

interface PopoversProps {
  openPopover: PopoverType;
  popoverRef: React.RefObject<HTMLDivElement | null>;

  /* jurisdictions */
  availableJurisdictions: any[];
  selectedJurisdictions: string[];
  toggleJurisdiction: (label: string) => void;
  setSelectedJurisdictions: (v: string[]) => void;

  /* format */
  selectedFormat: OutputFormat;
  setSelectedFormat: (f: OutputFormat) => void;

  /* kb */
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
  { fmt: "Brief Summary", desc: "Concise overview with key findings and practical recommendations." },
  { fmt: "Full IRAC", desc: "Issue · Rule · Application · Conclusion — standard legal analysis." },
  { fmt: "CREAC", desc: "Conclusion · Rule · Explanation · Application · Conclusion." },
];

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
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full mb-3 left-0 z-50 w-full max-w-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div ref={popoverRef} className="w-full">
          {/* ADD menu */}
          {openPopover === "add" && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-700">Add context to your query</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Attach documents, URLs, or set preferences</p>
              </div>
              <div className="p-2">
                {[
                  {
                    icon: Upload, label: "Upload Document",
                    desc: "PDF, DOCX, TXT, CSV, images",
                    action: () => { setActiveFolderForUpload(""); setOpenPopover(null); fileUploadRef.current?.click(); },
                  },
                  {
                    icon: Folder, label: "Knowledge Base",
                    desc: selectedKBCount > 0 ? `${selectedKBCount} docs active` : "Select document folders",
                    action: () => setOpenPopover("kb"),
                  },
                  {
                    icon: Gavel, label: "Jurisdictions",
                    desc: selectedJurisdictions.length > 0 ? selectedJurisdictions.slice(0, 2).join(", ") : "None selected",
                    action: () => setOpenPopover("jurisdictions"),
                  },
                  {
                    icon: FileCode, label: "Output Format",
                    desc: selectedFormat,
                    action: () => setOpenPopover("format"),
                  },
                ].map((item) => (
                  <button key={item.label} type="button" onClick={item.action}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left cursor-pointer group">
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-900 transition-colors">
                      <item.icon className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                      <p className="text-[11px] text-gray-400 truncate">{item.desc}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-300 -rotate-90 ml-auto shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* JURISDICTIONS */}
          {openPopover === "jurisdictions" && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Select Jurisdictions</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{selectedJurisdictions.length} selected</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenPopover(null); }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                  {/* <X className="w-3.5 h-3.5" /> */}
                </button>
              </div>
              <div className="p-3 max-h-64 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {availableJurisdictions.map((jc) => {
                    const sel = selectedJurisdictions.includes(jc.label);
                    return (
                      <button key={jc.key} type="button" onClick={() => toggleJurisdiction(jc.label)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                          sel ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-100"
                        }`}>
                        {sel && <Check className="w-2.5 h-2.5 shrink-0" />}
                        {jc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedJurisdictions.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">{selectedJurisdictions.length} selected</span>
                  <button type="button" onClick={() => setSelectedJurisdictions([])}
                    className="text-[11px] text-red-500 hover:text-red-600 font-medium cursor-pointer">
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}

          {/* KNOWLEDGE BASE */}
          {openPopover === "kb" && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Knowledge Base</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {selectedKBCount} docs active across {selectedFolderCount} folders
                  </p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenPopover(null); }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                  {/* <X className="w-3.5 h-3.5" /> */}
                </button>
              </div>
              <div className="p-3 space-y-2">
                {/* <form onSubmit={handleAddFolder} className="flex gap-1.5">
                  <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Create new folder…"
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition placeholder:text-gray-400" />
                  <button type="submit"
                    className="w-7 h-7 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition shrink-0 cursor-pointer">
                    <Plus className="w-3 h-3" />
                  </button>
                </form> */}
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                  {folders.length === 0 ? (
                    <p className="text-[11px] text-gray-400 text-center py-4 italic">No folders yet. Create one above.</p>
                  ) : folders.map((f) => (
                    <div key={f.id} className={`rounded-xl border transition-all ${f.isSelected ? "border-gray-300 bg-white shadow-xs" : "border-gray-100 bg-gray-50"}`}>
                      <div onClick={() => toggleFolderSelection(f.id)}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${f.isSelected ? "bg-gray-900 border-gray-900" : "bg-white border-gray-300"}`}>
                            {f.isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <Folder className={`w-3.5 h-3.5 shrink-0 ${f.isSelected ? "text-gray-700" : "text-gray-300"}`} />
                          <span className={`text-xs truncate ${f.isSelected ? "text-gray-900 font-medium" : "text-gray-400"}`}>{f.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{f.files.length}</span>
                          <button type="button"
                            onClick={(e) => { setActiveFolderForUpload(f.id); e.stopPropagation(); fileUploadRef.current?.click(); }}
                            className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-600 transition cursor-pointer" title="Upload to this folder">
                            <Upload className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={(e) => handleDeleteFolder(f.id, e)}
                            className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 transition cursor-pointer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {f.isSelected && f.files.length > 0 && (
                        <div className="px-3 pb-2 pt-0.5 border-t border-gray-50 space-y-0.5">
                          {f.files.slice(0, 3).map((file, fi) => (
                            <div key={fi} className="flex items-center gap-1.5">
                              <FileText className="w-2.5 h-2.5 text-gray-300 shrink-0" />
                              <span className="text-[10px] text-gray-500 truncate">{file.name}</span>
                            </div>
                          ))}
                          {f.files.length > 3 && <p className="text-[10px] text-gray-400">+{f.files.length - 3} more</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => { setActiveFolderForUpload(""); setOpenPopover(null); fileUploadRef.current?.click(); }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-xl py-2 transition cursor-pointer">
                  <Upload className="w-3 h-3" /> Upload document
                </button>
              </div>
            </div>
          )}

          {/* WEB DISCOVERY */}
          {openPopover === "web" && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Web Discovery</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">External sources to reference during research</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenPopover(null); }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-2">
                <form onSubmit={handleAddWebUrl} className="flex gap-1.5">
                  <input type="url" value={webDiscoveryUrlInput} onChange={(e) => setWebDiscoveryUrlInput(e.target.value)}
                    placeholder="https://gazette.gov…"
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition placeholder:text-gray-400" />
                  <button type="submit"
                    className="w-7 h-7 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition shrink-0 cursor-pointer">
                    <Plus className="w-3 h-3" />
                  </button>
                </form>
                {webDiscoveryUrls.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic text-center py-3">No URLs added — will use standard legal index.</p>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {webDiscoveryUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-xl bg-gray-50">
                        <Globe className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="text-[11px] text-gray-600 truncate flex-1">{url}</span>
                        <button type="button" onClick={() => removeWebUrl(url)}
                          className="text-gray-300 hover:text-red-500 transition shrink-0 cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OUTPUT FORMAT */}
          {openPopover === "format" && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-800">Output Format</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenPopover(null); }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                  {/* <X className="w-3.5 h-3.5" /> */}
                </button>
              </div>
              <div className="p-3 space-y-1.5">
                {FORMAT_OPTIONS.map(({ fmt, desc }) => (
                  <button key={fmt} type="button"
                    onClick={() => { setSelectedFormat(fmt); setOpenPopover(null); }}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all text-left cursor-pointer ${
                      selectedFormat === fmt
                        ? "bg-gray-900 border-gray-900 text-white"
                        : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      selectedFormat === fmt ? "border-white" : "border-gray-300"
                    }`}>
                      {selectedFormat === fmt && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${selectedFormat === fmt ? "text-white" : "text-gray-800"}`}>{fmt}</p>
                      <p className={`text-[11px] mt-0.5 leading-relaxed ${selectedFormat === fmt ? "text-gray-300" : "text-gray-400"}`}>{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
