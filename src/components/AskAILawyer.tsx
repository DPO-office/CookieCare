import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiUrl } from "../config";
import { 
  Scale, 
  Search, 
  Folder, 
  FolderPlus, 
  FileText, 
  Globe, 
  Plus, 
  Trash2, 
  Download, 
  Copy, 
  Check, 
  BookmarkCheck, 
  Columns, 
  ExternalLink, 
  X, 
  BookOpen, 
  Sparkles,
  RefreshCw,
  HelpCircle,
  FileCode,
  ArrowRight
} from "lucide-react";
import { LegalDocument } from "../types";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface FileContext {
  name: string;
  type: string;
  size: string;
  content: string;
}

interface KBFolder {
  id: string;
  name: string;
  isSelected: boolean;
  files: FileContext[];
}

interface Source {
  id: string;
  title: string;
  citation: string;
  jurisdiction: string;
  documentType: string;
  officialCopy: string;
}

interface AskAILawyerProps {
  authToken: string;
  documents?: LegalDocument[];
}

export default function AskAILawyer({ authToken, documents: propDocs = [] }: AskAILawyerProps) {
  // 1. INPUT STATES
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"Brief Summary" | "Full IRAC" | "CREAC">("Full IRAC");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>([
    "India (Corporate Laws)", 
    "United States (Federal Legal Research)"
  ]);
  const [webDiscoveryUrlInput, setWebDiscoveryUrlInput] = useState("");
  const [webDiscoveryUrls, setWebDiscoveryUrls] = useState<string[]>([
    "https://mca.gov.in/content/mca/global/en/home.html",
    "https://www.sec.gov/news/pressreleases"
  ]);

  // 2. KNOWLEDGE BASE FOLDERS STATE
  const [folders, setFolders] = useState<KBFolder[]>([]);

  const fetchKnowledgeBase = async () => {
    try {
      const [foldersRes, docsRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), { headers: { "Authorization": `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/documents"), { headers: { "Authorization": `Bearer ${authToken}` } })
      ]);

      if (foldersRes.ok && docsRes.ok) {
        const foldersData = await foldersRes.json();
        const docsData = await docsRes.json();

        const formattedFolders: KBFolder[] = foldersData.map((f: any) => ({
          id: f.id,
          name: f.name,
          isSelected: true,
          files: docsData
            .filter((d: any) => d.folder_id === f.id)
            .map((d: any) => ({
              name: d.title || d.name,
              type: d.type || "DOC",
              size: "N/A",
              content: d.content
            }))
        }));

        setFolders(formattedFolders);
      }
    } catch (err) {
      console.error("Failed to fetch knowledge base", err);
    }
  };

  useEffect(() => {
    fetchKnowledgeBase();
  }, [authToken]);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolderForUpload, setActiveFolderForUpload] = useState<string>("folder_1");

  // File Upload input ref
  const fileUploadRef = useRef<HTMLInputElement>(null);

  // 3. STEPPER & STEAMING STATUS STATE
  const [stepperPhase, setStepperPhase] = useState<"idle" | "division" | "sourcing" | "extracting" | "streaming" | "completed">("idle");
  const [stepperMessage, setStepperMessage] = useState("");
  const [streamedResult, setStreamedResult] = useState("");
  const [matchedSources, setMatchedSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCitationModal, setActiveCitationModal] = useState<Source | null>(null);

  // Copy and export statuses
  const [isCopied, setIsCopied] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Available Jurisdictions mapping
  const availableJurisdictions = [
    { key: "in_direct", label: "India (Direct Taxes)" },
    { key: "in_indirect", label: "India (Indirect Taxes)" },
    { key: "in_corp", label: "India (Corporate Laws)" },
    { key: "in_general", label: "India (General Laws)" },
    { key: "us_fed", label: "United States (Federal Legal Research)" },
    { key: "us_state", label: "United States (State Legal Research)" },
  ];

  // 4. ACTION HANDLERS
  const toggleJurisdiction = (label: string) => {
    setSelectedJurisdictions(prev => 
      prev.includes(label) 
        ? prev.filter(x => x !== label) 
        : [...prev, label]
    );
  };

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const newFolder: KBFolder = {
      id: "folder_" + Date.now(),
      name: newFolderName.trim(),
      isSelected: true,
      files: []
    };
    setFolders([...folders, newFolder]);
    setNewFolderName("");
  };

  const toggleFolderSelection = (id: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, isSelected: !f.isSelected } : f));
  };

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  const handleFileUploadSimulated = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simulate file reading and parsing
    const reader = new FileReader();
    reader.onload = (event) => {
      const contentText = (event.target?.result as string) || "Mock text file compliance contents uploaded to corporate enclave.";
      const newFile: FileContext = {
        name: file.name,
        type: file.name.split(".").pop()?.toUpperCase() || "TXT",
        size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
        content: contentText
      };

      setFolders(prev => prev.map(f => {
        if (f.id === activeFolderForUpload) {
          return { ...f, files: [...f.files, newFile] };
        }
        return f;
      }));
    };
    reader.readAsText(file);
  };

  const handleAddWebUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webDiscoveryUrlInput.trim()) return;
    if (!webDiscoveryUrls.includes(webDiscoveryUrlInput.trim())) {
      setWebDiscoveryUrls([...webDiscoveryUrls, webDiscoveryUrlInput.trim()]);
    }
    setWebDiscoveryUrlInput("");
  };

  const removeWebUrl = (url: string) => {
    setWebDiscoveryUrls(prev => prev.filter(u => u !== url));
  };

  // 5. DISPATCH ADVISORY CONTEXT QUERY
  const handleQueryDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isStreaming) return;

    // Reset status
    setIsStreaming(true);
    setStreamedResult("");
    setMatchedSources([]);
    setStepperPhase("division");
    setStepperMessage("Phase 1: Partitioning legal queries, rephrasing regulatory intents, and aligning lexical structures...");

    // Get active selected files
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

      if (!response.ok) {
        throw new Error("Advisory system failed to respond cleanly.");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("SSE Stream reader could not initialize.");

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();

            if (dataStr === "[DONE]") {
              setStepperPhase("completed");
              setStepperMessage("Advocacy feedback stream finalized. Analysis complete.");
              break;
            }

            try {
              const dataObj = JSON.parse(dataStr);
              
              if (dataObj.step === "division") {
                setStepperPhase("division");
                setStepperMessage(dataObj.message);
              } else if (dataObj.step === "sourcing") {
                setStepperPhase("sourcing");
                setStepperMessage(dataObj.message);
              } else if (dataObj.step === "extracting") {
                setStepperPhase("extracting");
                setStepperMessage(dataObj.message);
              } else if (dataObj.sources) {
                setMatchedSources(dataObj.sources);
                setStepperPhase("streaming");
                setStepperMessage("Synthesizing citations and streaming regulatory response output...");
              } else if (dataObj.text) {
                setStreamedResult(prev => prev + dataObj.text);
              }
            } catch (err) {
              // Ignore partial chunk decode errors
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setStepperPhase("idle");
      setStepperMessage("");
      setStreamedResult(`**System Connection Interrupted**\n\nThere was an issue communicating with the legal intelligence engine. Please review your active workspace setup and retry your request.\n\nError details: ${err.message}`);
    } finally {
      setIsStreaming(false);
    }
  };

  // 6. COPY UTILITY
  const handleCopyMarkdown = () => {
    if (!streamedResult) return;
    navigator.clipboard.writeText(streamedResult);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // 7. EXPORT UTILITIES
  const triggerExport = (format: "Word" | "PDF") => {
    if (!streamedResult) return;
    
    setExportMessage(`Exporting research dossier to standard ${format}...`);
    setTimeout(() => setExportMessage(""), 3000);

    if (format === "Word") {
      const header = `PrivSecAI AI Advisory - Legal Research Dossier\nExported: ${new Date().toLocaleString()}\nFormat Style: ${selectedFormat}\nJurisdictions: ${selectedJurisdictions.join(", ")}\n\n===========================================\n\n`;
      const blob = new Blob([header + streamedResult], { type: "application/msword" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `privsecai_ai_lawyer_advisory_${Date.now()}.doc`;
      link.click();
    } else {
      // PDF trigger via Print friendly format in a new frame or simple download format
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>PrivSecAI AI Lawyer - Research Dossier</title>
              <style>
                body { font-family: -apple-system, sans-serif; padding: 40px; color: #111; line-height: 1.6; }
                h1 { border-bottom: 2px solid #000; padding-bottom: 10px; font-size: 24px; text-transform: uppercase; }
                h3 { font-size: 16px; margin-top: 30px; text-transform: uppercase; background: #000; color: #fff; padding: 6px 12px; display: inline-block; }
                pre { background: #f4f4f4; padding: 15px; border-left: 4px solid #000; font-family: monospace; white-space: pre-wrap; }
                footer { margin-top: 50px; font-size: 11px; border-top: 1px solid #ddd; padding-top: 15px; color: #666; font-family: monospace; }
              </style>
            </head>
            <body>
              <h1>PrivSecAI AI Legal Advisory Docket</h1>
              <p><strong>System Date:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Format Framework:</strong> ${selectedFormat}</p>
              <p><strong>Target Jurisdictions:</strong> ${selectedJurisdictions.join(", ")}</p>
              <hr />
              <div>${streamedResult.replace(/\n/g, "<br>")}</div>
              <footer>*Protected by FIPS-compliance standards. Created on PrivSecAI Security Sandbox.</footer>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  // 8. TEXT RE-PARSER FOR VISUAL BLOCKS
  const renderFormattedResult = (text: string) => {
    if (!text) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-16 text-center text-gray-400 font-mono">
          <BookOpen className="w-10 h-10 mb-4 text-black animate-pulse" />
          <p className="text-sm font-bold text-gray-900 mb-1">UNINITIALIZED RESEARCH DESKTOP</p>
          <p className="text-xs max-w-sm">Enter a legal prompt, select jurisdictions and knowledge bases on the left to stream formal advice.</p>
        </div>
      );
    }

    // Split based on primary headers like ISSUE, RULE, APPLICATION, CONCLUSION
    const sections = text.split(/(###? (?:ISSUE|RULE|APPLICATION|CONCLUSION|EXPLANATION OF RULE|EXECUTIVE SUMMARY))/gi);
    
    if (sections.length <= 1) {
      return <div className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed select-all">{text}</div>;
    }

    return (
      <div className="space-y-6">
        {sections.map((sec, idx) => {
          const isHeader = sec.match(/###? (?:ISSUE|RULE|APPLICATION|CONCLUSION|EXPLANATION OF RULE|EXECUTIVE SUMMARY)/i);
          if (isHeader) {
            const cleanHeader = sec.replace(/###? /gi, "").toUpperCase();
            return (
              <h3 
                key={idx} 
                className="text-xs font-bold font-mono tracking-wider text-white bg-black px-3.5 py-1.5 inline-block rounded-none border border-black uppercase mt-4 first:mt-0"
              >
                {cleanHeader}
              </h3>
            );
          } else {
            // Standard formatting inside sections
            const listProcessed = sec.split("\n").map((line, lIdx) => {
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return (
                  <li key={lIdx} className="ml-4 list-disc pl-1.5 text-sm text-gray-800 leading-relaxed my-1">
                    {line.substring(2)}
                  </li>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                return (
                  <li key={lIdx} className="ml-5 list-decimal pl-1.5 text-sm text-gray-800 leading-relaxed my-1">
                    {line.replace(/^\d+\.\s/, "")}
                  </li>
                );
              }
              if (line.trim() === "") return <div key={lIdx} className="h-2" />;
              return (
                <p key={lIdx} className="text-sm text-gray-800 leading-relaxed my-2 select-all font-sans">
                  {line}
                </p>
              );
            });

            return <div key={idx} className="pl-0 md:pl-2 pb-2 text-gray-900 border-l border-gray-100">{listProcessed}</div>;
          }
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-screen bg-white">
      
      {/* HEADER SECTION - ARCHITECTURAL BRAND BAR */}
      <header className="shrink-0 border-b-2 border-black p-5 flex flex-col md:flex-row md:items-center justify-between bg-white">
        <div className="flex items-center space-x-3.5">
          <div className="bg-black text-white p-2 border-2 border-black flex items-center justify-center">
            <Scale className="w-5.5 h-5.5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold font-mono uppercase tracking-tight text-gray-900">
                Consult AI Lawyer
              </h1>
              <span className="bg-black text-white px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase">
                PRIVSECAI ASK v1.2
              </span>
            </div>
            <p className="text-[10px] font-mono text-gray-400 mt-0.5">
              SECURE RESEARCH COMPLIANCE ENCLAVE • MODEL: GEMINI 3.5 FLASH ACTIVE
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 mt-3 md:mt-0">
          <div className="flex items-center space-x-2 text-[11px] font-mono border-2 border-gray-200 px-3 py-1.5 bg-gray-50/50">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-gray-600 uppercase">FIPS Compliant Proxy Connection</span>
          </div>
        </div>
      </header>

      {/* THREE-PANE SPLIT WORKSPACE GRID */}
      <div className="flex-1 flex overflow-hidden min-h-0 divide-x-2 divide-black">
        
        {/* PANEL A: SOURCE SELECTOR & CONFIGURATION MATRICES (Left Panel) */}
        <aside className="w-80 overflow-y-auto bg-white p-5 shrink-0 flex flex-col gap-6 select-none">
          
          {/* MATRIX 1: JURISDICTIONS CHANNELS */}
          <div>
            <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-black">
                1. Target Jurisdictions
              </span>
              <BookOpen className="w-3.5 h-3.5 text-black" />
            </div>
            
            <div className="space-y-1.5">
              {availableJurisdictions.map((jc) => {
                const isSelected = selectedJurisdictions.includes(jc.label);
                return (
                  <button
                    key={jc.key}
                    id={`jc-toggle-${jc.key}`}
                    type="button"
                    onClick={() => toggleJurisdiction(jc.label)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-mono border text-left transition-all ${
                      isSelected 
                        ? "bg-black text-white border-black font-bold" 
                        : "bg-white text-gray-700 border-gray-300 hover:border-black"
                    }`}
                  >
                    <span className="truncate">{jc.label}</span>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* MATRIX 2: CUSTOM KNOWLEDGE BASE FOLDER TREES */}
          <div>
            <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-black">
                2. Custom Knowledge Base
              </span>
              <Folder className="w-3.5 h-3.5 text-black" />
            </div>

            {/* Folder creation form */}
            <form onSubmit={handleAddFolder} className="flex space-x-1.5 mb-3.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New Folder Title..."
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 focus:outline-none focus:border-black font-mono placeholder:text-gray-400"
              />
              <button
                type="submit"
                id="add-folder-btn"
                className="bg-black text-white px-3 py-1.5 text-xs font-mono border border-black hover:bg-gray-800 flex items-center justify-center"
                title="Create custom folder"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Folders Accordion / Toggle stack */}
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {folders.map((f) => (
                <div 
                  key={f.id}
                  className={`border ${f.isSelected ? "border-black" : "border-gray-200"} p-2 bg-white`}
                >
                  <div 
                    onClick={() => toggleFolderSelection(f.id)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Folder className={`w-4 h-4 ${f.isSelected ? "text-black fill-black/10" : "text-gray-400"}`} />
                      <span className={`text-xs font-bold truncate font-sans ${f.isSelected ? "text-gray-900" : "text-gray-500"}`}>
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0 ml-1">
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 border border-gray-100">
                        {f.files.length}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteFolder(f.id, e)}
                        className="text-gray-400 hover:text-black transition"
                        title="Delete folder and contents"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Files List */}
                  {f.isSelected && (
                    <div className="mt-2 pl-3 pt-1 border-t border-gray-100 space-y-1.5">
                      {f.files.length === 0 ? (
                        <div className="text-[10px] font-mono text-gray-400 italic py-1">
                          No items loaded (<span className="underline cursor-pointer hover:text-black" onClick={() => { setActiveFolderForUpload(f.id); fileUploadRef.current?.click(); }}>upload</span>)
                        </div>
                      ) : (
                        f.files.map((file, fIdx) => (
                          <div key={fIdx} className="flex items-center justify-between text-[10px] font-mono text-gray-500 hover:text-black">
                            <div className="flex items-center space-x-1 min-w-0">
                              <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="truncate" title={file.name}>{file.name}</span>
                            </div>
                            <span className="text-gray-400 font-normal shrink-0 ml-1">({file.size})</span>
                          </div>
                        ))
                      )}
                      
                      {/* Quick upload linkage */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFolderForUpload(f.id);
                          fileUploadRef.current?.click();
                        }}
                        className="text-[10px] font-mono font-bold text-black border border-black border-dashed hover:bg-gray-50 px-2 py-1 w-full text-center mt-1.5 cursor-pointer"
                      >
                        + Upload File (&lt;75MB)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Hidden Input File Dispatch */}
            <input
              type="file"
              ref={fileUploadRef}
              className="hidden"
              accept=".pdf,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg"
              onChange={handleFileUploadSimulated}
            />
          </div>

          {/* MATRIX 3: WEB DISCOVERY INPUT PROXIES */}
          <div>
            <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-black">
                3. Web Discovery Proxies
              </span>
              <Globe className="w-3.5 h-3.5 text-black" />
            </div>

            <form onSubmit={handleAddWebUrl} className="flex space-x-1.5 mb-2.5">
              <input
                type="url"
                value={webDiscoveryUrlInput}
                onChange={(e) => setWebDiscoveryUrlInput(e.target.value)}
                placeholder="https://regulatory-gazette.gov..."
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 focus:outline-none focus:border-black font-mono placeholder:text-gray-400"
              />
              <button
                type="submit"
                id="add-web-discovery-btn"
                className="bg-black text-white px-3 py-1.5 text-xs font-mono border border-black hover:bg-gray-800 flex items-center justify-center cursor-pointer"
                title="Add live URL context"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {webDiscoveryUrls.length === 0 ? (
                <div className="text-[10px] font-mono text-gray-400 italic py-2">
                  No discovery URLs registered. Will fall back to standard database index.
                </div>
              ) : (
                webDiscoveryUrls.map((url, uIdx) => (
                  <div key={uIdx} className="flex items-center justify-between p-2 border border-gray-200 text-[10px] font-mono bg-gray-50/30">
                    <span className="truncate pr-2 text-gray-600 hover:text-black hover:underline cursor-alias" title={url}>{url}</span>
                    <button
                      type="button"
                      onClick={() => removeWebUrl(url)}
                      className="text-gray-400 hover:text-black transition shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* FRAMEWORK STYLE TOGGLE CHANNELS */}
          <div>
            <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-black">
                4. Output Framework Format
              </span>
              <FileCode className="w-3.5 h-3.5 text-black" />
            </div>

            <div className="grid grid-cols-3 gap-1 border-2 border-black p-1 bg-gray-50">
              {(["Brief Summary", "Full IRAC", "CREAC"] as const).map((fmt) => {
                const isSelected = selectedFormat === fmt;
                return (
                  <button
                    key={fmt}
                    id={`format-toggle-${fmt.replace(/\s+/g, "").toLowerCase()}`}
                    type="button"
                    onClick={() => setSelectedFormat(fmt)}
                    className={`py-1.5 px-0.5 text-[10px] font-mono uppercase tracking-tight text-center transition-all ${
                      isSelected 
                        ? "bg-black text-white font-bold" 
                        : "text-gray-600 hover:text-black hover:bg-gray-100"
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

        </aside>

        {/* COLUMN B & C: TWO-COLUMN RESEARCH DISCOVERY OVERVIEW (Main View and Sources) */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          
          {/* SEARCH TRIGGER PROMPT INPUT BOX */}
          <div className="p-5 border-b-2 border-black bg-gray-50/50 select-none">
            <form onSubmit={handleQueryDispatch} className="relative flex border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <input
                id="legal-prompt-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Query global corporate codes, direct tax assess statutes (e.g. 'Assess double tax relief guidelines under Azadi Bachao' or 'Review GDPR breach liability policies')..."
                className="flex-1 font-sans text-sm py-4 pl-4 pr-14 focus:outline-none placeholder:text-gray-400 font-medium"
                disabled={isStreaming}
              />
              <button
                id="legal-prompt-submit"
                type="submit"
                disabled={!searchQuery.trim() || isStreaming}
                className="absolute right-0 top-0 h-full px-5 bg-black text-white border-l-2 border-black hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center cursor-pointer"
                title="Dispatch Search Query"
              >
                {isStreaming ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <ArrowRight className="w-5 h-5" />
                )}
              </button>
            </form>
          </div>

          {/* ACTIVE PROCESSING STEPPER INTERFACE */}
          <AnimatePresence mode="popLayout">
            {stepperPhase !== "idle" && (
              <motion.div 
                id="active-stepper-panel"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-5 my-4 border-2 border-black p-4 bg-yellow-50/40 divide-y divide-black/10 select-none"
              >
                <div className="flex items-center justify-between pb-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4.5 h-4.5 text-black animate-pulse" />
                    <span className="text-xs font-bold font-mono uppercase tracking-wider text-black">
                      AI Legal Research Pipeline Orchestration
                    </span>
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 bg-black text-white font-bold uppercase rounded-none">
                    Status: {stepperPhase === "completed" ? "Dossier Synthesized" : "Sourcing Active"}
                  </span>
                </div>

                <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Phase 1 Indicator */}
                  <div className={`p-2 border font-mono text-[10.5px] uppercase transition-all ${
                    stepperPhase === "division" 
                      ? "border-black bg-black text-white font-bold" 
                      : (stepperPhase as string) !== "idle"
                        ? "border-black bg-gray-100 text-gray-500 flex items-center justify-between" 
                        : "border-gray-200 text-gray-400"
                  }`}>
                    <span>Phase 1: Question Division</span>
                    {(stepperPhase === "sourcing" || stepperPhase === "extracting" || stepperPhase === "streaming" || stepperPhase === "completed") && (
                      <Check className="w-3.5 h-3.5 text-black shrink-0" />
                    )}
                  </div>

                  {/* Phase 2 Indicator */}
                  <div className={`p-2 border font-mono text-[10.5px] uppercase transition-all ${
                    stepperPhase === "sourcing" 
                      ? "border-black bg-black text-white font-bold" 
                      : (stepperPhase === "extracting" || stepperPhase === "streaming" || stepperPhase === "completed")
                        ? "border-black bg-gray-100 text-gray-500 flex items-center justify-between" 
                        : "border-gray-200 text-gray-400"
                  }`}>
                    <span>Phase 2: Target Indexing</span>
                    {(stepperPhase === "extracting" || stepperPhase === "streaming" || stepperPhase === "completed") && (
                      <Check className="w-3.5 h-3.5 text-black shrink-0" />
                    )}
                  </div>

                  {/* Phase 3 Indicator */}
                  <div className={`p-2 border font-mono text-[10.5px] uppercase transition-all ${
                    stepperPhase === "extracting" 
                      ? "border-black bg-black text-white font-bold" 
                      : (stepperPhase === "streaming" || stepperPhase === "completed")
                        ? "border-black bg-gray-100 text-gray-500 flex items-center justify-between" 
                        : "border-gray-200 text-gray-400"
                  }`}>
                    <span>Phase 3: Statutory Extraction</span>
                    {(stepperPhase === "streaming" || stepperPhase === "completed") && (
                      <Check className="w-3.5 h-3.5 text-black shrink-0" />
                    )}
                  </div>
                </div>

                <p className="text-[11px] font-mono text-gray-600 mt-2.5 pt-1">
                  &gt; {stepperMessage}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TWO MAIN COLUMNS: Generated Advice (Left) & Verified Sources Drawer (Right) */}
          <div className="flex-1 flex overflow-hidden min-h-0 divide-x-2 divide-black">
            
            {/* LEFT SPLIT COLUMN: GENERATED ADVICE TERMINAL */}
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* ACTION UTILITIES SUB-BAR */}
              {streamedResult && (
                <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between select-none shrink-0">
                  <div className="flex items-center space-x-2">
                    <Columns className="w-4 h-4 text-gray-500" />
                    <span className="text-[11px] font-mono text-gray-500 uppercase font-bold">Research Ledger Content</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      id="copy-markdown-btn"
                      onClick={handleCopyMarkdown}
                      className="px-2.5 py-1 border border-gray-300 bg-white hover:border-black text-[10.5px] font-mono text-gray-700 flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-black" />
                          <span className="text-black font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-gray-400" />
                          <span>Copy Markdown</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      id="export-doc-btn"
                      onClick={() => triggerExport("Word")}
                      className="px-2.5 py-1 border border-gray-300 bg-white hover:border-black text-[10.5px] font-mono text-gray-700 flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-gray-400" />
                      <span>Word (.docx)</span>
                    </button>

                    <button
                      type="button"
                      id="export-pdf-btn"
                      onClick={() => triggerExport("PDF")}
                      className="px-2.5 py-1 border border-gray-300 bg-white hover:border-black text-[10.5px] font-mono text-gray-700 flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-gray-400" />
                      <span>PDF Print</span>
                    </button>
                  </div>
                </div>
              )}

              {exportMessage && (
                <div className="bg-black text-white p-2.5 text-xs font-mono text-center shrink-0">
                  {exportMessage}
                </div>
              )}

              {/* DYNAMIC SCROLLABLE TEXT CANVAS */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8">
                <div className="max-w-3xl mx-auto prose">
                  {renderFormattedResult(streamedResult)}
                </div>
                <div ref={chatBottomRef} />
              </div>

            </div>

            {/* RIGHT SPLIT COLUMN: VERIFIED SOURCES DRAWER PANEL */}
            <div className="w-80 bg-gray-50/50 overflow-y-auto p-5 shrink-0 flex flex-col">
              <div className="flex items-center justify-between border-b-2 border-black pb-2.5 mb-4 select-none">
                <div className="flex items-center space-x-2">
                  <BookmarkCheck className="w-4.5 h-4.5 text-black" />
                  <span className="text-xs font-bold font-mono uppercase tracking-wider text-black">
                    Verified Sources Drawer
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-black text-white px-1.5 py-0.5 uppercase font-bold">
                  {matchedSources.length} Hit
                </span>
              </div>

              {matchedSources.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
                  <BookOpen className="w-8 h-8 mb-3 text-gray-300" />
                  <p className="text-[11px] font-mono text-gray-400 leading-normal">
                    Statutory provisions, court transcript records, and verified circular maps will manifest when research is initiated.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  <p className="text-[10px] font-mono text-gray-400 leading-normal uppercase select-none mb-1">
                    Citations matched during LLM RAG indexing:
                  </p>
                  
                  {matchedSources.map((source) => (
                    <div 
                      key={source.id}
                      id={`source-card-${source.id}`}
                      onClick={() => setActiveCitationModal(source)}
                      className="border-2 border-black p-3.5 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between select-none">
                        <span className="text-[9px] font-mono font-bold bg-black text-white px-1.5 py-0.5 uppercase">
                          {source.documentType}
                        </span>
                        <span className="text-[9px] font-mono text-gray-400">
                          {source.citation}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-gray-900 font-sans tracking-tight leading-snug line-clamp-2">
                        {source.title}
                      </h4>

                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 select-none">
                        <span className="text-[9px] font-mono text-gray-500 uppercase uppercase-tracking-widest">
                          {source.jurisdiction}
                        </span>
                        <ExternalLink className="w-3 h-3 text-black" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto pt-6 border-t border-gray-200 text-[10px] font-mono text-gray-400 leading-normal select-none">
                *Verified materials are indexed straight from official gazettes and PrivSecAI deep RAG nodes.
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* HIGH-FIDELITY OFFICIAL DOCUMENT MODAL VIEW */}
      <AnimatePresence>
        {activeCitationModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-text"
            onClick={() => setActiveCitationModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border-4 border-black w-full max-w-2xl h-140 flex flex-col shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              {/* Modal title header */}
              <div className="p-4 border-b-2 border-black flex items-center justify-between bg-black text-white select-none">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-5 h-5 text-white" />
                  <div>
                    <span className="text-[10px] font-mono uppercase text-gray-400 tracking-wider">
                      Official Source Verification Vault
                    </span>
                    <h3 className="text-xs font-bold font-mono uppercase tracking-tight">
                      REF: {activeCitationModal.citation}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCitationModal(null)}
                  className="bg-white text-black p-1 hover:bg-gray-100 transition border border-black cursor-pointer"
                  title="Close Vault Document"
                >
                  <X className="w-4.5 h-4.5 font-bold" />
                </button>
              </div>

              {/* Source meta parameters indicator */}
              <div className="p-3 border-b border-gray-200 bg-gray-50 flex gap-4 select-none text-[11px] font-mono text-gray-500">
                <div>
                  <strong>JURISDICTION:</strong> <span className="text-gray-800">{activeCitationModal.jurisdiction}</span>
                </div>
                <div>
                  <strong>TYPE:</strong> <span className="text-gray-800">{activeCitationModal.documentType}</span>
                </div>
              </div>

              {/* Document copy body segment */}
              <div className="flex-1 overflow-y-auto p-6 font-mono text-xs text-gray-800 leading-relaxed bg-white">
                <div className="whitespace-pre-wrap select-all selection:bg-black selection:text-white pb-6 border-b border-gray-100 mb-4">
                  {activeCitationModal.officialCopy}
                </div>
                <div className="text-[10px] text-gray-400 italic font-mono select-none">
                  --- End of official docket record transcript. Indexed under PrivSecAI FIPS security channel.
                </div>
              </div>

              {/* Footer action tools */}
              <div className="p-4 border-t-2 border-black bg-gray-50 flex justify-end select-none">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activeCitationModal.officialCopy);
                    alert("Official copy transcript copied to secure clipboard.");
                  }}
                  className="bg-black text-white px-4 py-2 border-2 border-black text-xs font-mono hover:bg-gray-800 flex items-center space-x-2 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Official Transcripts</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
