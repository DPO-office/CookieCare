import React, { useState, useRef, useEffect } from "react";
import { 
  Folder, 
  FolderPlus, 
  Upload, 
  Play, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Grid, 
  Wand2, 
  Sparkles, 
  RotateCcw, 
  FileText, 
  AlertTriangle, 
  CheckCircle,
  HelpCircle,
  ArrowRight,
  TrendingDown,
  Activity,
  UserCheck,
  ShieldAlert,
  Loader2,
  Trash2,
  Layers,
  FileCode,
  Lock,
  ArrowLeft,
  Send,
  Globe,
  ExternalLink,
  MessageSquare,
  Plus,
  Copy,
  Download,
  Printer
} from "lucide-react";
import { apiUrl } from "../config";
import { LegalDocument } from "../types";

interface InteractAnalyzeProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => Promise<void>;
  onSelectDocument: (doc: LegalDocument | null) => void;
}

interface CustomFolder {
  id: string;
  name: string;
  filesCount: number;
  selected: boolean;
}

interface Message {
  sender: "user" | "gemini";
  text: string;
  sources?: Array<{ title: string; citation: string }>;
  loading?: boolean;
}

export default function InteractAnalyze({ 
  documents, 
  activeDocument, 
  authToken, 
  onRefresh, 
  onSelectDocument 
}: InteractAnalyzeProps) {

  // --- CORE SCREEN CONTROLLER ---
  const [viewMode, setViewMode] = useState<"form" | "report">("form");

  // --- SCREEN A: FORM SELECTION STATE ---
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [promptTab, setPromptTab] = useState<"write" | "library" | "questions">("write");
  const [customPromptText, setCustomPromptText] = useState(
    "Perform a rigorous compliance audit and vulnerability scanning focusing on unannounced server audit entries, unilateral liability exclusions, and punitive liquidated damages."
  );
  const [documentMode, setDocumentMode] = useState<"unified" | "individual">("unified");
  const [answerStyle, setAnswerStyle] = useState<"narrative" | "tabular">("narrative");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);

  // --- SELECTION UTILITY PRESSETS ---
  const [promptLibrary, setPromptLibrary] = useState<any[]>([]);
  const [questionsLibrary, setQuestionsLibrary] = useState<string[]>([]);

  const fetchLibraryItems = async () => {
    try {
      const res = await fetch(apiUrl("/api/library-items"), {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const prompts = data.filter((i: any) => i.type === "prompts").map((p: any) => ({ title: p.name, prompt: p.details }));
        const questions = data.filter((i: any) => i.type === "questions").flatMap((q: any) => q.details.split("\n").filter((l: string) => l.trim()));

        if (prompts.length > 0) setPromptLibrary(prompts);
        else setPromptLibrary([
          { title: "Review Asymmetric Indemnification Liability", prompt: "Analyse whether the clause passes all IP infraction and systemic server delay damages solely onto the client on an asymmetric scale." },
          { title: "SLA Infrastructure Availability Audit", prompt: "Verify uptime compliance thresholds and standard service credits calculations for cloud disruptions." }
        ]);

        if (questions.length > 0) setQuestionsLibrary(questions);
        else setQuestionsLibrary([
          "What is the confidentiality survival duration defined in the text?",
          "Are there any punitive, non-proven liquidated damages listed?"
        ]);
      }
    } catch (err) {
      console.error("Library items fetch failed", err);
    }
  };

  const fetchFoldersAndDocs = async () => {
    try {
      const [foldersRes, docsRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), { headers: { "Authorization": `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/documents"), { headers: { "Authorization": `Bearer ${authToken}` } })
      ]);

      if (foldersRes.ok && docsRes.ok) {
        const foldersData = await foldersRes.json();
        const docsData = await docsRes.json();

        const formattedFolders: CustomFolder[] = foldersData.map((f: any) => ({
          id: f.id,
          name: f.name,
          filesCount: docsData.filter((d: any) => d.folder_id === f.id).length,
          selected: false
        }));

        const rootFilesCount = docsData.filter((d: any) => !d.folder_id).length;
        if (rootFilesCount > 0) {
          formattedFolders.push({
            id: "root",
            name: "Unassigned Vault Files",
            filesCount: rootFilesCount,
            selected: false
          });
        }
        setFolders(formattedFolders);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  useEffect(() => {
    fetchFoldersAndDocs();
    fetchLibraryItems();
  }, [authToken]);

  // --- SIDE PANEL / DRAWER ACTIONS ---
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidePanelType, setSidePanelType] = useState<"folder" | "upload">("folder");
  
  // Create Folder State variables
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderCategory, setNewFolderCategory] = useState("Confidential Enclave");
  const [newFolderTags, setNewFolderTags] = useState("NDA, Scans");
  
  // Upload State variables
  const [uploadSelectedFolder, setUploadSelectedFolder] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");

  // --- SCREEN B: ASSESSMENT REPORT CANVAS STATE ---
  const [activeReportDocName, setActiveReportDocName] = useState("");
  
  const [reportClauses, setReportClauses] = useState<any[]>([]);

  const [activeInspectorClauseId, setActiveInspectorClauseId] = useState<string | null>(null);

  // --- STICKY FOLLOW-UP LAWYER CHAT STATE ---
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // --- ACTION: TOGGLE CHECKBOX FOLDER ---
  const toggleFolderSelection = (id: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
  };

  // --- ACTION: TRIGGERS SIDE DRAWER PANEL ---
  const openSideDrawer = (type: "folder" | "upload") => {
    setSidePanelType(type);
    setIsSidePanelOpen(true);
  };

  // --- ACTION: ADD NEW FOLDER SUBMIT ---
  const handleAddNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch(apiUrl("/api/folders"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ name: newFolderName.trim() })
      });

      if (res.ok) {
        await fetchFoldersAndDocs();
        setNewFolderName("");
        setIsSidePanelOpen(false);
      }
    } catch (err) {
      console.error("Failed to create folder", err);
    }
  };

  // --- ACTION: UPLOAD FILE DRAG / DROP SIMULATOR ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFileName(file.name);
      setSelectedFile(file);
    }
  };

  const handleFileBrowseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setSelectedFile(file);
    }
  };

  const executeUploadSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFileName || !selectedFile) return;

    setIsUploading(true);
    
    try {
      const targetFolder = folders.find(f => f.name === uploadSelectedFolder);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", uploadedFileName);
      if (targetFolder && targetFolder.id !== "root") {
        formData.append("folder_id", targetFolder.id);
      }

      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`
        },
        body: formData
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to process document upload.");

      if (res.status === 202 && payload.job_id) {
        // Use SSE for file upload progress
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "job_update" && data.job.id === payload.job_id) {
            if (data.job.status === "completed") {
              eventSource.close();
              fetchFoldersAndDocs().then(() => { if (onRefresh) onRefresh(); });
              setIsUploading(false);
              setIsSidePanelOpen(false);
            } else if (data.job.status === "failed") {
              eventSource.close();
              setIsUploading(false);
              alert("Processing failed: " + data.job.error);
            }
          }
        };
        return; // Exit early as SSE handles completion
      }

      await fetchFoldersAndDocs();
      if (onRefresh) await onRefresh();

      setUploadedFileName("");
      setSelectedFile(null);
      setIsSidePanelOpen(false);

    } catch (uploadErr: any) {
      console.error("Upload failed", uploadErr.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartAnalysis = async () => {
    const activeSelectedFolders = folders.filter(f => f.selected);
    if (activeSelectedFolders.length === 0) {
      alert("Please select at least one document folder node to analyze.");
      return;
    }
    
    const firstSelected = activeSelectedFolders[0].name;
    setActiveReportDocName(firstSelected);
    setIsAnalyzing(true);

    try {
      const response = await fetch(apiUrl("/api/analyze/interact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          folder_ids: activeSelectedFolders.map(f => f.id),
          prompt: customPromptText,
          documentMode,
          answerStyle,
          history: []
        })
      });

      const data = await response.json();

      setChatMessages([
        {
          sender: "gemini",
          text: data.analysis || `### Executive Legal Assessment for ${firstSelected}\n\nAnalysis complete.`
        }
      ]);

      if (data.clauses) {
        setReportClauses(data.clauses);
      }

      // Transition view mode immediately based on real data receipt
      setViewMode("report");
    } catch (err) {
      console.error("Analysis failed", err);
      setChatMessages([{ sender: "gemini", text: "Failed to perform analysis. Please check your connection." }]);
      setViewMode("report");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    setChatInput("");

    const newMessages: Message[] = [...chatMessages, { sender: "user", text: userText }];
    setChatMessages(newMessages);

    const loadingMessageIdx = newMessages.length;
    setChatMessages(prev => [...prev, { sender: "gemini", text: "Analyzing your query in context of the legal framework...", loading: true }]);

    try {
      const activeSelectedFolders = folders.filter(f => f.selected);
      const response = await fetch(apiUrl("/api/analyze/interact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          folder_ids: activeSelectedFolders.map(f => f.id),
          prompt: userText,
          documentMode,
          answerStyle,
          history: chatMessages.map(m => ({ role: m.sender === "gemini" ? "assistant" : "user", content: m.text }))
        })
      });

      const data = await response.json();

      setChatMessages(prev => {
        const updated = [...prev];
        updated[loadingMessageIdx] = {
          sender: "gemini",
          text: data.analysis || "I have analyzed your request.",
          loading: false
        };
        return updated;
      });

    } catch (err) {
      console.error("Chat failed", err);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[loadingMessageIdx] = {
          sender: "gemini",
          text: "I encountered an error while processing your request. Please try again.",
          loading: false
        };
        return updated;
      });
    }
  };

  const handleCopyReport = () => {
    const latestAISpeech = chatMessages.filter(m => m.sender === "gemini").slice(-1)[0];
    const reportText = latestAISpeech?.text || "";
    navigator.clipboard.writeText(reportText);
    setShowCopyToast(true);
    setTimeout(() => {
      setShowCopyToast(false);
    }, 2000);
  };

  const handleDownloadReport = () => {
    const reportText = chatMessages.map(m => `[${m.sender.toUpperCase()}]\n${m.text}`).join("\n\n");
    const blob = new Blob([reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Legal_Assessment_Memorandum.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const parseBoldText = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="font-extrabold text-black bg-gray-100/85 px-1 py-0.5 rounded-xs">{part}</strong>;
      }
      return part;
    });
  };

  const renderContentText = (text: string) => {
    const lines = text.split("\n");
    return (
      <div className="space-y-4 font-sans text-xs text-gray-700 leading-relaxed select-all">
        {lines.map((line, idx) => {
          let trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-2" />;

          if (trimmed.startsWith("### ")) {
            return (
              <h4 key={idx} className="text-xs font-mono font-black text-gray-950 tracking-wider mt-5 uppercase border-b border-gray-150 pb-1.5 flex items-center space-x-2 select-all">
                <span className="w-1.5 h-1.5 bg-black rounded-full shrink-0" />
                <span>{trimmed.replace("### ", "")}</span>
              </h4>
            );
          }
          if (trimmed.startsWith("## ")) {
            return (
              <h3 key={idx} className="text-sm font-mono font-black text-gray-950 tracking-wide mt-6 uppercase border-b-2 border-gray-900 pb-1.5 select-all">
                {trimmed.replace("## ", "")}
              </h3>
            );
          }
          if (trimmed.startsWith("# ")) {
            return (
              <h2 key={idx} className="text-base font-mono font-black text-gray-950 tracking-tight mt-8 uppercase border-b-4 border-gray-950 pb-2 select-all">
                {trimmed.replace("# ", "")}
              </h2>
            );
          }

          const isListItem = trimmed.startsWith("- ") || trimmed.startsWith("* ");
          if (isListItem) {
            const content = trimmed.substring(2);
            return (
              <div key={idx} className="flex items-start space-x-2.5 ml-4 my-1 select-all">
                <span className="text-black select-none mt-1 shrink-0">•</span>
                <span className="flex-1 text-gray-850 leading-relaxed select-all">
                  {parseBoldText(content)}
                </span>
              </div>
            );
          }

          return (
            <p key={idx} className="leading-relaxed text-gray-850 select-all">
              {parseBoldText(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const filteredFoldersList = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col min-w-0 h-[#calc(100vh-125px)] relative overflow-hidden bg-gray-50 text-gray-900 border-t border-gray-100">
      
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container, .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {isAnalyzing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gray-50/95 p-6 select-none">
          <div className="max-w-md w-full bg-white border border-gray-200/90 p-8 text-center space-y-6 relative overflow-hidden shadow-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500 animate-pulse" />
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-gray-100 border-t-black animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-black animate-pulse" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-mono tracking-widest text-gray-400 font-extrabold uppercase">COGNITIVE COMPLIANCE ENGINE</span>
              <h3 className="text-sm font-mono font-black text-gray-950 uppercase">Analyzing {activeReportDocName}...</h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                Deep-scanning document metadata, cross-referencing regional statutes, and executing multi-agent audit protocols in real-time.
              </p>
            </div>
            <div className="pt-4 border-t border-gray-150 flex items-center justify-center space-x-3 text-[10px] font-mono text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              <span>EXAMINING METADATA STACKS • 100% SECURE</span>
            </div>
          </div>
        </div>
      )}
      
      {viewMode === "form" ? (
        <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full select-none">
          <div className="mb-8 select-all">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-gray-400 uppercase tracking-widest font-black mb-1">
              <Activity className="w-4 h-4 text-black animate-pulse" />
              <span>Workspace Interactive Hub</span>
            </div>
            <h2 className="text-3xl font-display font-bold text-gray-950 tracking-tight">Interact</h2>
            <p className="text-sm text-gray-500 mt-1">Get comprehensive risk assessments, compliance audits, and tailored insights from your folder vaults in seconds.</p>
          </div>

          <div className="space-y-8">
            <div className="bg-white border border-gray-200/90 rounded-none p-6 shadow-xs relative">
              <div className="flex items-center space-x-1.5 mb-2 select-all">
                <span className="w-1.5 h-1.5 rounded-full bg-black block" />
                <h3 className="text-sm font-semibold tracking-tight text-gray-950">1. Select document folders to analyse</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4 ml-3 uppercase font-mono tracking-wider">Choose or upload the workspace folder(s) to load into active cognitive memory</p>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <input
                    type="text"
                    placeholder="Search folder nodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs font-mono border border-gray-200 bg-gray-50/50 px-3 py-2 focus:outline-none focus:border-black rounded-none"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openSideDrawer("upload")}
                    className="bg-white border border-gray-200 hover:border-black text-gray-800 text-xs font-mono font-bold px-3 py-2 transition-all flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-black" />
                    <span>Upload File(s)</span>
                  </button>
                  <button
                    onClick={() => openSideDrawer("folder")}
                    className="bg-black hover:bg-gray-800 text-white text-xs font-mono font-bold px-3.5 py-2 transition-all flex items-center space-x-1.5"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-white" />
                    <span>Create New Folder</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto">
                {filteredFoldersList.length === 0 ? (
                  <div className="col-span-2 text-center p-8 bg-gray-50 text-xs text-gray-400 font-mono italic">
                    No folders match your current search query.
                  </div>
                ) : (
                  filteredFoldersList.map(folder => (
                    <div
                      key={folder.id}
                      onClick={() => toggleFolderSelection(folder.id)}
                      className={`flex items-center justify-between p-3.5 border transition-all cursor-pointer select-none ${
                        folder.selected 
                          ? "border-black bg-gray-50/80 shadow-xs" 
                          : "border-gray-200 bg-white hover:border-gray-400"
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={folder.selected}
                          readOnly
                          className="rounded cursor-pointer accent-black h-3.5 w-3.5 shrink-0"
                        />
                        <Folder className={`w-4 h-4 shrink-0 ${folder.selected ? 'text-black' : 'text-gray-400'}`} />
                        <span className={`text-xs font-bold text-gray-900 truncate ${folder.selected ? 'font-black' : 'font-medium'}`}>{folder.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-[10px] font-mono bg-gray-100 text-gray-550 px-2 py-0.5 rounded-sm font-extrabold">{folder.filesCount} file(s)</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 rotate-270" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200/90 rounded-none p-6 shadow-xs">
              <div className="flex items-center space-x-1.5 mb-2 select-all">
                <span className="w-1.5 h-1.5 rounded-full bg-black block" />
                <h3 className="text-sm font-semibold tracking-tight text-gray-950">2. Write your prompt or select Prompts/Question from the library</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4 ml-3 uppercase font-mono tracking-wider">Configure your audit parameters or apply pre-vetted queries</p>

              <div className="flex border-b border-gray-200 mb-4">
                {(["write", "library", "questions"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setPromptTab(tab)}
                    className={`px-4.5 py-2.5 text-xs font-mono font-black border-b-2 uppercase transition-all whitespace-nowrap cursor-pointer ${
                      promptTab === tab 
                        ? "border-black text-black" 
                        : "border-transparent text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {tab === "write" && "Write your own"}
                    {tab === "library" && "Prompt Library"}
                    {tab === "questions" && "Question Library"}
                  </button>
                ))}
              </div>

              {promptTab === "write" && (
                <div className="flex items-stretch border border-gray-200 rounded-none overflow-hidden bg-gray-50/20">
                  <div className="w-10 bg-gray-100/50 border-r border-gray-150 p-2 font-mono text-xs text-gray-450 text-right select-none font-bold">
                    1
                  </div>
                  <textarea
                    rows={4}
                    value={customPromptText}
                    onChange={(e) => setCustomPromptText(e.target.value)}
                    placeholder="Type your custom prompt or questions here regarding liabilities, survival periods, caps..."
                    className="flex-1 w-full text-xs font-mono bg-transparent p-3 focus:outline-none placeholder-gray-300 resize-none leading-relaxed text-gray-800"
                  />
                </div>
              )}

              {promptTab === "library" && (
                <div className="space-y-2">
                  {promptLibrary.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setCustomPromptText(item.prompt);
                        setPromptTab("write");
                      }}
                      className="p-3 border border-gray-200 bg-white hover:border-black cursor-pointer transition-colors text-xs flex justify-between items-center"
                    >
                      <div className="font-sans font-bold text-gray-900 pr-4">
                        <span>{item.title}</span>
                        <p className="text-[10px] font-mono text-gray-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-sm mt-0.5">{item.prompt}</p>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500 uppercase px-2 py-1 bg-gray-100 hover:bg-black hover:text-white shrink-0 font-bold">[ Apply Prompt ]</span>
                    </div>
                  ))}
                </div>
              )}

              {promptTab === "questions" && (
                <div className="space-y-2">
                  {questionsLibrary.map((q, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setCustomPromptText(q);
                        setPromptTab("write");
                      }}
                      className="p-3 border border-gray-200 bg-white hover:border-black cursor-pointer transition-colors text-xs flex justify-between items-center"
                    >
                      <span className="font-mono text-gray-700">{q}</span>
                      <span className="text-[9px] font-mono text-gray-500 uppercase px-2 py-1 bg-gray-100 shrink-0 font-bold hover:bg-black hover:text-white">[ Use Question ]</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200/90 rounded-none p-6 shadow-xs">
              <div className="flex items-center space-x-1.5 mb-1 select-all">
                <span className="w-1.5 h-1.5 rounded-full bg-black block" />
                <h3 className="text-sm font-bold tracking-tight text-gray-950">
                  3. Choose Document Interaction Mode <span className="text-gray-400 font-normal">ⓘ</span>
                </h3>
              </div>
              <p className="text-xs text-gray-500 mb-4 ml-3 font-sans">
                Choose whether you want to run the prompt/questions through all the selected document(s) together or individually
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-3">
                <div
                  onClick={() => setDocumentMode("unified")}
                  className={`border p-4.5 transition-all cursor-pointer flex items-start space-x-3 ${
                    documentMode === "unified"
                      ? "border-black bg-gray-50/50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      documentMode === "unified" ? "border-black bg-black" : "border-gray-300"
                    }`}>
                      {documentMode === "unified" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 uppercase font-mono">Unified</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">
                      Run your prompt across all selected files as one knowledge source.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setDocumentMode("individual")}
                  className={`border p-4.5 transition-all cursor-pointer flex items-start space-x-3 ${
                    documentMode === "individual"
                      ? "border-black bg-gray-50/50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      documentMode === "individual" ? "border-black bg-black" : "border-gray-300"
                    }`}>
                      {documentMode === "individual" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 uppercase font-mono">Individual</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">
                      Run your prompt on each file separately.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200/90 rounded-none p-6 shadow-xs">
              <div className="flex items-center space-x-1.5 mb-1 select-all">
                <span className="w-1.5 h-1.5 rounded-full bg-black block" />
                <h3 className="text-sm font-bold tracking-tight text-gray-950">
                  4. Choose Answer Style <span className="text-gray-400 font-normal">ⓘ</span>
                </h3>
              </div>
              <p className="text-xs text-gray-500 mb-4 ml-3 font-sans">
                Choose the format of the output, narrative for traditional Q&A style and tabular for rows and columns for questions and documents
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-3">
                <div
                  onClick={() => setAnswerStyle("narrative")}
                  className={`border p-4.5 transition-all cursor-pointer flex items-start space-x-3 ${
                    answerStyle === "narrative"
                      ? "border-black bg-gray-50/50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="mt-1 shrink-0">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      answerStyle === "narrative" ? "border-black bg-black" : "border-gray-300"
                    }`}>
                      {answerStyle === "narrative" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div className="flex items-start space-x-2.5">
                    <div className="w-14 h-11 border border-gray-150 bg-gray-50 p-1.5 flex flex-col justify-between shrink-0 select-none">
                      <div className="h-0.5 bg-gray-300 w-full rounded-xs" />
                      <div className="h-0.5 bg-gray-300 w-3/4 rounded-xs" />
                      <div className="h-0.5 bg-gray-300 w-5/6 rounded-xs" />
                      <div className="h-0.5 bg-gray-300 w-1/2 rounded-xs" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 uppercase font-mono">Narrative</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">
                        All selected files are read together to give a consolidated response in paragraph format.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setAnswerStyle("tabular")}
                  className={`border p-4.5 transition-all cursor-pointer flex items-start space-x-3 ${
                    answerStyle === "tabular"
                      ? "border-black bg-gray-50/50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="mt-1 shrink-0">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      answerStyle === "tabular" ? "border-black bg-black" : "border-gray-300"
                    }`}>
                      {answerStyle === "tabular" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div className="flex items-start space-x-2.5">
                    <div className="w-14 h-11 border border-gray-150 bg-gray-50 p-1 flex flex-col justify-between shrink-0 select-none">
                      <div className="grid grid-cols-3 gap-1 h-1.5">
                        <div className="bg-gray-400 rounded-xs" />
                        <div className="bg-gray-300 rounded-xs" />
                        <div className="bg-gray-300 rounded-xs" />
                      </div>
                      <div className="grid grid-cols-3 gap-1 h-1.5">
                        <div className="bg-gray-400 rounded-xs" />
                        <div className="bg-gray-200 rounded-xs" />
                        <div className="bg-gray-200 rounded-xs" />
                      </div>
                      <div className="grid grid-cols-3 gap-1 h-1.5">
                        <div className="bg-gray-400 rounded-xs" />
                        <div className="bg-gray-200 rounded-xs" />
                        <div className="bg-gray-200 rounded-xs" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 uppercase font-mono">Tabular</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">
                        Selected files are read individually and responses are presented in a structured table format.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleStartAnalysis}
                className="w-full md:w-auto bg-black hover:bg-gray-800 text-white font-mono text-xs font-bold leading-none py-4.5 px-10 flex items-center justify-center space-x-2.5 transition-all select-none shadow-sm cursor-pointer"
              >
                <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 shrink-0" />
                <span className="tracking-wide uppercase font-black">Run Interaction</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30">
          <div className="px-8 py-4 bg-white border-b border-gray-200/80 flex items-center justify-between shrink-0 no-print">
            <button
              onClick={() => setViewMode("form")}
              className="group flex items-center space-x-2.5 text-xs font-mono font-black text-gray-800 hover:text-black cursor-pointer bg-transparent border-0"
            >
              <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-black transition-transform group-hover:-translate-x-0.5" />
              <span className="uppercase tracking-wider">← {activeReportDocName} Report</span>
            </button>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5 text-xs text-gray-500 select-all font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="uppercase font-extrabold text-[10px] bg-black text-white px-2 py-0.5">Lawyer AI Active</span>
              </div>
              <HelpCircle className="w-4.5 h-4.5 text-gray-400 hover:text-black cursor-pointer transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-4xl mx-auto space-y-6">
              
              <div className="bg-white border border-gray-200/90 shadow-sm p-8 md:p-10 relative flex flex-col print-container">
                <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
                
                <div className="text-center border-b border-gray-150 pb-5 mb-6 select-all">
                  <span className="text-[10px] font-mono text-gray-450 font-black tracking-widest uppercase block mb-1">
                    EXPERT LEGAL ASSESSMENT MEMORANDUM
                  </span>
                  <p className="text-[9px] font-mono text-gray-400 select-all">
                    SYSTEM GENERATED COMPLIANCE PROTOCOLS • STRICT CONFIDENTIAL PRIVACY CLASSIFIED
                  </p>
                </div>

                <div className="space-y-6 flex-1">
                  {chatMessages.map((message, idx) => {
                    const isUser = message.sender === "user";
                    return (
                      <div
                        key={idx}
                        className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
                      >
                        <div
                          className={`max-w-3xl rounded-none p-5 text-xs text-gray-900 leading-relaxed font-sans ${
                            isUser
                              ? "bg-black text-white hover:bg-gray-900 shadow-sm font-mono border border-black"
                              : "bg-gray-50/50 border border-gray-200/85 text-gray-900 hover:bg-gray-50 transition-colors select-all w-full"
                          }`}
                        >
                          <div className="border-b border-current opacity-25 pb-1.5 mb-2.5 flex items-center justify-between gap-6 font-mono text-[9px] uppercase font-black tracking-wider">
                            <span>{isUser ? "User Enquiry" : "Personalized Legal AI Attorney"}</span>
                            {!isUser && <Sparkles className="w-3 h-3 text-emerald-600 fill-emerald-600" />}
                          </div>

                          {message.loading ? (
                            <div className="flex items-center space-x-2 text-gray-500 animate-pulse font-mono font-bold">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                              <span>Vetting constitutional precedents and case laws...</span>
                            </div>
                          ) : (
                            <div className="select-all">
                              {isUser ? (
                                <p className="whitespace-pre-wrap leading-relaxed select-all font-mono font-medium">{message.text}</p>
                              ) : (
                                renderContentText(message.text)
                              )}
                            </div>
                          )}

                          {!isUser && message.sources && message.sources.length > 0 && (
                            <div className="mt-3.5 border-t border-dashed border-gray-250 pt-2.5">
                              <span className="text-[9px] font-mono text-gray-450 uppercase font-black tracking-wide block mb-1">
                                Verified Online Legislative Sources:
                              </span>
                              <div className="flex flex-wrap gap-1.5 select-all">
                                {message.sources.map((s, sIdx) => (
                                  <a
                                    key={sIdx}
                                    href={`https://example.com/grounding?q=${encodeURIComponent(s.title)}`}
                                    target="_blank"
                                    referrerPolicy="no-referrer"
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 border border-emerald-200 bg-emerald-50 text-[9px]/tight font-mono font-semibold text-emerald-800 hover:bg-emerald-600 hover:text-white transition-all select-all hover:border-emerald-600"
                                  >
                                    <Globe className="w-2.5 h-2.5 text-emerald-600 shrink-0 select-none" />
                                    <span>{s.title} ({s.citation})</span>
                                    <ExternalLink className="w-2 h-2 shrink-0 select-none opacity-50" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 mt-8 border-t border-gray-250 pt-5 no-print">
                  <button
                    onClick={handleCopyReport}
                    className="flex items-center space-x-2 border border-gray-250 bg-white hover:bg-gray-50 text-gray-750 hover:text-black font-mono text-[10px] font-black uppercase px-3.5 py-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Copy Response</span>
                  </button>

                  <button
                    onClick={handleDownloadReport}
                    className="flex items-center space-x-2 border border-gray-250 bg-white hover:bg-gray-50 text-gray-750 hover:text-black font-mono text-[10px] font-black uppercase px-3.5 py-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Download Findings</span>
                  </button>

                  <button
                    onClick={handlePrintReport}
                    className="flex items-center space-x-2 border border-gray-250 bg-white hover:bg-gray-50 text-gray-750 hover:text-black font-mono text-[10px] font-black uppercase px-3.5 py-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Print Document</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSendChatMessage} className="bg-white border border-gray-250/90 shadow-sm p-3.5 flex items-center space-x-3 no-print">
                <input
                  type="text"
                  placeholder="Ask follow up questions here (e.g. Can you draft a balanced server audit clause?)..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 text-xs border border-gray-200 bg-gray-50/50 px-4 py-3.5 focus:outline-none focus:border-black rounded-none font-mono"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bg-black hover:bg-gray-800 text-white font-mono text-xs font-bold leading-none p-3.5 border border-black transition-all flex items-center justify-center shrink-0 disabled:opacity-45 cursor-pointer hover:translate-x-1"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </form>
            </div>
          </div>

          {showCopyToast && (
            <div className="fixed bottom-6 right-6 z-50 bg-black text-white text-[10px] font-mono uppercase tracking-widest font-black px-4 py-2.5 shadow-xl border border-gray-805 animate-fade-in select-none">
              <span>✓ Text copied successfully</span>
            </div>
          )}
        </div>
      )}

      {isSidePanelOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity animate-fade-in"
            onClick={() => setIsSidePanelOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 max-w-full flex select-all">
            <div className="w-96 bg-white shadow-2xl flex flex-col h-full transform transition-transform duration-300 translate-x-0 relative">
              <div className="p-5 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
                <div className="select-all">
                  <h4 className="text-sm font-semibold tracking-tight text-gray-950 uppercase font-mono">
                    {sidePanelType === "folder" ? "Create New Folder" : "Upload File(s)"}
                  </h4>
                  <p className="text-[10px] text-gray-500 leading-normal mt-0.5">
                    {sidePanelType === "folder" ? "Establish a new folder node inside the workspace" : "Select files and add tags to upload"}
                  </p>
                </div>
                <button
                  onClick={() => setIsSidePanelOpen(false)}
                  className="font-mono text-xs font-extrabold uppercase p-2 border border-gray-250 hover:bg-black hover:text-white shrink-0 cursor-pointer text-gray-550 select-none"
                >
                  X
                </button>
              </div>

              {sidePanelType === "folder" ? (
                <form onSubmit={handleAddNewFolder} className="flex-1 p-5 space-y-5 flex flex-col justify-between select-all">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-gray-400 uppercase font-bold block select-none">Folder Node Name</label>
                      <input
                        type="text"
                        required
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="e.g. CD PR Agreement"
                        className="w-full text-xs font-mono border border-gray-205 bg-gray-50/20 px-3 py-2.5 focus:outline-none focus:border-black rounded-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-black hover:bg-gray-800 text-white font-mono text-xs font-bold leading-none py-4 border border-black uppercase flex items-center justify-center space-x-2.5 transition-all select-none shadow-sm cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-white" />
                    <span>Create Folder Node</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={executeUploadSubmission} className="flex-1 p-5 space-y-5 flex flex-col justify-between select-all">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-gray-400 uppercase font-bold block select-none">Target Vault Folder</label>
                      <select
                        value={uploadSelectedFolder}
                        onChange={(e) => setUploadSelectedFolder(e.target.value)}
                        className="w-full text-xs border border-gray-205 bg-white p-2.5 text-gray-950 font-semibold focus:outline-none focus:border-black font-sans cursor-pointer"
                      >
                        <option value="">Select a folder...</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-gray-400 uppercase font-bold block select-none">Ingest Upload File</label>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border border-dashed p-6 text-center select-none rounded transition-all flex flex-col items-center justify-center cursor-pointer ${
                          isDraggingFile 
                            ? "border-emerald-500 bg-emerald-50" 
                            : "border-gray-200 bg-gray-50/40 hover:bg-gray-100/30"
                        }`}
                      >
                        <Upload className="w-6 h-6 text-gray-400 mb-2 select-none" />
                        <p className="text-[10px] font-bold text-gray-800 uppercase font-mono">Drag File Here</p>
                        <label className="inline-block mt-3 font-mono text-[9px] font-black border border-black bg-white px-2 py-1 hover:bg-black hover:text-white transition-colors cursor-pointer select-none">
                          <span>Browse vault</span>
                          <input
                            type="file"
                            accept=".txt,.md,.json,.pdf,.docx,.csv"
                            onChange={handleFileBrowseChange}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {uploadedFileName && (
                        <div className="p-2 border border-emerald-300 bg-emerald-50 text-[10px] font-mono text-emerald-800 flex items-center justify-between select-none">
                          <span className="truncate flex-1 font-bold">{uploadedFileName}</span>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!uploadedFileName || isUploading || !uploadSelectedFolder}
                    className="w-full bg-black hover:bg-gray-800 text-white font-mono text-xs font-bold leading-none py-4 border border-black uppercase flex items-center justify-center space-x-2.5 transition-all select-none shadow-sm disabled:opacity-40 cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Uploading files...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-white" />
                        <span>Upload File Nodes</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
