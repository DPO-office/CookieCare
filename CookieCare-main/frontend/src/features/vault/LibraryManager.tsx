import React, { useState } from "react";
import {
  Folder, Search, Plus, Trash2, HelpCircle, ChevronRight,
  ChevronLeft, ChevronsLeft, ChevronsRight, Globe, FileText,
  Sparkles, BookOpen, Sliders, Check, Copy, Upload, X,
  FileCode, Info, FilePen, ExternalLink,
} from "lucide-react";
import { LegalDocument } from "../../shared/types";
import { LibraryItem, LibraryTabId } from "./types";
import { TABS_CONFIG } from "./constants";
import { fmtDate } from "./utils";
import { useLibrary } from "./hooks/useLibrary";

interface LibraryProps {
  documents: LegalDocument[];
  authToken: string;
  onRefresh: () => void;
  onOpenInDraftEditor?: (doc: LegalDocument) => void;
}

export default function LibraryManager({ documents, authToken, onRefresh, onOpenInDraftEditor }: LibraryProps) {
  const [activeTab, setActiveTab] = useState<LibraryTabId>("files");
  const [searchQuery, setSearchQuery] = useState("");
  const [savedDraftsSearch, setSavedDraftsSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [sortField, setSortField] = useState<keyof LibraryItem>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<LibraryItem | null>(null);
  const [viewDetailItem, setViewDetailItem] = useState<LibraryItem | null>(null);
  const [isAddFileOpen, setIsAddFileOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formFolderTarget, setFormFolderTarget] = useState("");

  const {
    items, savedDrafts, copiedId, uploadProgress,
    uploadStatus, uploadError, setUploadStatus,
    fetchLibraryData, handleCopyId, handleDeleteItem, handleDeleteDraft,
    handleCreateNewItem, handleTriggerUpload, handleDeleteFileFromFolder,
  } = useLibrary(authToken, onRefresh);

  const activeTabInfo = TABS_CONFIG.find((t) => t.id === activeTab) || TABS_CONFIG[0];

  const filteredTabItems = items.filter((item) => {
    if (item.type !== activeTab) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) ||
      item.tags.toLowerCase().includes(q) || item.createdBy.toLowerCase().includes(q);
  });

  const sortedItems = [...filteredTabItems].sort((a, b) => {
    let fa: any = a[sortField] ?? "";
    let fb: any = b[sortField] ?? "";
    if (typeof fa === "string") fa = fa.toLowerCase();
    if (typeof fb === "string") fb = fb.toLowerCase();
    if (fa < fb) return sortDirection === "asc" ? -1 : 1;
    if (fa > fb) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: keyof LibraryItem) => {
    if (sortField === field) setSortDirection((prev) => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection("asc"); }
  };

  const indexOfLast    = currentPage * recordsPerPage;
  const indexOfFirst   = indexOfLast - recordsPerPage;
  const currentRecords = sortedItems.slice(indexOfFirst, indexOfLast);
  const totalPages     = Math.max(1, Math.ceil(sortedItems.length / recordsPerPage));

  const filteredDrafts = savedDrafts.filter((d) => {
    if (!savedDraftsSearch.trim()) return true;
    return (d.title || "").toLowerCase().includes(savedDraftsSearch.toLowerCase());
  });

  const onCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await handleCreateNewItem(activeTab, formName, formDescription, formTags, formDetails);
    if (ok) { setFormName(""); setFormDescription(""); setFormTags(""); setFormDetails(""); setIsCreateOpen(false); }
  };

  const onDeleteItem = (id: string, e: React.MouseEvent) => handleDeleteItem(id, activeTab, e);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F8FA] overflow-hidden font-sans">
      <div className="flex-1 flex flex-col overflow-y-auto px-8 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className="hover:text-gray-900 cursor-pointer">Vault Repository</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="font-semibold text-gray-900">{activeTabInfo.label}</span>
          </div>
          <button onClick={() => alert("Personalization Dashboard Help Docs & System Prompt Specifications.")}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white px-3 py-1.5 rounded-xl hover:bg-gray-50 transition">
            <HelpCircle className="w-3.5 h-3.5" /><span>Help</span>
          </button>
        </div>

        {/* Title card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">{activeTabInfo.label}</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl leading-relaxed">{activeTabInfo.desc}.</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab === "files" && (
              <button onClick={() => { setFormFolderTarget(items.filter((i) => i.type === "files")[0]?.id || ""); setIsAddFileOpen(true); }}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 px-4 py-2 rounded-xl transition shadow-sm cursor-pointer">
                <Upload className="w-3.5 h-3.5" /><span>Add files</span>
              </button>
            )}
            {activeTab !== "saved-drafts" && (
              <button onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm cursor-pointer">
                <Plus className="w-3.5 h-3.5" /><span>{activeTabInfo.buttonWord}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-gray-200 mb-5 overflow-x-auto scrollbar-none">
          {TABS_CONFIG.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = tab.id === "saved-drafts" ? savedDrafts.length : items.filter((i) => i.type === tab.id).length;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearchQuery(""); setCurrentPage(1); }}
                className={`px-4 py-2.5 text-sm font-medium cursor-pointer transition-all border-b-2 shrink-0 flex items-center gap-2
                  ${isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-xs ${isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="bg-white border border-gray-200 border-b-0 rounded-t-2xl px-5 py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <span className="text-sm font-medium text-gray-700">All {activeTabInfo.label}</span>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input type="text"
              value={activeTab === "saved-drafts" ? savedDraftsSearch : searchQuery}
              onChange={(e) => { activeTab === "saved-drafts" ? setSavedDraftsSearch(e.target.value) : (setSearchQuery(e.target.value), setCurrentPage(1)); }}
              placeholder={activeTabInfo.placeholder}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition placeholder:text-gray-400" />
          </div>
        </div>

        {/* Saved Drafts table */}
        {activeTab === "saved-drafts" ? (
          <div className="bg-white border border-gray-200 rounded-b-2xl overflow-hidden shadow-sm flex-1 flex flex-col">
            {filteredDrafts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50 min-h-[300px]">
                <Info className="w-8 h-8 text-gray-200 mb-3" />
                <h4 className="text-sm font-semibold text-gray-700">No saved drafts found</h4>
                <p className="text-sm text-gray-400 mt-1 max-w-sm leading-relaxed">Drafts saved from the Draft Templates module will automatically appear here.</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-2/5">Draft Name</th>
                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide w-40">Last Updated</th>
                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide w-40">Created</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                      {filteredDrafts.map((draft) => (
                        <tr key={draft.id} className="hover:bg-gray-50 transition group">
                          <td className="px-6 py-3.5 font-medium text-gray-900">
                            <div className="flex items-center gap-3"><FilePen className="w-4 h-4 text-gray-400 shrink-0" /><span className="truncate max-w-[280px]">{draft.title}</span></div>
                          </td>
                          <td className="px-5 py-3.5 text-center text-gray-400 text-xs font-mono">{fmtDate(draft.updated_at)}</td>
                          <td className="px-5 py-3.5 text-center text-gray-400 text-xs font-mono">{fmtDate(draft.created_at)}</td>
                          <td className="px-6 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-40 group-hover:opacity-100 transition">
                              {onOpenInDraftEditor && (
                                <button onClick={() => onOpenInDraftEditor(draft as LegalDocument)} className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition">
                                  <ExternalLink className="w-3 h-3" /><span>Open</span>
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(draft.id); }}
                                className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-gray-400 hover:text-gray-700 cursor-pointer transition">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => handleDeleteDraft(draft.id, e)}
                                className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white hover:border-red-200 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500 cursor-pointer transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-400">
                  Showing {filteredDrafts.length} {filteredDrafts.length === 1 ? "entry" : "entries"}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Regular items table */
          <div className="bg-white border border-gray-200 rounded-b-2xl overflow-hidden shadow-sm flex-1 flex flex-col">
            {sortedItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50 min-h-[300px]">
                <Info className="w-8 h-8 text-gray-200 mb-3" />
                <h4 className="text-sm font-semibold text-gray-700">No records found</h4>
                <p className="text-sm text-gray-400 mt-1 max-w-sm leading-relaxed">Create your first {activeTabInfo.label.toLowerCase()} using the button above.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th onClick={() => toggleSort("name")} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-1/4"><div className="flex items-center gap-1">Name <Sliders className="w-2.5 h-2.5 rotate-90 opacity-60" /></div></th>
                      <th onClick={() => toggleSort("description")} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-1/3"><div className="flex items-center gap-1">Description <Sliders className="w-2.5 h-2.5 rotate-90 opacity-60" /></div></th>
                      <th onClick={() => toggleSort("tags")} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-24">Tags</th>
                      <th onClick={() => toggleSort("itemsCount")} className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-20">Items</th>
                      <th onClick={() => toggleSort("dateModified")} className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-28">Modified</th>
                      <th onClick={() => toggleSort("createdBy")} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-28">Created by</th>
                      <th className="px-5 py-3 w-16 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                    {currentRecords.map((item) => (
                      <tr key={item.id} onClick={() => item.type === "files" ? setSelectedFolder(item) : setViewDetailItem(item)} className="hover:bg-gray-50 transition cursor-pointer group">
                        <td className="px-5 py-3.5 font-medium text-gray-900">
                          <div className="flex items-center gap-3">
                            {item.type === "files" ? <Folder className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition shrink-0" />
                              : item.type === "prompts" ? <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                              : item.type === "questions" ? <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                              : item.type === "websites" ? <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                              : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                            <span className="truncate max-w-[200px]">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-sm leading-relaxed max-w-[300px] truncate">{item.description}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${item.tags === "-" ? "text-gray-400 bg-gray-50" : "text-blue-700 bg-blue-50 border border-blue-100"}`}>{item.tags}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-gray-500 text-sm">{item.type === "files" ? item.fileList?.length : item.itemsCount}</td>
                        <td className="px-5 py-3.5 text-center text-gray-400 text-xs font-mono">{item.dateModified}</td>
                        <td className="px-5 py-3.5 text-gray-700 text-sm">{item.createdBy}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 opacity-40 group-hover:opacity-100 transition">
                            <button title="Copy ID" onClick={(e) => handleCopyId(item.id, e)} className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-gray-400 hover:text-gray-700 cursor-pointer transition">
                              {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button title="Delete" onClick={(e) => onDeleteItem(item.id, e)} className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white hover:border-red-200 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500 cursor-pointer transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination footer */}
            <div className="border-t border-gray-100 bg-gray-50 px-5 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-500">
              <div>Showing {sortedItems.length} entries</div>
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Per page:</span>
                  <select value={recordsPerPage} onChange={(e) => { setRecordsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-white border border-gray-200 rounded-xl px-2 py-1 text-xs focus:outline-none focus:border-gray-300 cursor-pointer">
                    <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(1)} className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white rounded-xl hover:border-gray-400 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"><ChevronsLeft className="w-3.5 h-3.5 text-gray-500" /></button>
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white rounded-xl hover:border-gray-400 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"><ChevronLeft className="w-3.5 h-3.5 text-gray-500" /></button>
                  <span className="px-2 text-sm font-medium text-gray-700">{currentPage} <span className="text-gray-400 font-normal">of</span> {totalPages}</span>
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white rounded-xl hover:border-gray-400 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"><ChevronRight className="w-3.5 h-3.5 text-gray-500" /></button>
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white rounded-xl hover:border-gray-400 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"><ChevronsRight className="w-3.5 h-3.5 text-gray-500" /></button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CREATE */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-white border border-gray-200 shadow-xl p-6 rounded-2xl relative">
            <button onClick={() => setIsCreateOpen(false)} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"><X className="w-4 h-4" /></button>
            <form onSubmit={onCreateSubmit} className="space-y-4">
              <div className="pb-3 border-b border-gray-100">
                <h3 className="font-semibold text-lg text-gray-900">{activeTabInfo.buttonWord}</h3>
                <p className="text-sm text-gray-500 mt-0.5">Add a new {activeTabInfo.label.toLowerCase()} to your workspace.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Name <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder="Enter a name" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
                  <input type="text" placeholder="Brief scope description" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Tag</label>
                    <input type="text" placeholder="e.g. GDPR" value={formTags} onChange={(e) => setFormTags(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Category</label>
                    <input type="text" disabled value={activeTabInfo.label} className="w-full bg-gray-100 text-gray-400 border border-gray-100 rounded-xl p-2.5 text-sm" />
                  </div>
                </div>
                {activeTab !== "files" && activeTab !== "tags" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{activeTab === "websites" ? "URL" : "Content / Instructions"}</label>
                    <textarea rows={4} required placeholder={activeTab === "websites" ? "https://..." : "Enter directive instructions..."} value={formDetails} onChange={(e) => setFormDetails(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition font-mono leading-relaxed resize-none" />
                  </div>
                )}
              </div>
              <div className="flex gap-2.5 pt-2 border-t border-gray-100 justify-end">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl text-sm font-medium bg-white hover:bg-gray-50 transition cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition shadow-sm cursor-pointer">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FOLDER DOCK */}
      {selectedFolder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white border border-gray-200 shadow-xl p-6 rounded-2xl relative">
            <button onClick={() => setSelectedFolder(null)} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"><X className="w-4 h-4" /></button>
            <div className="mb-5 pb-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0"><Folder className="w-5 h-5 text-amber-500" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-lg text-gray-900 truncate">{selectedFolder.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">ID: {selectedFolder.id} · By {selectedFolder.createdBy}</p>
              </div>
              <button onClick={() => { setFormFolderTarget(selectedFolder.id); setIsAddFileOpen(true); }} className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3.5 py-2 rounded-xl transition shrink-0 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /><span>Add files</span>
              </button>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Files ({selectedFolder.fileList?.length || 0})</p>
            {(!selectedFolder.fileList || selectedFolder.fileList.length === 0) ? (
              <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center bg-gray-50">
                <Info className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No files yet. Use the button above to upload.</p>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-100 p-2.5 rounded-2xl bg-gray-50">
                {selectedFolder.fileList.map((file, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3 flex justify-between items-center hover:border-gray-300 transition text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-900 font-medium truncate">{file.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{file.size} · {file.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">Synced</span>
                      <button onClick={() => { if (file.id) { handleDeleteFileFromFolder(selectedFolder.id, file.id).then(() => setSelectedFolder(prev => prev ? { ...prev, fileList: (prev.fileList || []).filter(f => f.id !== file.id) } : null)); } }} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-xl transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-5">
              <button onClick={(e) => { handleDeleteItem(selectedFolder.id, "files", e); setSelectedFolder(null); }} className="text-sm font-medium text-red-500 hover:text-red-700 cursor-pointer transition">Delete folder</button>
              <button onClick={() => setSelectedFolder(null)} className="px-5 py-2 border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-sm font-medium transition cursor-pointer text-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ITEM DETAIL */}
      {viewDetailItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-white border border-gray-200 shadow-xl p-6 rounded-2xl relative">
            <button onClick={() => setViewDetailItem(null)} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"><X className="w-4 h-4" /></button>
            <div className="mb-5 pb-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-100 flex items-center justify-center shrink-0"><FileCode className="w-5 h-5 text-gray-500" /></div>
              <div className="min-w-0">
                <h3 className="font-semibold text-base text-gray-900 leading-tight">{viewDetailItem.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">ID: {viewDetailItem.id} · Type: {viewDetailItem.type}</p>
              </div>
            </div>
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Description</span>
                <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3 leading-relaxed">{viewDetailItem.description}</p>
              </div>
              {viewDetailItem.details && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{viewDetailItem.type === "websites" ? "URL" : "Content"}</span>
                  {viewDetailItem.type === "websites" ? (
                    <a href={viewDetailItem.details} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-blue-600 hover:underline flex items-center gap-1.5 bg-blue-50 p-3 border border-blue-100 rounded-xl">
                      <Globe className="w-3.5 h-3.5 text-blue-400" /><span>{viewDetailItem.details}</span>
                    </a>
                  ) : (
                    <pre className="text-xs font-mono p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-700 leading-relaxed whitespace-pre-wrap">{viewDetailItem.details}</pre>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3 text-sm">
                <div><span className="text-xs text-gray-400 block mb-0.5">Tags</span><span className="font-medium text-gray-800">{viewDetailItem.tags}</span></div>
                <div><span className="text-xs text-gray-400 block mb-0.5">Created by</span><span className="font-medium text-gray-800">{viewDetailItem.createdBy}</span></div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-5">
              <button onClick={(e) => { handleDeleteItem(viewDetailItem.id, viewDetailItem.type as LibraryTabId, e); setViewDetailItem(null); }} className="text-sm font-medium text-red-500 hover:text-red-700 cursor-pointer transition">Delete</button>
              <button onClick={() => setViewDetailItem(null)} className="px-5 py-2 border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-sm font-medium transition cursor-pointer text-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD FILE */}
      {isAddFileOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white border border-gray-200 shadow-xl p-6 rounded-2xl relative">
            <button onClick={() => { setIsAddFileOpen(false); setUploadStatus("idle"); }} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"><X className="w-4 h-4" /></button>
            <div className="pb-4 border-b border-gray-100 mb-5">
              <h3 className="font-semibold text-base text-gray-900">Upload files</h3>
              <p className="text-sm text-gray-500 mt-0.5">Add documents to a folder in your workspace.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Target folder</label>
                <select value={formFolderTarget} onChange={(e) => setFormFolderTarget(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition cursor-pointer">
                  <option value="" disabled>Select a folder…</option>
                  {items.filter((i) => i.type === "files").map((fld) => (
                    <option key={fld.id} value={fld.id}>{fld.name} ({fld.fileList?.length || 0} files)</option>
                  ))}
                </select>
              </div>
              <label className="block border-2 border-dashed border-gray-200 hover:border-gray-400 transition p-7 text-center rounded-2xl bg-gray-50 cursor-pointer">
                <input type="file" className="hidden" onChange={(e) => handleTriggerUpload(formFolderTarget, e.target.files).then(() => {
                  setTimeout(() => {
                    setIsAddFileOpen(false);
                    setUploadStatus("idle");
                  }, 2000);
                }).catch(() => {})} disabled={uploadStatus === "uploading" || !formFolderTarget} />
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Drop or click to upload</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Excel, JPG, Text</p>
              </label>
              {uploadStatus === "uploading" && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 p-3 rounded-xl animate-pulse">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Indexing in cloud enclave…</span>
                </div>
              )}
              {uploadStatus === "success" && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 p-3 rounded-xl animate-bounce">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>File uploaded and parsed successfully!</span>
                </div>
              )}
              {uploadStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-xl">
                  <Info className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{uploadError || "Upload failed."}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-gray-100 mt-5">
              <button type="button" onClick={() => { setIsAddFileOpen(false); setUploadStatus("idle"); }} className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl text-sm font-medium bg-white hover:bg-gray-50 transition cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
