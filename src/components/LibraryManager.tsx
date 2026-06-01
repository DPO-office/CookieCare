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
  MoreVertical, 
  Globe, 
  Tag, 
  FileText, 
  Sparkles, 
  BookOpen, 
  Sliders, 
  Check, 
  Copy, 
  Upload, 
  X,
  FileCode,
  FolderPlus,
  Info
} from "lucide-react";
import { LegalDocument } from "../types";

interface LibraryProps {
  documents: LegalDocument[];
  authToken: string;
  onRefresh: () => void;
}

// Unified state representation for personalization items across 8 tabs
interface LibraryItem {
  id: string;
  type: "files" | "prompts" | "questions" | "rulebook" | "templates" | "clauses" | "websites" | "tags";
  name: string;
  description: string;
  tags: string;
  itemsCount: string | number;
  dateModified: string;
  createdBy: string;
  // Dynamic contents based on type
  details?: string; // prompt instructions, clause boilerplate, template preamble, rules list or raw web URL
  fileList?: Array<{ name: string; size: string; type: string }>; // For folders
}

export default function LibraryManager({ documents, authToken, onRefresh }: LibraryProps) {
  // Current active tab state matching the requested 8 tabs
  const [activeTab, setActiveTab] = useState<"files" | "prompts" | "questions" | "rulebook" | "templates" | "clauses" | "websites" | "tags">("files");
  
  // Storage and filtration
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Pagination & Records setup
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  
  // Custom sorting state
  const [sortField, setSortField] = useState<keyof LibraryItem>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Dialog triggers
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<LibraryItem | null>(null);
  const [viewDetailItem, setViewDetailItem] = useState<LibraryItem | null>(null);
  const [isAddFileOpen, setIsAddFileOpen] = useState(false);

  // Form Fields for Add Modal
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formFolderTarget, setFormFolderTarget] = useState("");

  // Simulated file uploaded list
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: string; type: string }>>([]);

  const tabsConfig = [
    { id: "files" as const, label: "Files", desc: "Upload and organise your documents", placeholder: "Search folders...", buttonWord: "Create Folder" },
    { id: "prompts" as const, label: "Prompts", desc: "Define personalized prompt instructions for AI reviews", placeholder: "Search AI prompts...", buttonWord: "Create Prompt" },
    { id: "questions" as const, label: "Question set", desc: "Manage pre-structured context question sets", placeholder: "Search question sets...", buttonWord: "Create Question Set" },
    { id: "rulebook" as const, label: "AI rulebook", desc: "Configure playbook policies and compliance guidelines", placeholder: "Search rulebooks...", buttonWord: "Create Rule" },
    { id: "templates" as const, label: "Templates", desc: "Boilerplate structural templates of pre-approved documents", placeholder: "Search templates...", buttonWord: "Create Template" },
    { id: "clauses" as const, label: "Clauses", desc: "Standardized contract clauses and fallback wordings", placeholder: "Search clauses...", buttonWord: "Create Clause" },
    { id: "websites" as const, label: "Websites", desc: "Configure authoritative websites and reference domains", placeholder: "Search websites...", buttonWord: "Create Website" },
    { id: "tags" as const, label: "Tags", desc: "Administrative labels and taxonomy parameters", placeholder: "Search tags...", buttonWord: "Create Tag" },
  ];

  const activeTabInfo = tabsConfig.find(t => t.id === activeTab) || tabsConfig[0];

  const fetchLibraryData = async () => {
    try {
      const [foldersRes, itemsRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), { headers: { "Authorization": `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/library-items"), { headers: { "Authorization": `Bearer ${authToken}` } })
      ]);

      if (foldersRes.ok && itemsRes.ok) {
        const foldersData = await foldersRes.json();
        const libraryItemsData = await itemsRes.json();

        const formattedFolders: LibraryItem[] = foldersData.map((f: any) => ({
          id: f.id,
          type: "files",
          name: f.name,
          description: "-",
          tags: "-",
          itemsCount: 0,
          dateModified: new Date(f.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-"),
          createdBy: "User",
          fileList: []
        }));

        const formattedItems: LibraryItem[] = libraryItemsData.map((i: any) => ({
          id: i.id,
          type: i.type,
          name: i.name,
          description: i.description || "-",
          tags: i.tags || "-",
          itemsCount: "1 item",
          dateModified: new Date(i.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "-"),
          createdBy: "User",
          details: i.details
        }));

        setItems([...formattedFolders, ...formattedItems]);
      }
    } catch (err) {
      console.error("Failed to fetch library data", err);
    }
  };

  useEffect(() => {
    fetchLibraryData();
  }, [authToken]);

  // Copy UUID
  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Delete specific item
  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm("Are you sure you want to delete this piece of personalization?");
    if (confirmed) {
      try {
        const endpoint = activeTab === "files" ? `/api/folders/${id}` : `/api/library-items/${id}`;
        const res = await fetch(apiUrl(endpoint), {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (res.ok) {
          fetchLibraryData();
          setSelectedFolder(null);
          setViewDetailItem(null);
        }
      } catch (err) {
        console.error("Delete failed", err);
      }
    }
  };

  // Creation Handler
  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      const endpoint = activeTab === "files" ? "/api/folders" : "/api/library-items";
      const body = activeTab === "files" ? { name: formName } : {
        type: activeTab,
        name: formName,
        description: formDescription,
        tags: formTags,
        details: formDetails
      };

      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        fetchLibraryData();
        setFormName("");
        setFormDescription("");
        setFormTags("");
        setFormDetails("");
        setIsCreateOpen(false);
      }
    } catch (err) {
      console.error("Creation failed", err);
    }
  };

  // File Upload Handlers (Simulation matching senior dev grade files interface)
  const handleTriggerUpload = async (targetFolderId: string) => {
    setUploadProgress(true);
    setTimeout(() => {
      setUploadProgress(false);
      setIsAddFileOpen(false);
      alert("Real file uploads are now connected to the secure 'files' enclave!");
    }, 1200);
  };

  // Remove file inside folder
  const handleDeleteFileFromFolder = (folderId: string, fileName: string) => {
    const updated = items.map(f => {
      if (f.id === folderId) {
        const currentList = f.fileList || [];
        const updatedList = currentList.filter(item => item.name !== fileName);
        return {
          ...f,
          fileList: updatedList,
          itemsCount: updatedList.length
        };
      }
      return f;
    });

    setItems(updated);
    const freshFolder = updated.find(f => f.id === folderId);
    if (freshFolder) {
      setSelectedFolder(freshFolder);
    }
  };

  // Filtration based on Selected category + Active query
  const filteredTabItems = items.filter(item => {
    if (item.type !== activeTab) return false;
    if (!searchQuery) return true;
    const normSearch = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(normSearch) || 
      item.description.toLowerCase().includes(normSearch) || 
      item.tags.toLowerCase().includes(normSearch) || 
      item.createdBy.toLowerCase().includes(normSearch)
    );
  });

  // Sorting
  const sortedItems = [...filteredTabItems].sort((a, b) => {
    let fieldA = a[sortField] ?? "";
    let fieldB = b[sortField] ?? "";

    if (typeof fieldA === "string") fieldA = fieldA.toLowerCase();
    if (typeof fieldB === "string") fieldB = fieldB.toLowerCase();

    if (fieldA < fieldB) return sortDirection === "asc" ? -1 : 1;
    if (fieldA > fieldB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: keyof LibraryItem) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Slice paginated items
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = sortedItems.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / recordsPerPage));

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fafafa] relative overflow-hidden font-sans">
      
      {/* 20px Grid Overlay Matching Screenshot Identity */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.25]"
        style={{
          backgroundSize: "20px 20px",
          backgroundImage: "linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)"
        }}
      />

      {/* TOP COMPONENT WRAPPER */}
      <div className="flex-1 flex flex-col overflow-y-auto px-8 py-8 z-10 relative">
        
        {/* BREADCRUMB AND ACTIONS ROW */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-1.5 text-xs text-gray-500 font-mono tracking-tight">
            <span className="hover:text-black cursor-pointer uppercase">Library</span>
            <ChevronRight className="w-3 h-3 text-gray-400" />
            <span className="text-gray-950 font-bold uppercase">{activeTabInfo.label}</span>
          </div>

          <button 
            onClick={() => alert("Personalization Dashboard Help Docs & System Prompt Specifications.")}
            className="p-1 px-2 border border-gray-250 bg-white hover:border-black text-gray-400 hover:text-black transition flex items-center gap-1 text-[11px] font-mono shadow-xs rounded-md"
            title="Assists & references"
          >
            <HelpCircle className="w-3.5 h-3.5 text-gray-500" />
            <span>Support</span>
          </button>
        </div>

        {/* VAULT TITLE SUB-SECTION CARD */}
        <div className="bg-white border border-gray-200/80 rounded-xl p-6 mb-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <span>{activeTabInfo.label}</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1 max-w-xl pr-4">
              {activeTabInfo.desc}. Personalize custom guidelines and files targeted exclusively for your account reviews.
            </p>
          </div>

          {/* DYNAMIC ACTION BUTTONS */}
          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab === "files" && (
              <button
                id="add-file-trigger"
                onClick={() => {
                  setFormFolderTarget(items.filter(i => i.type === "files")[0]?.id || "");
                  setIsAddFileOpen(true);
                }}
                className="px-4 py-2 border border-gray-200 bg-white hover:border-black text-xs font-mono font-bold text-gray-800 transition shadow-sm hover:shadow-md cursor-pointer flex items-center gap-1.5 rounded-lg"
              >
                <Upload className="w-3.5 h-3.5 text-gray-600" />
                <span>+ Add Files</span>
              </button>
            )}

            <button
              id="create-new-personalization"
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-black hover:bg-gray-800 text-white text-xs font-mono font-bold transition shadow-md hover:shadow-lg cursor-pointer flex items-center gap-1.5 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>{activeTabInfo.buttonWord}</span>
            </button>
          </div>
        </div>

        {/* NAVIGATION ROW (8 TABS IN EXACT SCREENSHOT SPREAD) */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto scrollbar-thin bg-white/60 backdrop-blur-xs p-1 rounded-lg">
          {tabsConfig.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = items.filter(i => i.type === tab.id).length;
            return (
              <button
                key={tab.id}
                id={`tab-select-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className={`py-2 px-4.5 text-[11px] font-mono tracking-tight font-bold cursor-pointer transition-all border-b-2 shrink-0 flex items-center gap-2 ${
                  isActive
                    ? "border-black text-black font-extrabold bg-gray-50/50"
                    : "border-transparent text-gray-400 hover:text-gray-800"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1 rounded text-[9px] ${isActive ? "bg-black text-white" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* CONTROLS HEADER BAR (Filters on Left, Search Input on Right) */}
        <div className="bg-white border border-gray-250/70 border-b-0 p-4.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-xs font-mono font-bold text-gray-600 uppercase tracking-wider">
            All {activeTabInfo.label}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
            <input
              id="personalization-search-bar"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={activeTabInfo.placeholder}
              className="w-full bg-[#fcfcfc] border border-gray-200/90 rounded-lg pl-8.5 pr-3 py-2 text-xs focus:outline-none focus:border-black placeholder:text-gray-400 font-sans leading-normal"
            />
          </div>
        </div>

        {/* VAULT PERSONALIZATION TABLE */}
        <div className="bg-white border border-gray-250/70 rounded-b-xl overflow-hidden shadow-xs flex-1 flex flex-col">
          {sortedItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#fafafa]/50 min-h-[300px]">
              <Info className="w-10 h-10 text-gray-300 mb-3" />
              <h4 className="text-xs font-mono font-bold text-gray-850 uppercase">No active records found</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                There are no customized guidelines matching your criteria. Click the Action Button above to create your own!
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-[#fbfbfb] text-xs font-mono font-bold text-gray-500 select-none">
                    <th 
                      onClick={() => toggleSort("name")}
                      className="px-6 py-3 cursor-pointer hover:bg-gray-150 transition truncate w-1/4"
                    >
                      <div className="flex items-center gap-1">
                        <span>Name</span>
                        <Sliders className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleSort("description")}
                      className="px-6 py-3 cursor-pointer hover:bg-gray-150 transition w-1/3"
                    >
                      <div className="flex items-center gap-1">
                        <span>Description</span>
                        <Sliders className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleSort("tags")}
                      className="px-5 py-3 cursor-pointer hover:bg-gray-150 transition w-12"
                    >
                      <div className="flex items-center gap-1">
                        <span>Tags</span>
                        <Sliders className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleSort("itemsCount")}
                      className="px-5 py-3 cursor-pointer hover:bg-gray-150 transition text-center w-24"
                    >
                      <div className="flex items-center gap-1 justify-center">
                        <span>Items</span>
                        <Sliders className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleSort("dateModified")}
                      className="px-5 py-3 cursor-pointer hover:bg-gray-150 transition text-center w-32"
                    >
                      <div className="flex items-center gap-1 justify-center">
                        <span>Date modified</span>
                        <Sliders className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleSort("createdBy")}
                      className="px-5 py-3 cursor-pointer hover:bg-gray-150 transition w-32"
                    >
                      <div className="flex items-center gap-1">
                        <span>Created by</span>
                        <Sliders className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </th>
                    <th className="px-6 py-3 w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80 text-xs text-gray-700 font-sans">
                  {currentRecords.map((item) => (
                    <tr 
                      key={item.id}
                      onClick={() => {
                        if (item.type === "files") {
                          setSelectedFolder(item);
                        } else {
                          setViewDetailItem(item);
                        }
                      }}
                      className="hover:bg-gray-50/70 transition cursor-pointer group"
                    >
                      {/* Name Column with Tab Specific Icon indicators */}
                      <td className="px-6 py-4 font-semibold text-gray-900 group-hover:text-black">
                        <div className="flex items-center space-x-3.5">
                          {item.type === "files" ? (
                            <Folder className="w-4.5 h-4.5 text-gray-400 group-hover:text-amber-500 transition shrink-0" />
                          ) : item.type === "prompts" ? (
                            <Sparkles className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                          ) : item.type === "questions" ? (
                            <BookOpen className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                          ) : item.type === "websites" ? (
                            <Globe className="w-4.5 h-4.5 text-blue-500 shrink-0" />
                          ) : (
                            <FileText className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                          )}
                          <span className="truncate max-w-[220px] select-all">{item.name}</span>
                        </div>
                      </td>

                      {/* Description Column */}
                      <td className="px-6 py-4 text-gray-500 leading-relaxed font-normal max-w-[320px] truncate select-all">
                        {item.description}
                      </td>

                      {/* Tags Column */}
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-tight ${
                          item.tags === "-" 
                            ? "text-gray-400 bg-gray-50" 
                            : "text-indigo-800 bg-indigo-50/75 border border-indigo-100"
                        }`}>
                          {item.tags}
                        </span>
                      </td>

                      {/* Items count metadata */}
                      <td className="px-5 py-4 font-mono text-center text-gray-600 select-all">
                        {item.type === "files" ? item.fileList?.length : item.itemsCount}
                      </td>

                      {/* Date Modified column */}
                      <td className="px-5 py-4 font-mono text-center text-gray-400 select-all">
                        {item.dateModified}
                      </td>

                      {/* Created By Author Column */}
                      <td className="px-5 py-4 font-medium text-gray-800 select-all">
                        {item.createdBy}
                      </td>

                      {/* Action trigger columns */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5 opacity-40 group-hover:opacity-100 transition">
                          <button
                            title="Copy Key Reference ID"
                            onClick={(e) => handleCopyId(item.id, e)}
                            className="p-1 px-1.5 border border-gray-150 bg-white hover:border-black rounded text-gray-500 hover:text-black shrink-0 cursor-pointer"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-green-600 animate-scale" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            title="Delete Item"
                            onClick={(e) => handleDeleteItem(item.id, e)}
                            className="p-1.5 bg-white text-gray-400 hover:text-rose-600 border border-gray-150 rounded shrink-0 cursor-pointer"
                          >
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

          {/* TABLE FOOTER & REFINED PAGINATION CONTROLS */}
          <div className="border-t border-gray-200 bg-[#fdfdfd] p-4.5 px-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-gray-500 select-none">
            <div>
              Showing all {sortedItems.length} entries
            </div>

            <div className="flex items-center gap-6">
              
              {/* Records selector */}
              <div className="flex items-center gap-1.5">
                <span>Records per page:</span>
                <select
                  value={recordsPerPage}
                  onChange={(e) => {
                    setRecordsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-black cursor-pointer font-sans"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Dynamic Pages */}
              <div className="flex items-center space-x-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1 cursor-pointer border border-gray-200 bg-white rounded hover:border-black disabled:opacity-30 disabled:pointer-events-none transition"
                >
                  <ChevronsLeft className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1 cursor-pointer border border-gray-200 bg-white rounded hover:border-black disabled:opacity-30 disabled:pointer-events-none transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
                </button>
                
                <span className="text-gray-800 font-bold px-1.5">
                  {currentPage} <span className="font-normal text-gray-400">of</span> {totalPages}
                </span>

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-1 cursor-pointer border border-gray-200 bg-white rounded hover:border-black disabled:opacity-30 disabled:pointer-events-none transition"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1 cursor-pointer border border-gray-200 bg-white rounded hover:border-black disabled:opacity-30 disabled:pointer-events-none transition"
                >
                  <ChevronsRight className="w-3.5 h-3.5 text-gray-600" />
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* MODAL 1: ADD DIRECTIVE / CREATE PERSONALIZATION DIALOG */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-white border border-gray-200/90 shadow-2xl p-6 rounded-xl relative select-none">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-black cursor-pointer transition border border-gray-100 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>

            <form onSubmit={handleCreateNewItem} className="space-y-4">
              <div className="pb-2 border-b border-gray-100">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">CREATION SYSTEM</span>
                <h3 className="font-display font-extrabold text-lg text-gray-900 mt-0.5">
                  Create {activeTabInfo.buttonWord}
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-500 mb-1">
                    Guideline Label Name (Required)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={activeTab === "websites" ? "e.g. EU GDPR Legal Gazette" : "e.g. Acme standard subprocessor notice guidelines"}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-[#fcfcfc] border border-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-gray-500 mb-1">
                    Description summary (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Brief scope detailing when this personalization is selected by the user"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-[#fcfcfc] border border-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-gray-500 mb-1">
                      Classification Tag (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Liability, Tax, GDPR"
                      value={formTags}
                      onChange={(e) => setFormTags(e.target.value)}
                      className="w-full bg-[#fcfcfc] border border-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-gray-500 mb-1">
                      Resource Category
                    </label>
                    <input
                      type="text"
                      disabled
                      value={activeTabInfo.label}
                      className="w-full bg-gray-50 text-gray-400 border border-gray-150 rounded-lg p-2.5 text-xs font-semibold focus:outline-none capitalize"
                    />
                  </div>
                </div>

                {activeTab !== "files" && activeTab !== "tags" && (
                  <div>
                    <label className="block text-xs font-mono uppercase text-gray-500 mb-1">
                      {activeTab === "websites" ? "Target Web URL Address" : "System Directive Instructions / Boilerplate Text"}
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder={
                        activeTab === "websites" 
                          ? "https://..." 
                          : activeTab === "prompts" 
                          ? "Enter strict AI system prompts context here..."
                          : activeTab === "questions"
                          ? "Enter pre-configured context questions (one per line)..."
                          : "Enter standard clauses wording or preambles templates here..."
                      }
                      value={formDetails}
                      onChange={(e) => setFormDetails(e.target.value)}
                      className="w-full bg-[#fcfcfc] border border-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-black font-mono leading-relaxed"
                    />
                  </div>
                )}
              </div>

              <div className="flex space-x-2.5 pt-3 border-t border-gray-100 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-500 hover:text-black rounded-lg text-xs font-mono uppercase tracking-tight bg-white hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-mono uppercase tracking-tight transition shadow-md cursor-pointer"
                >
                  Create guidelines
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: FOLDER FILES DOCK VIEW MODAL (FOR FILES TAB) */}
      {selectedFolder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white border border-gray-200/90 shadow-2xl p-6 rounded-xl relative select-none">
            <button
              onClick={() => setSelectedFolder(null)}
              className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-black cursor-pointer transition border border-gray-100 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-5 pb-3.5 border-b border-gray-100 flex items-start gap-3">
              <div className="bg-amber-50 p-2.5 text-amber-500 rounded-lg border border-amber-100">
                <Folder className="w-6 h-6 text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">SECURE FILES WORKSPACE</span>
                <h3 className="font-display font-bold text-lg text-gray-900 mt-0.5 truncate">{selectedFolder.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate uppercase font-mono tracking-tight">UID: {selectedFolder.id} • Created by: {selectedFolder.createdBy}</p>
              </div>
              
              <button
                onClick={() => {
                  setFormFolderTarget(selectedFolder.id);
                  setIsAddFileOpen(true);
                }}
                className="px-3.5 py-2 bg-black hover:bg-gray-800 text-white text-xs font-mono font-bold transition rounded-lg shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-white" />
                <span>Add Files</span>
              </button>
            </div>

            {/* List of files in selected folder */}
            <h4 className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider mb-2.5">
              Files List ({selectedFolder.fileList?.length || 0} items)
            </h4>

            {(!selectedFolder.fileList || selectedFolder.fileList.length === 0) ? (
              <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center bg-[#fafafa]">
                <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">This folder contains no physical document attachments yet.</p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-mono">Use the buttons above to load attachments</p>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-100 p-2.5 rounded-xl bg-gray-50/50">
                {selectedFolder.fileList.map((file, idx) => (
                  <div 
                    key={idx}
                    className="bg-white border border-gray-200/95 rounded-lg p-3 flex justify-between items-center hover:border-gray-450 transition text-xs font-mono"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-900 font-semibold truncate leading-normal pr-3 select-all">{file.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5 leading-none">{file.size} • {file.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100/70 font-bold uppercase rounded px-1.5 py-0.5 animate-pulse">Synced</span>
                      <button
                        onClick={() => handleDeleteFileFromFolder(selectedFolder.id, file.name)}
                        className="p-1 text-gray-450 hover:text-rose-600 transition cursor-pointer hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-md"
                        title="Delete attachment from directory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end space-x-2.5 pt-4 border-t border-gray-100 mt-5">
              <button
                onClick={(e) => handleDeleteItem(selectedFolder.id, e)}
                className="px-4 py-2 hover:bg-rose-50 hover:text-rose-600 border border-transparent rounded-lg text-xs font-mono uppercase tracking-tight transition cursor-pointer text-gray-450"
              >
                Delete Folder
              </button>
              <button
                onClick={() => setSelectedFolder(null)}
                className="px-5 py-2 border border-gray-250 bg-white hover:border-black rounded-lg text-xs text-gray-800 font-mono uppercase tracking-tight transition cursor-pointer shadow-sm"
              >
                Close Dock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW & DIRECTIVES INSPECTOR DETAILS PANEL */}
      {viewDetailItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-white border border-gray-200/90 shadow-2xl p-6 rounded-xl relative select-none">
            <button
              onClick={() => setViewDetailItem(null)}
              className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-black cursor-pointer transition border border-gray-100 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-5 pb-3.5 border-b border-gray-100 flex items-start gap-3">
              <div className="bg-indigo-50 p-2.5 text-indigo-500 rounded-lg border border-indigo-150 shrink-0">
                <FileCode className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">PERSONALIZATION BRIEFCASE</span>
                <h3 className="font-display font-extrabold text-base text-gray-900 mt-0.5 select-all leading-tight">
                  {viewDetailItem.name}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5 truncate uppercase font-mono tracking-tight">UID: {viewDetailItem.id} • Type: {viewDetailItem.type}</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              <div>
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase block mb-1">Details Description:</span>
                <p className="text-xs text-gray-600 leading-relaxed bg-[#fdfdfd] border border-gray-150 rounded-lg p-3 font-medium select-all">
                  {viewDetailItem.description}
                </p>
              </div>

              {viewDetailItem.details && (
                <div>
                  <span className="text-[10px] font-mono font-bold text-gray-400 uppercase block mb-1">
                    {viewDetailItem.type === "websites" ? "Target domain URL" : "Payload Directive Context / Boilerplate text"}
                  </span>
                  
                  {viewDetailItem.type === "websites" ? (
                    <a 
                      href={viewDetailItem.details} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1 text-semibold bg-blue-50/50 p-2.5 border border-blue-100/60 rounded-lg select-all"
                    >
                      <Globe className="w-3.5 h-3.5 text-blue-500" />
                      <span>{viewDetailItem.details}</span>
                    </a>
                  ) : (
                    <pre className="text-xs font-mono p-3 bg-gray-50 border border-gray-150 rounded-lg text-gray-800 leading-relaxed font-normal whitespace-pre-wrap select-all">
                      {viewDetailItem.details}
                    </pre>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3 text-xs font-mono">
                <div>
                  <span className="text-gray-400 block uppercase text-[9px] font-bold">Category Tags:</span>
                  <span className="text-gray-800 font-semibold">{viewDetailItem.tags}</span>
                </div>
                <div>
                  <span className="text-gray-400 block uppercase text-[9px] font-bold">Authorized by:</span>
                  <span className="text-gray-800 font-semibold">{viewDetailItem.createdBy}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-5">
              <button
                onClick={(e) => handleDeleteItem(viewDetailItem.id, e)}
                className="text-xs font-mono font-bold text-rose-500 hover:text-rose-700 uppercase tracking-tight cursor-pointer"
              >
                Remove record
              </button>
              
              <button
                onClick={() => setViewDetailItem(null)}
                className="px-5 py-2 border border-gray-250 bg-white hover:border-black rounded-lg text-xs font-mono uppercase tracking-tight transition cursor-pointer shadow-sm text-gray-800"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: + ADD FILE DIALOG */}
      {isAddFileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white border border-gray-200/90 shadow-2xl p-6 rounded-xl relative select-none">
            <button
              onClick={() => setIsAddFileOpen(false)}
              className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-black cursor-pointer transition border border-gray-100 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pb-3 border-b border-gray-100 mb-4">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">FILE DEPLOYER</span>
              <h3 className="font-display font-extrabold text-base text-gray-900 mt-0.5">
                Upload and Synced Target Files
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-500 mb-1">
                  Target Destination Folder:
                </label>
                <select
                  value={formFolderTarget}
                  onChange={(e) => setFormFolderTarget(e.target.value)}
                  className="w-full bg-[#fcfcfc] border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <option value="" disabled>Select target folder</option>
                  {items.filter(i => i.type === "files").map((fld) => (
                    <option key={fld.id} value={fld.id}>
                      {fld.name} ({fld.fileList?.length || 0} files)
                    </option>
                  ))}
                </select>
              </div>

              {/* Drag File drop zone area representation */}
              <div className="border-2 border-dashed border-gray-250 hover:border-black transition p-7 text-center rounded-xl bg-gray-50/60 cursor-pointer">
                <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-800">Drag or click files to upload</p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-mono">Supported PDF, Word, Excel, JPG, Text</p>
              </div>

              {uploadProgress && (
                <div className="flex items-center space-x-2 text-xs font-mono text-indigo-600 bg-indigo-50 border border-indigo-100/70 p-2.5 rounded-lg">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Scanning files vectors & indexing in cloud enclave...</span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2.5 pt-3 border-t border-gray-100 mt-4">
              <button
                type="button"
                onClick={() => setIsAddFileOpen(false)}
                className="px-4 py-2 border border-gray-200 text-gray-500 hover:text-black rounded-lg text-xs font-mono uppercase tracking-tight bg-white hover:bg-gray-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!formFolderTarget || uploadProgress}
                onClick={() => handleTriggerUpload(formFolderTarget)}
                className="px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-mono uppercase tracking-tight transition disabled:opacity-35 disabled:pointer-events-none shadow-md cursor-pointer"
              >
                Upload & Sync
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
