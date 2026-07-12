import React, { useState, useEffect } from "react";
import { apiUrl } from "../config";
import {
  Folder,
  Search,
  Plus,
  Trash2,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Globe,
  FileText,
  Sparkles,
  BookOpen,
  Sliders,
  Check,
  Copy,
  Upload,
  X,
  FileCode,
  Info,
  FilePen,
  ExternalLink,
} from "lucide-react";
import { LegalDocument } from "../types";

interface LibraryProps {
  documents: LegalDocument[];
  authToken: string;
  onRefresh: () => void;
  onOpenInDraftEditor?: (doc: LegalDocument) => void;
}

interface LibraryItem {
  id: string;
  type: "files" | "prompts" | "questions" | "rulebook" | "templates" | "clauses" | "websites" | "tags";
  name: string;
  description: string;
  tags: string;
  itemsCount: string | number;
  dateModified: string;
  createdBy: string;
  details?: string;
  fileList?: Array<{ name: string; size: string; type: string }>;
}

export default function LibraryManager({ documents, authToken, onRefresh, onOpenInDraftEditor }: LibraryProps) {
  const [activeTab, setActiveTab] = useState<
    "files" | "prompts" | "questions" | "rulebook" | "templates" | "clauses" | "websites" | "tags" | "saved-drafts"
  >("files");

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Saved Drafts state — raw API docs
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);
  const [savedDraftsSearch, setSavedDraftsSearch] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // Sorting
  const [sortField, setSortField] = useState<keyof LibraryItem>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<LibraryItem | null>(null);
  const [viewDetailItem, setViewDetailItem] = useState<LibraryItem | null>(null);
  const [isAddFileOpen, setIsAddFileOpen] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formFolderTarget, setFormFolderTarget] = useState("");

  const [uploadProgress, setUploadProgress] = useState(false);

  const tabsConfig = [
    { id: "files" as const,       label: "Files",         desc: "Upload and organise your documents",                              placeholder: "Search folders...",       buttonWord: "Create Folder"      },
    { id: "prompts" as const,     label: "Prompts",       desc: "Define personalized prompt instructions for AI reviews",          placeholder: "Search AI prompts...",     buttonWord: "Create Prompt"      },
    { id: "questions" as const,   label: "Question set",  desc: "Manage pre-structured context question sets",                     placeholder: "Search question sets...",  buttonWord: "Create Question Set"},
    { id: "rulebook" as const,    label: "AI rulebook",   desc: "Configure playbook policies and compliance guidelines",           placeholder: "Search rulebooks...",      buttonWord: "Create Rule"        },
    { id: "templates" as const,   label: "Templates",     desc: "Boilerplate structural templates of pre-approved documents",      placeholder: "Search templates...",      buttonWord: "Create Template"    },
    { id: "clauses" as const,     label: "Clauses",       desc: "Standardized contract clauses and fallback wordings",             placeholder: "Search clauses...",        buttonWord: "Create Clause"      },
    { id: "websites" as const,    label: "Websites",      desc: "Configure authoritative websites and reference domains",          placeholder: "Search websites...",       buttonWord: "Create Website"     },
    { id: "tags" as const,        label: "Tags",          desc: "Administrative labels and taxonomy parameters",                   placeholder: "Search tags...",           buttonWord: "Create Tag"         },
    { id: "saved-drafts" as const,label: "Saved Drafts",  desc: "Drafts saved from the Draft Templates module",                   placeholder: "Search drafts...",         buttonWord: ""                   },
  ];

  const activeTabInfo = tabsConfig.find((t) => t.id === activeTab) || tabsConfig[0];

  const fetchLibraryData = async () => {
    try {
      const [foldersRes, itemsRes, docsRes] = await Promise.all([
        fetch(apiUrl("/api/folders"),        { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/library-items"),  { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/documents"),      { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);

      const foldersData      = foldersRes.ok  ? await foldersRes.json()  : [];
      const libraryItemsData = itemsRes.ok    ? await itemsRes.json()    : [];
      const docsData         = docsRes.ok     ? await docsRes.json()     : [];

      const formattedFolders: LibraryItem[] = foldersData.map((f: any) => ({
        id: f.id,
        type: "files" as const,
        name: f.name,
        description: "-",
        tags: "-",
        itemsCount: 0,
        dateModified: f.updated_at
          ? new Date(f.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-")
          : "-",
        createdBy: "User",
        fileList: docsData
          .filter((d: any) => d.folder_id === f.id)
          .map((d: any) => ({ name: d.title || d.name, size: "N/A", type: d.type })),
      }));

      const formattedItems: LibraryItem[] = libraryItemsData.map((i: any) => ({
        id: i.id,
        type: i.type,
        name: i.name,
        description: i.description || "-",
        tags: i.tags || "-",
        itemsCount: "1 item",
        dateModified: i.updated_at
          ? new Date(i.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-")
          : "-",
        createdBy: "User",
        details: i.details,
      }));

      const finalFolders = formattedFolders.map((f) => ({
        ...f,
        itemsCount: f.fileList?.length ?? 0,
      }));

      setItems([...finalFolders, ...formattedItems]);
      setSavedDrafts(docsData);
    } catch (err) {
      console.error("Failed to fetch library data", err);
    }
  };

  useEffect(() => {
    fetchLibraryData();
  }, [authToken]);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      const endpoint =
        activeTab === "files"
          ? apiUrl(`/api/folders/${id}`)
          : apiUrl(`/api/documents/${id}`);
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        fetchLibraryData();
        setSelectedFolder(null);
        setViewDetailItem(null);
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved draft?")) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setSavedDrafts((prev) => prev.filter((d) => d.id !== id));
        onRefresh();
      }
    } catch (err) {
      console.error("Draft delete failed", err);
    }
  };

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    try {
      const endpoint = activeTab === "files" ? "/api/folders" : "/api/library-items";
      const body =
        activeTab === "files"
          ? { name: formName }
          : { type: activeTab, name: formName, description: formDescription, tags: formTags, details: formDetails };
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        fetchLibraryData();
        setFormName(""); setFormDescription(""); setFormTags(""); setFormDetails("");
        setIsCreateOpen(false);
      }
    } catch (err) {
      console.error("Creation failed", err);
    }
  };

  const handleTriggerUpload = async (targetFolderId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadProgress(true);
    try {
      const file = files[0];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder_id", targetFolderId);
      formData.append("isTemplate", "false");
      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (res.status === 202 && data.job_id) {
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            if (payload.job.status === "completed") {
              eventSource.close();
              setUploadProgress(false);
              fetchLibraryData();
              setIsAddFileOpen(false);
            } else if (payload.job.status === "failed") {
              eventSource.close();
              setUploadProgress(false);
              alert("Processing failed: " + payload.job.error);
            }
          }
        };
      } else {
        fetchLibraryData();
        setIsAddFileOpen(false);
      }
    } catch (err: any) {
      console.error(err);
      alert("Upload failed: " + err.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleDeleteFileFromFolder = (folderId: string, fileName: string) => {
    const updated = items.map((f) => {
      if (f.id !== folderId) return f;
      const updatedList = (f.fileList || []).filter((item) => item.name !== fileName);
      return { ...f, fileList: updatedList, itemsCount: updatedList.length };
    });
    setItems(updated);
    const fresh = updated.find((f) => f.id === folderId);
    if (fresh) setSelectedFolder(fresh);
  };

  // Filtered + sorted items for regular tabs
  const filteredTabItems = items.filter((item) => {
    if (item.type !== activeTab) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.toLowerCase().includes(q) ||
      item.createdBy.toLowerCase().includes(q)
    );
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
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const indexOfLast    = currentPage * recordsPerPage;
  const indexOfFirst   = indexOfLast - recordsPerPage;
  const currentRecords = sortedItems.slice(indexOfFirst, indexOfLast);
  const totalPages     = Math.max(1, Math.ceil(sortedItems.length / recordsPerPage));

  // Filtered saved drafts
  const filteredDrafts = savedDrafts.filter((d) => {
    if (!savedDraftsSearch.trim()) return true;
    return (d.title || "").toLowerCase().includes(savedDraftsSearch.toLowerCase());
  });

  const fmtDate = (raw: string | undefined) => {
    if (!raw) return "-";
    return new Date(raw).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F8FA] overflow-hidden font-sans">

      <div className="flex-1 flex flex-col overflow-y-auto px-8 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className="hover:text-gray-900 cursor-pointer">Vault repository</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="font-semibold text-gray-900">{activeTabInfo.label}</span>
          </div>
          <button
            onClick={() => alert("Personalization Dashboard Help Docs & System Prompt Specifications.")}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white px-3 py-1.5 rounded-xl hover:bg-gray-50 transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help</span>
          </button>
        </div>

        {/* Title card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">{activeTabInfo.label}</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl leading-relaxed">
              {activeTabInfo.desc}.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab === "files" && (
              <button
                id="add-file-trigger"
                onClick={() => { setFormFolderTarget(items.filter((i) => i.type === "files")[0]?.id || ""); setIsAddFileOpen(true); }}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 px-4 py-2 rounded-xl transition shadow-sm cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Add files</span>
              </button>
            )}
            {activeTab !== "saved-drafts" && (
              <button
                id="create-new-personalization"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{activeTabInfo.buttonWord}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-gray-200 mb-5 overflow-x-auto scrollbar-none">
          {tabsConfig.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = tab.id === "saved-drafts" ? savedDrafts.length : items.filter((i) => i.type === tab.id).length;
            return (
              <button
                key={tab.id}
                id={`tab-select-${tab.id}`}
                onClick={() => { setActiveTab(tab.id); setSearchQuery(""); setCurrentPage(1); }}
                className={`px-4 py-2.5 text-sm font-medium cursor-pointer transition-all border-b-2 shrink-0 flex items-center gap-2 ${
                  isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-xs ${isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Controls bar */}
        <div className="bg-white border border-gray-200 border-b-0 rounded-t-2xl px-5 py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <span className="text-sm font-medium text-gray-700">All {activeTabInfo.label}</span>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              id="personalization-search-bar"
              type="text"
              value={activeTab === "saved-drafts" ? savedDraftsSearch : searchQuery}
              onChange={(e) => { if (activeTab === "saved-drafts") { setSavedDraftsSearch(e.target.value); } else { setSearchQuery(e.target.value); setCurrentPage(1); } }}
              placeholder={activeTabInfo.placeholder}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* ── SAVED DRAFTS TABLE ─────────────────────────────────────────── */}
        {activeTab === "saved-drafts" ? (
          <div className="bg-white border border-gray-200 rounded-b-2xl overflow-hidden shadow-sm flex-1 flex flex-col">
            {filteredDrafts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50 min-h-[300px]">
                <Info className="w-8 h-8 text-gray-200 mb-3" />
                <h4 className="text-sm font-semibold text-gray-700">No saved drafts found</h4>
                <p className="text-sm text-gray-400 mt-1 max-w-sm leading-relaxed">
                  Drafts saved from the Draft Templates module will automatically appear here.
                </p>
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
                            <div className="flex items-center gap-3">
                              <FilePen className="w-4 h-4 text-gray-400 shrink-0" />
                              <span className="truncate max-w-[280px]">{draft.title}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center text-gray-400 text-xs font-mono">{fmtDate(draft.updated_at)}</td>
                          <td className="px-5 py-3.5 text-center text-gray-400 text-xs font-mono">{fmtDate(draft.created_at)}</td>
                          <td className="px-6 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-40 group-hover:opacity-100 transition">
                              {onOpenInDraftEditor && (
                                <button title="Open in Draft Editor" onClick={() => onOpenInDraftEditor(draft as LegalDocument)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition">
                                  <ExternalLink className="w-3 h-3" /><span>Open</span>
                                </button>
                              )}
                              <button title="Copy ID" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(draft.id); setCopiedId(draft.id); setTimeout(() => setCopiedId(null), 1500); }}
                                className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-gray-400 hover:text-gray-700 cursor-pointer transition">
                                {copiedId === draft.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button title="Delete" onClick={(e) => handleDeleteDraft(draft.id, e)}
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
          <div className="bg-white border border-gray-200 rounded-b-2xl overflow-hidden shadow-sm flex-1 flex flex-col">
            {sortedItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50 min-h-[300px]">
                <Info className="w-8 h-8 text-gray-200 mb-3" />
                <h4 className="text-sm font-semibold text-gray-700">No records found</h4>
                <p className="text-sm text-gray-400 mt-1 max-w-sm leading-relaxed">
                  Create your first {activeTabInfo.label.toLowerCase()} using the button above.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th onClick={() => toggleSort("name")}        className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-1/4"><div className="flex items-center gap-1">Name <Sliders className="w-2.5 h-2.5 rotate-90 opacity-60" /></div></th>
                      <th onClick={() => toggleSort("description")} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-1/3"><div className="flex items-center gap-1">Description <Sliders className="w-2.5 h-2.5 rotate-90 opacity-60" /></div></th>
                      <th onClick={() => toggleSort("tags")}        className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-24">Tags</th>
                      <th onClick={() => toggleSort("itemsCount")}  className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-20">Items</th>
                      <th onClick={() => toggleSort("dateModified")}className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-28">Modified</th>
                      <th onClick={() => toggleSort("createdBy")}   className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 transition w-28">Created by</th>
                      <th className="px-5 py-3 w-16 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                    {currentRecords.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => item.type === "files" ? setSelectedFolder(item) : setViewDetailItem(item)}
                        className="hover:bg-gray-50 transition cursor-pointer group"
                      >
                        <td className="px-5 py-3.5 font-medium text-gray-900">
                          <div className="flex items-center gap-3">
                            {item.type === "files"     ? <Folder    className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition shrink-0" />
                            : item.type === "prompts"  ? <Sparkles  className="w-4 h-4 text-emerald-400 shrink-0" />
                            : item.type === "questions"? <BookOpen  className="w-4 h-4 text-amber-400 shrink-0" />
                            : item.type === "websites" ? <Globe     className="w-4 h-4 text-blue-400 shrink-0" />
                            :                           <FileText   className="w-4 h-4 text-gray-400 shrink-0" />}
                            <span className="truncate max-w-[200px]">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-sm leading-relaxed max-w-[300px] truncate">{item.description}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${item.tags === "-" ? "text-gray-400 bg-gray-50" : "text-blue-700 bg-blue-50 border border-blue-100"}`}>
                            {item.tags}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-gray-500 text-sm">{item.type === "files" ? item.fileList?.length : item.itemsCount}</td>
                        <td className="px-5 py-3.5 text-center text-gray-400 text-xs font-mono">{item.dateModified}</td>
                        <td className="px-5 py-3.5 text-gray-700 text-sm">{item.createdBy}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 opacity-40 group-hover:opacity-100 transition">
                            <button title="Copy ID" onClick={(e) => handleCopyId(item.id, e)}
                              className="w-7 h-7 flex items-center justify-center border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-gray-400 hover:text-gray-700 cursor-pointer transition">
                              {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button title="Delete" onClick={(e) => handleDeleteItem(item.id, e)}
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
            )}

            {/* Pagination footer */}
            <div className="border-t border-gray-100 bg-gray-50 px-5 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-500">
              <div>Showing {sortedItems.length} entries</div>
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Per page:</span>
                  <select value={recordsPerPage} onChange={(e) => { setRecordsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="bg-white border border-gray-200 rounded-xl px-2 py-1 text-xs focus:outline-none focus:border-gray-300 cursor-pointer">
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

      </div>{/* end TOP COMPONENT WRAPPER */}

      {/* MODAL 1: CREATE */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-white border border-gray-200 shadow-xl p-6 rounded-2xl relative">
            <button onClick={() => setIsCreateOpen(false)} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"><X className="w-4 h-4" /></button>
            <form onSubmit={handleCreateNewItem} className="space-y-4">
              <div className="pb-3 border-b border-gray-100">
                <h3 className="font-semibold text-lg text-gray-900">{activeTabInfo.buttonWord}</h3>
                <p className="text-sm text-gray-500 mt-0.5">Add a new {activeTabInfo.label.toLowerCase()} to your workspace.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Name <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder={activeTab === "websites" ? "e.g. EU GDPR Legal Gazette" : "e.g. Acme standard subprocessor notice"} value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
                  <input type="text" placeholder="Brief scope description" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Tag</label>
                    <input type="text" placeholder="e.g. GDPR, Tax" value={formTags} onChange={(e) => setFormTags(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Category</label>
                    <input type="text" disabled value={activeTabInfo.label} className="w-full bg-gray-100 text-gray-400 border border-gray-100 rounded-xl p-2.5 text-sm" />
                  </div>
                </div>
                {activeTab !== "files" && activeTab !== "tags" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{activeTab === "websites" ? "URL" : "Content / Instructions"}</label>
                    <textarea rows={4} required placeholder={activeTab === "websites" ? "https://..." : "Enter directive instructions or boilerplate text..."} value={formDetails} onChange={(e) => setFormDetails(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition font-mono leading-relaxed resize-none" />
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

      {/* MODAL 2: FOLDER DOCK */}
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
              <button onClick={() => { setFormFolderTarget(selectedFolder.id); setIsAddFileOpen(true); }}
                className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3.5 py-2 rounded-xl transition shrink-0 cursor-pointer">
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
                      <button onClick={() => handleDeleteFileFromFolder(selectedFolder.id, file.name)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-xl transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-5">
              <button onClick={(e) => handleDeleteItem(selectedFolder.id, e)} className="text-sm font-medium text-red-500 hover:text-red-700 cursor-pointer transition">Delete folder</button>
              <button onClick={() => setSelectedFolder(null)} className="px-5 py-2 border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-sm font-medium transition cursor-pointer text-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ITEM DETAIL */}
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
              <button onClick={(e) => handleDeleteItem(viewDetailItem.id, e)} className="text-sm font-medium text-red-500 hover:text-red-700 cursor-pointer transition">Delete</button>
              <button onClick={() => setViewDetailItem(null)} className="px-5 py-2 border border-gray-200 bg-white hover:border-gray-400 rounded-xl text-sm font-medium transition cursor-pointer text-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD FILE */}
      {isAddFileOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white border border-gray-200 shadow-xl p-6 rounded-2xl relative">
            <button onClick={() => setIsAddFileOpen(false)} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"><X className="w-4 h-4" /></button>
            <div className="pb-4 border-b border-gray-100 mb-5">
              <h3 className="font-semibold text-base text-gray-900">Upload files</h3>
              <p className="text-sm text-gray-500 mt-0.5">Add documents to a folder in your workspace.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Target folder</label>
                <select value={formFolderTarget} onChange={(e) => setFormFolderTarget(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition cursor-pointer">
                  <option value="" disabled>Select a folder…</option>
                  {items.filter((i) => i.type === "files").map((fld) => (
                    <option key={fld.id} value={fld.id}>{fld.name} ({fld.fileList?.length || 0} files)</option>
                  ))}
                </select>
              </div>
              <label className="block border-2 border-dashed border-gray-200 hover:border-gray-400 transition p-7 text-center rounded-2xl bg-gray-50 cursor-pointer">
                <input type="file" className="hidden" onChange={(e) => handleTriggerUpload(formFolderTarget, e.target.files)} disabled={uploadProgress || !formFolderTarget} />
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Drop or click to upload</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Excel, JPG, Text</p>
              </label>
              {uploadProgress && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 p-3 rounded-xl">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Indexing in cloud enclave…</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-gray-100 mt-5">
              <button type="button" onClick={() => setIsAddFileOpen(false)} className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl text-sm font-medium bg-white hover:bg-gray-50 transition cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
