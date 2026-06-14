import React, { useState, useRef, useEffect } from "react";
import {
  Scale,
  Search,
  MessageSquare,
  BookOpen,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  FolderOpen,
  Globe,
  Loader2,
  History,
  Info,
  ShieldCheck,
  Gavel,
  X,
  FileText,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * PrivSecAI: Ask AI Lawyer
 * A specialized research portal for statutory consulting and compliance guidance.
 */

// UI Types
interface FolderRepo {
  id: string;
  name: string;
  isSelected: boolean;
  files: { name: string; content: string }[];
}

interface SourceNode {
  id: string;
  title: string;
  citation: string;
  jurisdiction: string;
  documentType: string;
  officialCopy: string;
}

interface AskAILawyerProps {
  documents: any[];
  authToken: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const apiUrl = (path: string) => `${API_URL}${path}`;

export default function AskAILawyer({ documents, authToken }: AskAILawyerProps) {
  // 1. STATE MANAGEMENT
  const [searchQuery, setSearchQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResult, setStreamedResult] = useState("");
  const [matchedSources, setMatchedSources] = useState<SourceNode[]>([]);
  const [activeCitationModal, setActiveCitationModal] = useState<SourceNode | null>(null);

  // Filter & Meta States
  const [selectedJurisdictions, setSelectedJurisdictions] = useState(["US (Federal)", "GDPR (EU)"]);
  const [selectedFormat, setSelectedFormat] = useState("Standard Advisory");

  // Repository Management
  const [folders, setFolders] = useState<FolderRepo[]>([
    { id: "f-1", name: "Corporate Master Policies", isSelected: true, files: [] },
    { id: "f-2", name: "Privacy Playbooks 2026", isSelected: false, files: [] }
  ]);
  const [webDiscoveryUrls, setWebDiscoveryUrls] = useState<string[]>([]);
  const [newUrlInput, setNewUrlInput] = useState("");

  // Stepper UI progress state
  const [stepperPhase, setStepperPhase] = useState<"idle" | "division" | "retrieval" | "synthesis" | "completed">("idle");
  const [stepperMessage, setStepperMessage] = useState("");

  const [isCopied, setIsCopied] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 2. LIFECYCLE
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedResult]);

  // 3. REPOSITORY ACTIONS
  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = prompt("Enter folder name:");
    if (name) {
      setFolders([...folders, {
        id: "f-" + Math.random().toString(36).substr(2, 5),
        name,
        isSelected: false,
        files: []
      }]);
    }
  };

  const toggleFolder = (id: string) => {
    setFolders(folders.map(f => f.id === id ? { ...f, isSelected: !f.isSelected } : f));
  };

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(folders.filter(f => f.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Simulate upload/processing delay
    const targetFolderId = folders.find(f => f.isSelected)?.id || folders[0].id;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const content = ev.target?.result as string;
        setFolders(prev => prev.map(f => f.id === targetFolderId ? {
          ...f,
          files: [...f.files, { name: file.name, content }]
        } : f));
      };
      reader.readAsText(file);
    }
  };

  const handleAddWebUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrlInput.trim()) return;
    try {
      new URL(newUrlInput);
      setWebDiscoveryUrls([...webDiscoveryUrls, newUrlInput]);
      setNewUrlInput("");
    } catch {
      alert("Please enter a valid URL.");
    }
  };

  // 4. CORE SEARCH DISPATCH
  const handleQueryDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamedResult("");
    setMatchedSources([]);
    setStepperPhase("division");
    setStepperMessage("Phase 1: Partitioning legal queries, rephrasing regulatory intents, and aligning lexical structures...");

    const activeSelectedFiles = folders
      .filter(f => f.isSelected)
      .flatMap(f => f.files.map(file => ({ name: file.name, content: file.content })));

    try {
      const response = await fetch(apiUrl("/api/lawyer/ask"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          prompt: searchQuery,
          jurisdiction: selectedJurisdictions,
          outputFormat: selectedFormat,
          webContext: webDiscoveryUrls,
          documents: activeSelectedFiles
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Advisory system failed to respond cleanly.");

      if (response.status === 202 && data.job_id) {
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));

        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            const job = payload.job;
            setStepperMessage(`Progress: ${job.message}`);

            if (job.status === "completed") {
              const result = job.result;
              // RAG Phase 2: Update UI with result and citation sources
              setStreamedResult(result.answer || result.text);
              if (result.sources) {
                setMatchedSources(result.sources);
              }
              setStepperPhase("completed");
              setStepperMessage("Analysis complete.");
              setIsStreaming(false);
              eventSource.close();
            } else if (job.status === "failed") {
              setIsStreaming(false);
              setStreamedResult(`**Error:** ${job.error || "Job failed"}`);
              eventSource.close();
            }
          }
        };

        eventSource.onerror = (err) => {
          console.error("SSE connection error:", err);
          eventSource.close();
          setIsStreaming(false);
        };
      }
    } catch (err: any) {
      console.error(err);
      setStepperPhase("idle");
      setStepperMessage("");
      setStreamedResult(`**System Connection Interrupted**\n\nThere was an issue communicating with the legal intelligence engine. Error: ${err.message}`);
      setIsStreaming(false);
    }
  };

  // 5. COPY UTILITY
  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(streamedResult);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const triggerExport = (format: string) => {
    setExportMessage(`Generating ${format} artifact for legal records...`);
    setTimeout(() => setExportMessage(""), 3000);
  };

  // 6. FORMATTED MARKDOWN RENDERER
  const renderFormattedResult = (text: string) => {
    if (!text) return null;

    // Split text by citations like [Source 1] to highlight them
    const parts = text.split(/(\[Source \d+\])/g);

    return (
      <div className="space-y-4 text-sm leading-relaxed text-gray-800 font-sans">
        {parts.map((part, i) => {
          const match = part.match(/\[Source (\d+)\]/);
          if (match) {
            const sourceIndex = parseInt(match[1]);
            const source = matchedSources.find(s => s.citation === `Source ${sourceIndex}`);
            return (
              <span
                key={i}
                onClick={() => source && setActiveCitationModal(source)}
                className="inline-flex items-center px-1.5 py-0.5 bg-black text-white text-[10px] font-mono rounded-sm mx-0.5 cursor-pointer hover:bg-gray-800 transition-colors"
                title={source?.title || "Click to view source"}
              >
                {part}
              </span>
            );
          }

          // Simple Markdown simulation for rendering
          return part.split("\n").map((line, idx) => {
            if (line.startsWith("###")) return <h3 key={idx} className="text-base font-bold text-black mt-6 mb-2 border-l-4 border-black pl-3 uppercase tracking-tight font-mono">{line.replace("###", "")}</h3>;
            if (line.startsWith("##")) return <h2 key={idx} className="text-lg font-extrabold text-black mt-8 mb-4 border-b-2 border-black pb-1 uppercase tracking-tighter">{line.replace("##", "")}</h2>;
            if (line.startsWith("#")) return <h1 key={idx} className="text-xl font-black text-black mt-10 mb-6 uppercase tracking-tighter bg-black text-white px-3 py-1 inline-block">{line.replace("#", "")}</h1>;
            if (line.startsWith("- ") || line.startsWith("* ")) return <li key={idx} className="ml-5 list-disc mb-1.5 pl-1">{line.substring(2)}</li>;
            if (line.trim() === "") return <div key={idx} className="h-2" />;
            return <p key={idx} className="mb-3">{line}</p>;
          });
        })}
      </div>
    );
  };

  // 7. RENDER COMPONENT
  return (
    <div className="flex flex-col h-full bg-[#f9f9f9] overflow-hidden select-none">
      
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: RESEARCH PARAMETERS & SOURCES */}
        <div className="w-85 border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto p-6 space-y-8">
          
          {/* Research Repositories */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" /> Discovery Repositories
              </span>
              <button
                onClick={handleAddFolder}
                className="p-1 hover:bg-gray-100 rounded-md transition text-gray-400 hover:text-black cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {folders.map(folder => (
                <div 
                  key={folder.id}
                  onClick={() => toggleFolder(folder.id)}
                  className={`group flex items-center justify-between p-3 border-2 transition-all cursor-pointer ${
                    folder.isSelected
                      ? "border-black bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                      : "border-gray-150 bg-gray-50/50 grayscale hover:grayscale-0 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-sm ${folder.isSelected ? "bg-black text-white" : "bg-gray-200 text-gray-400"}`}>
                      <FolderOpen className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${folder.isSelected ? "text-black" : "text-gray-500"}`}>{folder.name}</p>
                      <p className="text-[10px] font-mono text-gray-400 uppercase tracking-tight">
                        {folder.files.length} Document Vectors
                      </p>
                    </div>
                  </div>
                  {folder.isSelected && (
                    <button
                      onClick={(e) => handleDeleteFolder(folder.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Inline file upload placeholder */}
            <label className="block mt-4">
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
              <div className="border-2 border-dashed border-gray-200 p-4 text-center hover:border-black hover:bg-gray-50 transition cursor-pointer flex flex-col items-center">
                <Plus className="w-5 h-5 text-gray-300 mb-1" />
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-tight">Attach Legal Artifacts</span>
              </div>
            </label>
          </div>

          {/* Web Knowledge Connect */}
          <div className="space-y-4">
            <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Globe className="w-3.5 h-3.5" /> Knowledge Connect
            </span>
            <form onSubmit={handleAddWebUrl} className="relative">
              <input
                type="text"
                value={newUrlInput}
                onChange={(e) => setNewUrlInput(e.target.value)}
                placeholder="https://official-gazette.gov/..."
                className="w-full bg-gray-50 border-2 border-gray-150 p-2.5 pl-3 text-xs font-mono focus:outline-none focus:border-black transition"
              />
              <button type="submit" className="absolute right-2 top-2 text-gray-400 hover:text-black transition">
                <Plus className="w-4 h-4" />
              </button>
            </form>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {webDiscoveryUrls.map((url, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 text-[10px] font-mono text-gray-500 truncate">
                  <div className="flex items-center space-x-2 truncate">
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{url}</span>
                  </div>
                  <button onClick={() => setWebDiscoveryUrls(webDiscoveryUrls.filter((_, idx) => idx !== i))} className="hover:text-rose-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Statutory Scoping */}
          <div className="space-y-4">
            <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Statutory Scope
            </span>
            <div className="flex flex-wrap gap-2">
              {["US (Federal)", "GDPR (EU)", "CCPA (CA)", "UK GDPR", "DPDP (India)", "LGPD (BR)"].map(reg => (
                <button
                  key={reg}
                  onClick={() => setSelectedJurisdictions(prev =>
                    prev.includes(reg) ? prev.filter(p => p !== reg) : [...prev, reg]
                  )}
                  className={`px-2.5 py-1.5 text-[10px] font-mono uppercase border-2 transition ${
                    selectedJurisdictions.includes(reg) ? "bg-black text-white border-black" : "bg-white text-gray-400 border-gray-150 hover:border-gray-300"
                  }`}
                >
                  {reg}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* MIDDLE COLUMN: ADVISORY VIEWPORT */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
          
          {/* TOP RESEARCH HEADER */}
          <div className="px-8 py-6 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="bg-black text-white p-2">
                  <Gavel className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight">Official Advisory Research</h2>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Authorized Counsel Mode • Encrypted V-RAG Channel</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <div className="flex items-center px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 mr-2" />
                  <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase">Enclave Verified</span>
                </div>
              </div>
            </div>

            {/* MAIN INPUT DISPATCHER */}
            <form onSubmit={handleQueryDispatch} className="relative group">
              <div className="absolute inset-0 bg-black translate-x-1 translate-y-1 group-focus-within:translate-x-1.5 group-focus-within:translate-y-1.5 transition-all" />
              <div className="relative flex border-3 border-black bg-white overflow-hidden transition-all group-focus-within:translate-x-0.5 group-focus-within:translate-y-0.5">
                <div className="p-4 flex items-center justify-center text-gray-400 border-r-3 border-black">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ask a legal query: 'Do these DPA terms violate GDPR data sovereignty?'"
                  className="flex-1 px-5 py-4 text-sm font-sans font-medium focus:outline-none placeholder-gray-400"
                  disabled={isStreaming}
                />
                <button
                  type="submit"
                  disabled={isStreaming || !searchQuery.trim()}
                  className={`px-8 font-mono font-black text-xs uppercase tracking-widest transition cursor-pointer ${
                    isStreaming ? "bg-gray-100 text-gray-400" : "bg-black text-white hover:bg-gray-800"
                  }`}
                >
                  {isStreaming ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Initiate Briefing"}
                </button>
              </div>
            </form>
          </div>

          {/* DYNAMIC RESULTS STAGE */}
          <div className="flex-1 flex overflow-hidden">
            
            {/* LEFT SPLIT COLUMN: ADVISORY TEXT CANVAS */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white border-r border-gray-200">
              
              {/* Stepper Status Bar */}
              {(stepperPhase !== "idle") && (
                <div className="bg-gray-50 border-b border-gray-100 px-8 py-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-4">
                    <div className="flex space-x-1">
                      {["division", "retrieval", "synthesis", "completed"].map((phase, i) => (
                        <div
                          key={phase}
                          className={`w-2 h-2 rounded-full transition-all duration-500 ${
                            stepperPhase === phase ? "bg-black scale-125" : i < ["division", "retrieval", "synthesis", "completed"].indexOf(stepperPhase) ? "bg-black" : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tight italic">
                      {stepperMessage}
                    </span>
                  </div>
                  {stepperPhase === "completed" && (
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={handleCopyMarkdown}
                        className="px-2.5 py-1 border border-gray-300 bg-white hover:border-black text-[10px] font-mono text-gray-700 flex items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        {isCopied ? <Check className="w-3 h-3 text-black" /> : <Copy className="w-3 h-3 text-gray-400" />}
                        <span>{isCopied ? "Copied" : "Copy MD"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerExport("PDF")}
                        className="px-2.5 py-1 border border-gray-300 bg-white hover:border-black text-[10px] font-mono text-gray-700 flex items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <Download className="w-3 h-3 text-gray-400" />
                        <span>PDF Print</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {exportMessage && (
                <div className="bg-black text-white p-2.5 text-xs font-mono text-center shrink-0">
                  {exportMessage}
                </div>
              )}

              {/* TEXT AREA CANVAS */}
              <div className="flex-1 overflow-y-auto p-8 md:p-12">
                <div className="max-w-3xl mx-auto">
                  {!streamedResult && !isStreaming ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20 grayscale">
                      <Scale className="w-16 h-16 mb-6 text-gray-300" />
                      <h3 className="text-lg font-black uppercase tracking-tighter">Waiting for Dispatch</h3>
                      <p className="max-w-xs text-xs font-mono mt-2 leading-relaxed">Provide a legal query above to begin secure vector retrieval and advisory synthesis.</p>
                    </div>
                  ) : (
                    <div className="select-text selection:bg-black selection:text-white pb-20">
                      {renderFormattedResult(streamedResult)}
                      {isStreaming && (
                        <div className="flex items-center space-x-2 text-gray-400 mt-6 font-mono text-[10px] italic animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Advisory node formulating professional legal stance...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div ref={chatBottomRef} />
              </div>

            </div>

            {/* RIGHT SPLIT COLUMN: CITATION DRAWER */}
            <div className="w-80 bg-gray-50/50 overflow-y-auto p-6 shrink-0 flex flex-col border-l border-gray-100">
              <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-6">
                <div className="flex items-center space-x-2">
                  <BookmarkCheck className="w-5 h-5 text-black" />
                  <span className="text-xs font-black font-mono uppercase tracking-wider text-black">
                    Statutory Source Vault
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-black text-white px-2 py-0.5 uppercase font-bold">
                  {matchedSources.length} Hit
                </span>
              </div>

              {matchedSources.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center grayscale opacity-50">
                  <BookOpen className="w-10 h-10 mb-4 text-gray-300" />
                  <p className="text-[10px] font-mono text-gray-400 leading-normal uppercase">
                    Cited statutory excerpts will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  <p className="text-[9px] font-mono text-gray-400 leading-normal uppercase mb-2 italic">
                    Evidence verified via RAG Enclave retrieval:
                  </p>
                  
                  {matchedSources.map((source) => (
                    <div 
                      key={source.id}
                      onClick={() => setActiveCitationModal(source)}
                      className="group border-2 border-black p-4 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-pointer flex flex-col gap-3 relative overflow-hidden"
                    >
                      {/* Decorative accent */}
                      <div className="absolute top-0 left-0 w-1 h-full bg-black" />

                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold bg-black text-white px-2 py-0.5 uppercase tracking-tighter">
                          {source.documentType}
                        </span>
                        <span className="text-[9px] font-mono text-black font-black italic">
                          {source.citation}
                        </span>
                      </div>

                      <h4 className="text-[11px] font-bold text-gray-900 font-sans tracking-tight leading-snug line-clamp-2 uppercase">
                        {source.title}
                      </h4>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="text-[9px] font-mono text-gray-400 font-bold uppercase tracking-widest">
                          {source.jurisdiction}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-black group-hover:scale-110 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-gray-200 text-[10px] font-mono text-gray-400 leading-normal italic text-center">
                *Sources are cross-referenced across PrivSecAI proprietary vector nodes.
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* DOCUMENT SOURCE VIEWPORT MODAL */}
      <AnimatePresence>
        {activeCitationModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md select-text"
            onClick={() => setActiveCitationModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.98, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border-4 border-black w-full max-w-2xl h-150 flex flex-col shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
            >
              {/* Modal header */}
              <div className="p-5 border-b-4 border-black flex items-center justify-between bg-black text-white">
                <div className="flex items-center space-x-3">
                  <div className="bg-white p-1">
                    <BookOpen className="w-5 h-5 text-black" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase text-gray-400 font-black tracking-widest">Official Source Extract</span>
                    <h3 className="text-xs font-black font-mono uppercase tracking-tighter text-white">
                      {activeCitationModal.citation}: {activeCitationModal.title}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCitationModal(null)}
                  className="bg-white text-black p-1.5 hover:bg-gray-200 transition border-2 border-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                >
                  <X className="w-5 h-5 font-black" />
                </button>
              </div>

              {/* Source properties header */}
              <div className="px-6 py-4 border-b-2 border-gray-100 bg-gray-50 flex justify-between items-center text-[11px] font-mono text-gray-500">
                <div className="flex gap-6">
                  <div><strong>SCOPE:</strong> <span className="text-black font-bold uppercase">{activeCitationModal.jurisdiction}</span></div>
                  <div><strong>CLASSIFICATION:</strong> <span className="text-black font-bold uppercase">{activeCitationModal.documentType}</span></div>
                </div>
                <div className="flex items-center gap-2 text-indigo-600 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>SECURE HASH VERIFIED</span>
                </div>
              </div>

              {/* Content body */}
              <div className="flex-1 overflow-y-auto p-8 font-sans text-sm text-gray-800 leading-relaxed bg-white selection:bg-black selection:text-white">
                <div className="p-6 border-2 border-gray-100 bg-gray-50/30 font-mono text-xs whitespace-pre-wrap mb-6 leading-relaxed italic">
                  {activeCitationModal.officialCopy}
                </div>
                <div className="text-[11px] text-gray-400 font-mono uppercase tracking-widest font-bold pb-8 border-b border-gray-100 mb-8">
                  --- END OF SOURCE EXCERPT ---
                </div>
              </div>

              {/* Modal action bar */}
              <div className="p-5 border-t-4 border-black bg-white flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activeCitationModal.officialCopy);
                    alert("Citation excerpt copied to secure buffer.");
                  }}
                  className="bg-white text-black px-5 py-2.5 border-3 border-black text-xs font-black font-mono uppercase hover:bg-gray-100 transition shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none translate-y-[-2px] hover:translate-y-[-4px] cursor-pointer"
                >
                  <Copy className="w-4 h-4 inline-block mr-2" />
                  <span>Copy Excerpt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCitationModal(null)}
                  className="bg-black text-white px-5 py-2.5 border-3 border-black text-xs font-black font-mono uppercase hover:bg-gray-800 transition shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none translate-y-[-2px] hover:translate-y-[-4px] cursor-pointer"
                >
                  <span>Close Vault</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
