import React, { useState, useRef, useEffect } from "react";
import { 
  Folder, 
  FolderPlus, 
  Upload, 
  Play, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  FileText, 
  CheckCircle,
  HelpCircle,
  ArrowLeft,
  Send,
  Globe,
  ExternalLink,
  Plus,
  Copy,
  Download,
  Printer,
  FileCode,
  Loader2
} from "lucide-react";
import { apiUrl } from "../config";
import { LegalDocument } from "../types";
import AiProgressOverlay from "./AiProgressOverlay";

interface InteractAnalyzeProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => Promise<void>;
  onSelectDocument: (doc: LegalDocument | null) => void;
}

interface FolderFile {
  id: string;
  title: string;
  selected: boolean;
}

interface CustomFolder {
  id: string;
  name: string;
  filesCount: number;
  selected: boolean;
  expanded: boolean;
  files: FolderFile[];
}

interface SavedDraft {
  id: string;
  title: string;
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
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [savedDraftsExpanded, setSavedDraftsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [promptTab, setPromptTab] = useState<"write" | "library" | "questions">("write");
  const [customPromptText, setCustomPromptText] = useState(
    "Perform a rigorous compliance audit and vulnerability scanning focusing on unannounced server audit entries, unilateral liability exclusions, and punitive liquidated damages."
  );
  const [documentMode, setDocumentMode] = useState<"unified" | "individual">("unified");
  const [answerStyle, setAnswerStyle] = useState<"narrative" | "tabular">("narrative");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [analysisError, setAnalysisError] = useState("");
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

  const SYSTEM_FOLDER_NAME = "Uploaded Documents";

  const fetchFoldersAndDocs = async () => {
    try {
      const [foldersRes, docsRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), { headers: { "Authorization": `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/documents"), { headers: { "Authorization": `Bearer ${authToken}` } })
      ]);

      if (foldersRes.ok && docsRes.ok) {
        const foldersData = await foldersRes.json();
        const docsData = await docsRes.json();

        // Filter out the system "Uploaded Documents" folder â€” only show user-created folders
        const userFolders = foldersData.filter((f: any) => f.name !== SYSTEM_FOLDER_NAME);

        setFolders(prev => {
          return userFolders.map((f: any) => {
            const existing = prev.find(p => p.id === f.id);
            const folderDocs = docsData.filter((d: any) => d.folder_id === f.id);
            return {
              id: f.id,
              name: f.name,
              filesCount: folderDocs.length,
              selected: existing?.selected ?? false,
              expanded: existing?.expanded ?? false,
              files: folderDocs.map((d: any) => ({
                id: d.id,
                title: d.title,
                // Preserve selection state if already present, otherwise match folder selection
                selected: existing?.files.find(fi => fi.id === d.id)?.selected ?? (existing?.selected ?? false)
              }))
            } as CustomFolder;
          });
        });

        // Populate saved drafts (type === "draft"), preserving existing selection state
        const drafts = docsData.filter((d: any) => d.type === "draft");
        setSavedDrafts(prev => drafts.map((d: any) => ({
          id: d.id,
          title: d.title,
          selected: prev.find(p => p.id === d.id)?.selected ?? false
        })));
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

  // --- ACTION: TOGGLE CHECKBOX FOLDER (selects/deselects all files inside) ---
  const toggleFolderSelection = (id: string) => {
    setFolders(prev => prev.map(f => {
      if (f.id !== id) return f;
      const newSelected = !f.selected;
      return {
        ...f,
        selected: newSelected,
        files: f.files.map(fi => ({ ...fi, selected: newSelected }))
      };
    }));
  };

  // --- ACTION: TOGGLE EXPAND / COLLAPSE FOLDER ---
  const toggleFolderExpanded = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(prev => prev.map(f => f.id === id ? { ...f, expanded: !f.expanded } : f));
  };

  // --- ACTION: TOGGLE INDIVIDUAL FILE SELECTION ---
  const toggleFileSelection = (folderId: string, fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(prev => prev.map(f => {
      if (f.id !== folderId) return f;
      const updatedFiles = f.files.map(fi => fi.id === fileId ? { ...fi, selected: !fi.selected } : fi);
      const allSelected = updatedFiles.length > 0 && updatedFiles.every(fi => fi.selected);
      return { ...f, files: updatedFiles, selected: allSelected };
    }));
  };

  // --- ACTION: TOGGLE SAVED DRAFT SELECTION ---
  const toggleDraftSelection = (id: string) => {
    setSavedDrafts(prev => prev.map(d => d.id === id ? { ...d, selected: !d.selected } : d));
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
    
    let waitingForJob = false;
    try {
      const targetFolder = folders.find(f => f.name === uploadSelectedFolder);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", uploadedFileName);
      // Always send a real folder_id. If none selected, let the backend resolve
      // the "Uploaded Documents" default folder (no folder_id = backend default).
      if (targetFolder) {
        formData.append("folder_id", targetFolder.id);
      }
      // (no folder_id sent â†’ backend will assign to "Uploaded Documents")

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
        waitingForJob = true;
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
        eventSource.onerror = () => {
          eventSource.close();
          setIsUploading(false);
          alert("Processing failed: job connection interrupted");
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
      if (!waitingForJob) setIsUploading(false);
    }
  };

  const handleStartAnalysis = async () => {
    const activeSelectedFolders = folders.filter(f => f.selected || f.files.some(fi => fi.selected));
    const activeSelectedDrafts = savedDrafts.filter(d => d.selected);
    if (activeSelectedFolders.length === 0 && activeSelectedDrafts.length === 0) {
      alert("Please select at least one document folder or saved draft to analyze.");
      return;
    }
    
    const firstSelected = activeSelectedFolders.length > 0
      ? activeSelectedFolders[0].name
      : activeSelectedDrafts[0].title;
    setActiveReportDocName(firstSelected);
    setIsAnalyzing(true);
    setAnalysisProgress("Preparing analysis request...");
    setAnalysisError("");

    let waitingForJob = false;
    try {
      setAnalysisProgress("Sending request to AI...");
      const response = await fetch(apiUrl("/api/analyze/interact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          folderIds: activeSelectedFolders.map(f => f.id),
          draftIds: activeSelectedDrafts.map(d => d.id),
          prompt: customPromptText,
          documentMode,
          answerStyle,
          history: []
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      if (response.status === 202 && data.job_id) {
        waitingForJob = true;
        setAnalysisProgress("Uploading documents to AI engine...");
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            // Show real-time message from the backend job
            if (payload.job.message) {
              setAnalysisProgress(payload.job.message);
            }
            if (payload.job.status === "completed") {
              const result = typeof payload.job.result === "string"
                ? { analysis: payload.job.result, clauses: [] }
                : payload.job.result;
              setChatMessages([
                {
                  sender: "gemini",
                  text: result.analysis || `### Executive Legal Assessment for ${firstSelected}\n\nAnalysis complete.`
                }
              ]);
              if (result.clauses) setReportClauses(result.clauses);
              setViewMode("report");
              setIsAnalyzing(false);
              setAnalysisProgress("");
              eventSource.close();
            } else if (payload.job.status === "failed") {
              eventSource.close();
              setAnalysisError(payload.job.error || "Analysis failed. Please try again.");
              setIsAnalyzing(false);
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setAnalysisError("Connection to AI engine was interrupted. Please retry.");
          setIsAnalyzing(false);
        };
      }
    } catch (err: any) {
      console.error("Analysis failed", err);
      setAnalysisError(err.message || "Failed to perform analysis. Please check your connection.");
      setIsAnalyzing(false);
    } finally {
      if (!waitingForJob) setIsAnalyzing(false);
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
      const activeSelectedDrafts = savedDrafts.filter(d => d.selected);
      const response = await fetch(apiUrl("/api/analyze/interact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          folderIds: activeSelectedFolders.map(f => f.id),
          draftIds: activeSelectedDrafts.map(d => d.id),
          prompt: userText,
          documentMode,
          answerStyle,
          history: chatMessages.map(m => ({ role: m.sender === "gemini" ? "assistant" : "user", content: m.text }))
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (response.status === 202 && data.job_id) {
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            if (payload.job.status === "completed") {
              const result = typeof payload.job.result === "string"
                ? { analysis: payload.job.result }
                : payload.job.result;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[loadingMessageIdx] = {
                  sender: "gemini",
                  text: result.analysis || "Analysis complete.",
                  loading: false
                };
                return updated;
              });
              eventSource.close();
            } else if (payload.job.status === "failed") {
              eventSource.close();
              setChatMessages(prev => {
                const updated = [...prev];
                updated[loadingMessageIdx] = {
                  sender: "gemini",
                  text: payload.job.error || "Analysis failed.",
                  loading: false
                };
                return updated;
              });
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setChatMessages(prev => {
            const updated = [...prev];
            updated[loadingMessageIdx] = {
              sender: "gemini",
              text: "Analysis connection interrupted. Please try again.",
              loading: false
            };
            return updated;
          });
        };
      }
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
        return <strong key={i} className="font-semibold text-gray-900">{part}</strong>;
      }
      return part;
    });
  };

  const renderContentText = (text: string) => {
    const lines = text.split("\n");
    return (
      <div className="space-y-3 text-[13px] text-gray-700 leading-relaxed select-all">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-1.5" />;

          if (trimmed.startsWith("### ")) {
            return (
              <h4 key={idx} className="text-[13px] font-semibold text-gray-800 mt-5 mb-1.5 select-all">
                {trimmed.replace("### ", "")}
              </h4>
            );
          }
          if (trimmed.startsWith("## ")) {
            return (
              <h3 key={idx} className="text-[14px] font-semibold text-gray-900 mt-6 mb-2 select-all">
                {trimmed.replace("## ", "")}
              </h3>
            );
          }
          if (trimmed.startsWith("# ")) {
            return (
              <h2 key={idx} className="text-[15px] font-semibold text-gray-900 mt-7 mb-2 select-all">
                {trimmed.replace("# ", "")}
              </h2>
            );
          }

          const isListItem = trimmed.startsWith("- ") || trimmed.startsWith("* ");
          if (isListItem) {
            const content = trimmed.substring(2);
            return (
              <div key={idx} className="flex items-start gap-2.5 ml-3 select-all">
                <span className="text-gray-400 mt-1.5 shrink-0 text-[8px]">â—</span>
                <span className="flex-1 text-gray-700 leading-relaxed select-all">
                  {parseBoldText(content)}
                </span>
              </div>
            );
          }

          return (
            <p key={idx} className="leading-relaxed text-gray-700 select-all">
              {parseBoldText(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const filteredFoldersList = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col min-w-0 h-[calc(100vh-0px)] relative overflow-hidden bg-gray-50 text-gray-900">
      
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

      {(isAnalyzing || analysisError) && (
        <AiProgressOverlay
          visible={isAnalyzing || !!analysisError}
          message={analysisProgress}
          error={analysisError}
          label={`Analyzing ${activeReportDocName || "document"}...`}
          onRetry={analysisError ? () => { setAnalysisError(""); handleStartAnalysis(); } : undefined}
          onDismiss={analysisError ? () => setAnalysisError("") : undefined}
        />
      )}
      
      {viewMode === "form" ? (
        <div className="flex-1 overflow-y-auto px-8 py-7 w-full bg-[#F7F8FA]">
          {/* â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="mb-8 pb-5 border-b border-gray-100">
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Analyze agreements</h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed max-w-lg">Run AI-powered compliance audits, risk assessments, and custom legal queries across your document vaults.</p>
          </div>

          <div className="space-y-5">
            {/* â”€â”€ Section 1: Select folders â”€â”€ */}
            <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <div className="mb-5">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">1</span>
                  <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Select document folders</h3>
                </div>
                <p className="text-xs text-gray-400 ml-7 leading-relaxed">Choose the folders to load into the analysis context</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <input
                    type="text"
                    placeholder="Search folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-sm border border-gray-200 bg-gray-50/80 px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-lg placeholder:text-gray-400 transition-shadow"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openSideDrawer("upload")}
                    className="bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium px-3.5 py-2 rounded-lg transition-all duration-150 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-gray-400" />
                    <span>Upload</span>
                  </button>
                  <button
                    onClick={() => openSideDrawer("folder")}
                    className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-all duration-150 flex items-center gap-1.5"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-gray-300" />
                    <span>New Folder</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-0.5">
                {filteredFoldersList.length === 0 ? (
                  <div className="col-span-2 text-center py-10 bg-gray-50 rounded-xl text-sm text-gray-400 border border-dashed border-gray-200">
                    No folders found. Create one to get started.
                  </div>
                ) : (
                  filteredFoldersList.map(folder => {
                    const someSelected = folder.files.some(fi => fi.selected);
                    const allSelected = folder.files.length > 0 && folder.files.every(fi => fi.selected);
                    const isIndeterminate = someSelected && !allSelected;
                    return (
                      <div key={folder.id} className="flex flex-col">
                        <div
                          onClick={() => toggleFolderSelection(folder.id)}
                          className={`flex items-center justify-between px-3.5 py-2.5 border rounded-xl transition-all duration-150 cursor-pointer select-none ${
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
                            <Folder className={`w-4 h-4 shrink-0 ${allSelected || isIndeterminate ? 'text-gray-700' : 'text-gray-400'}`} />
                            <span className={`text-[13px] text-gray-800 truncate ${allSelected ? 'font-semibold' : isIndeterminate ? 'font-medium' : 'font-normal'}`}>{folder.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium tabular-nums">{folder.filesCount}</span>
                            <button
                              onClick={(e) => toggleFolderExpanded(folder.id, e)}
                              className="p-1 hover:bg-gray-100 transition-colors rounded-lg"
                            >
                              {folder.expanded
                                ? <ChevronUp className="w-3 h-3 text-gray-400" />
                                : <ChevronDown className="w-3 h-3 text-gray-400" />
                              }
                            </button>
                          </div>
                        </div>

                        {folder.expanded && folder.files.length > 0 && (
                          <div className="border-l border-r border-b border-gray-200 rounded-b-xl bg-white overflow-hidden">
                            {folder.files.map(file => (
                              <div
                                key={file.id}
                                onClick={(e) => toggleFileSelection(folder.id, file.id, e)}
                                className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer select-none transition-colors border-b last:border-b-0 border-gray-50 ${
                                  file.selected ? "bg-gray-50" : "hover:bg-gray-50/80"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={file.selected}
                                  readOnly
                                  className="rounded cursor-pointer accent-black h-3 w-3 shrink-0"
                                />
                                <FileText className={`w-3.5 h-3.5 shrink-0 ${file.selected ? 'text-gray-600' : 'text-gray-300'}`} />
                                <span className={`text-[12px] truncate ${file.selected ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                                  {file.title}
                                </span>
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

              {/* â”€â”€ Saved Drafts sub-section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {savedDrafts.length > 0 && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[13px] font-medium text-gray-600">Saved Drafts</span>
                      <span className="text-[11px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full tabular-nums">{savedDrafts.filter(d => d.selected).length}/{savedDrafts.length}</span>
                    </div>
                    <button
                      onClick={() => setSavedDraftsExpanded(v => !v)}
                      className="p-1 hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      {savedDraftsExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                        : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      }
                    </button>
                  </div>

                  {savedDraftsExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {savedDrafts.map(draft => (
                        <div
                          key={draft.id}
                          onClick={() => toggleDraftSelection(draft.id)}
                          className={`flex items-center justify-between px-3.5 py-2.5 border rounded-xl transition-all duration-150 cursor-pointer select-none ${
                            draft.selected
                              ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={draft.selected}
                              readOnly
                              className="rounded cursor-pointer accent-gray-900 h-3.5 w-3.5 shrink-0"
                            />
                            <FileCode className={`w-4 h-4 shrink-0 ${draft.selected ? 'text-gray-700' : 'text-gray-400'}`} />
                            <span className={`text-[13px] truncate ${draft.selected ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>{draft.title}</span>
                          </div>
                          <span className="text-[11px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium ml-2 shrink-0">Draft</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* â”€â”€ Section 2: Prompt â”€â”€ */}
            <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <div className="mb-5">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">2</span>
                  <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Write your prompt</h3>
                </div>
                <p className="text-xs text-gray-400 ml-7 leading-relaxed">Configure your audit parameters or apply a pre-built query</p>
              </div>

              <div className="flex gap-1 mb-5 bg-gray-50 border border-gray-200 rounded-xl p-1">
                {(["write", "library", "questions"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setPromptTab(tab)}
                    className={`flex-1 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 ${
                      promptTab === tab
                        ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {tab === "write" && "Custom"}
                    {tab === "library" && "Prompt Library"}
                    {tab === "questions" && "Questions"}
                  </button>
                ))}
              </div>

              {promptTab === "write" && (
                <textarea
                  rows={5}
                  value={customPromptText}
                  onChange={(e) => setCustomPromptText(e.target.value)}
                  placeholder="Describe what you want the AI to analyze â€” e.g. identify asymmetric liability clauses, review survival periods, flag punitive damages..."
                  className="w-full text-[13px] text-gray-700 border border-gray-200 bg-gray-50/50 p-4 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-xl placeholder:text-gray-400 resize-none leading-relaxed transition-shadow"
                />
              )}

              {promptTab === "library" && (
                <div className="space-y-1.5">
                  {promptLibrary.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setCustomPromptText(item.prompt);
                        setPromptTab("write");
                      }}
                      className="group px-4 py-3 border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 cursor-pointer transition-all duration-150 rounded-xl flex justify-between items-center gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-800 truncate">{item.title}</p>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.prompt}</p>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 group-hover:text-gray-700 shrink-0 transition-colors">Apply â†’</span>
                    </div>
                  ))}
                </div>
              )}

              {promptTab === "questions" && (
                <div className="space-y-1.5">
                  {questionsLibrary.map((q, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setCustomPromptText(q);
                        setPromptTab("write");
                      }}
                      className="group px-4 py-3 border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 cursor-pointer transition-all duration-150 rounded-xl flex justify-between items-center gap-4"
                    >
                      <span className="text-[13px] text-gray-700">{q}</span>
                      <span className="text-[11px] font-medium text-gray-400 group-hover:text-gray-700 shrink-0 transition-colors">Use â†’</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* â”€â”€ Section 3: Document Mode â”€â”€ */}
            <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <div className="mb-5">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">3</span>
                  <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Document mode</h3>
                </div>
                <p className="text-xs text-gray-400 ml-7 leading-relaxed">Run the prompt across all documents together, or individually per file</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  onClick={() => setDocumentMode("unified")}
                  className={`border rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer flex items-start gap-3 ${
                    documentMode === "unified"
                      ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      documentMode === "unified" ? "border-gray-900 bg-gray-900" : "border-gray-300"
                    }`}>
                      {documentMode === "unified" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-gray-800">Unified</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">All selected files as a single knowledge context</p>
                  </div>
                </div>

                <div
                  onClick={() => setDocumentMode("individual")}
                  className={`border rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer flex items-start gap-3 ${
                    documentMode === "individual"
                      ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      documentMode === "individual" ? "border-gray-900 bg-gray-900" : "border-gray-300"
                    }`}>
                      {documentMode === "individual" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-gray-800">Individual</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">Prompt runs on each file separately</p>
                  </div>
                </div>
              </div>
            </div>

            {/* â”€â”€ Section 4: Answer Style â”€â”€ */}
            <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <div className="mb-5">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">4</span>
                  <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Output format</h3>
                </div>
                <p className="text-xs text-gray-400 ml-7 leading-relaxed">Choose how the AI structures its response</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  onClick={() => setAnswerStyle("narrative")}
                  className={`border rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer flex items-start gap-3 ${
                    answerStyle === "narrative"
                      ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      answerStyle === "narrative" ? "border-gray-900 bg-gray-900" : "border-gray-300"
                    }`}>
                      {answerStyle === "narrative" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-9 border border-gray-200 bg-gray-50 p-1.5 flex flex-col justify-between shrink-0 rounded-lg select-none">
                      <div className="h-0.5 bg-gray-300 w-full rounded" />
                      <div className="h-0.5 bg-gray-300 w-3/4 rounded" />
                      <div className="h-0.5 bg-gray-300 w-5/6 rounded" />
                      <div className="h-0.5 bg-gray-300 w-1/2 rounded" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-semibold text-gray-800">Narrative</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">Consolidated prose response</p>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setAnswerStyle("tabular")}
                  className={`border rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer flex items-start gap-3 ${
                    answerStyle === "tabular"
                      ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      answerStyle === "tabular" ? "border-gray-900 bg-gray-900" : "border-gray-300"
                    }`}>
                      {answerStyle === "tabular" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-9 border border-gray-200 bg-gray-50 p-1 flex flex-col justify-between shrink-0 rounded-lg select-none">
                      <div className="grid grid-cols-3 gap-0.5 h-1.5">
                        <div className="bg-gray-400 rounded" />
                        <div className="bg-gray-300 rounded" />
                        <div className="bg-gray-300 rounded" />
                      </div>
                      <div className="grid grid-cols-3 gap-0.5 h-1.5">
                        <div className="bg-gray-400 rounded" />
                        <div className="bg-gray-200 rounded" />
                        <div className="bg-gray-200 rounded" />
                      </div>
                      <div className="grid grid-cols-3 gap-0.5 h-1.5">
                        <div className="bg-gray-400 rounded" />
                        <div className="bg-gray-200 rounded" />
                        <div className="bg-gray-200 rounded" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[13px] font-semibold text-gray-800">Tabular</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">Structured rows per document</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 pb-8">
              <button
                onClick={handleStartAnalysis}
                className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-[13px] font-semibold py-2.5 px-7 rounded-xl flex items-center justify-center gap-2 transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
                <span>Run Analysis</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {/* Report header bar */}
          <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 no-print">
            <button
              onClick={() => setViewMode("form")}
              className="group flex items-center gap-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 cursor-pointer bg-transparent border-0 transition-colors duration-150"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
              <span>{activeReportDocName}</span>
              <span className="text-gray-300 mx-1">Â·</span>
              <span className="text-gray-400">Analysis</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-gray-400">AI Active</span>
              </div>
              <HelpCircle className="w-3.5 h-3.5 text-gray-300 hover:text-gray-600 cursor-pointer transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="w-full space-y-4">

              {/* â”€â”€ Report card â”€â”€ */}
              <div className="bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden print-container">
                {/* Report header */}
                <div className="px-7 py-4 border-b border-gray-100 flex items-center justify-between select-all">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Legal Assessment</p>
                    <p className="text-[11px] text-gray-300 mt-0.5">Confidential Â· AI Generated</p>
                  </div>
                  <Sparkles className="w-4 h-4 text-gray-300" />
                </div>

                {/* Messages */}
                <div className="px-7 py-6 space-y-5 flex-1">
                  {chatMessages.map((message, idx) => {
                    const isUser = message.sender === "user";
                    return (
                      <div
                        key={idx}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`rounded-2xl text-[13px] leading-relaxed ${
                            isUser
                              ? "bg-gray-900 text-white px-5 py-3.5 max-w-sm shadow-sm"
                              : "w-full bg-gray-50/60 border border-gray-100 px-5 py-4"
                          }`}
                        >
                          <div className={`flex items-center gap-2 mb-2.5 ${isUser ? "justify-end" : "justify-between"}`}>
                            <span className={`text-[11px] font-medium ${isUser ? "text-gray-400" : "text-gray-400"}`}>
                              {isUser ? "You" : "AI Legal Analysis"}
                            </span>
                          </div>

                          {message.loading ? (
                            <div className="flex items-center gap-2 text-gray-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span className="text-[12px]">Analyzing your query...</span>
                            </div>
                          ) : (
                            <div className="select-all">
                              {isUser ? (
                                <p className="whitespace-pre-wrap leading-relaxed text-[13px]">{message.text}</p>
                              ) : (
                                renderContentText(message.text)
                              )}
                            </div>
                          )}

                          {!isUser && message.sources && message.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-gray-100">
                              <p className="text-[11px] font-medium text-gray-400 mb-2">Sources</p>
                              <div className="flex flex-wrap gap-1.5 select-all">
                                {message.sources.map((s, sIdx) => (
                                  <a
                                    key={sIdx}
                                    href={`https://example.com/grounding?q=${encodeURIComponent(s.title)}`}
                                    target="_blank"
                                    referrerPolicy="no-referrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-all rounded-lg"
                                  >
                                    <Globe className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span>{s.title} ({s.citation})</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
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

                {/* Report actions */}
                <div className="px-7 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2 no-print">
                  <button
                    onClick={handleCopyReport}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all duration-150"
                  >
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all duration-150"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Download</span>
                  </button>
                  <button
                    onClick={handlePrintReport}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all duration-150"
                  >
                    <Printer className="w-3.5 h-3.5 shrink-0" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* â”€â”€ Follow-up chat â”€â”€ */}
              <form
                onSubmit={handleSendChatMessage}
                className="bg-white border border-gray-200/80 rounded-2xl shadow-sm p-2 flex items-center gap-2 no-print"
              >
                <input
                  type="text"
                  placeholder="Ask a follow-up question..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 text-[13px] text-gray-700 bg-transparent px-3 py-2 focus:outline-none placeholder:text-gray-400"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white p-2.5 rounded-xl transition-all duration-150 flex items-center justify-center shrink-0 disabled:opacity-30"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>

          {showCopyToast && (
            <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-[12px] font-medium px-4 py-2.5 rounded-xl shadow-lg select-none flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Copied to clipboard</span>
            </div>
          )}
        </div>
      )}

      {isSidePanelOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity"
            onClick={() => setIsSidePanelOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 max-w-full flex">
            <div className="w-[380px] bg-white shadow-xl flex flex-col h-full rounded-l-2xl overflow-hidden border-l border-gray-200">
              {/* Drawer header */}
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
                  onClick={() => setIsSidePanelOpen(false)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-150 text-lg leading-none shrink-0"
                >
                  Ã—
                </button>
              </div>

              {sidePanelType === "folder" ? (
                <form onSubmit={handleAddNewFolder} className="flex-1 flex flex-col justify-between p-6">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 block">Folder name</label>
                      <input
                        type="text"
                        required
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="e.g. Q3 Vendor Agreements"
                        className="w-full text-[13px] border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-xl placeholder:text-gray-400 transition-shadow"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.15)] mt-6"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-gray-300" />
                    <span>Create Folder</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={executeUploadSubmission} className="flex-1 flex flex-col justify-between p-6">
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 block">Target folder</label>
                      <select
                        value={uploadSelectedFolder}
                        onChange={(e) => setUploadSelectedFolder(e.target.value)}
                        className="w-full text-[13px] border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-xl cursor-pointer transition-shadow appearance-none"
                      >
                        <option value="">Uploaded Documents (default)</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 block">File</label>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-8 text-center select-none transition-all duration-150 flex flex-col items-center justify-center cursor-pointer ${
                          isDraggingFile
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-gray-200 bg-gray-50/60 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <Upload className={`w-5 h-5 mb-2.5 ${isDraggingFile ? "text-emerald-500" : "text-gray-400"}`} />
                        <p className="text-[13px] font-medium text-gray-600">Drop file here</p>
                        <p className="text-[11px] text-gray-400 mt-1">PDF, DOCX, TXT, CSV</p>
                        <label className="inline-flex items-center mt-4 text-[12px] font-medium text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer">
                          <span>Browse files</span>
                          <input
                            type="file"
                            accept=".txt,.md,.json,.pdf,.docx,.csv"
                            onChange={handleFileBrowseChange}
                            className="hidden"
                          />
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
                    className="w-full bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.15)] disabled:opacity-30 mt-6"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-gray-300" />
                        <span>Upload File</span>
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




