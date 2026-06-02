import React, { useState, useRef, useEffect } from "react";
import { apiUrl } from "../config";
import { 
  FileEdit, 
  History, 
  Signature as SigIcon, 
  Share2, 
  Clock, 
  FileLock2, 
  Plus, 
  CheckCircle, 
  Bold, 
  List, 
  RotateCcw,
  UserCheck,
  Sparkles,
  Upload,
  ArrowRight,
  Play,
  Lock,
  FileText,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Undo,
  Redo,
  Printer,
  Download,
  Save,
  Eraser,
  Search,
  ArrowLeft,
  Check,
  Trash2
} from "lucide-react";
import { LegalDocument, Version } from "../types";

// ==============================================================================
// TEMPLATE & CLAUSE COLLECTIONS (Matching Screenshot 5 & 6 Folders)
// ==============================================================================
const templateFolders = [
  {
    name: "CookieCare Templates",
    count: 10,
    items: [
      "Mutual Non-Disclosure Agreement",
      "Service Level Agreement (SLA)",
      "Data Protection Addendum (GDPR DPA)",
      "Vesting Clauses & Equity Structure",
      "Arbitration Petition (Section 11)",
      "Employment Covenant Framework",
      "Commercial Vendor Lease Provision",
      "Executive NDA with Non-Compete",
      "Proprietary Assignment Covenant",
      "Corporate Resolution Charter"
    ]
  }
];

interface DraftAgreementProps {
  documents: LegalDocument[];
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument | null) => void;
}

export default function DraftAgreement({ documents, authToken, onRefresh, onSelectDocument }: DraftAgreementProps) {
  // Current active draft or editor context
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument | null>(documents[0] || null);
  const [editorContent, setEditorContent] = useState(selectedDoc ? selectedDoc.content : "");
  const [isSaving, setIsSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState("");
  
  // Dashboard vs Editor Workspace toggle structure
  const [isGeneratorActive, setIsGeneratorActive] = useState(!documents[0]);

  // Editor refs and state
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // --- AI GENERATOR WORKSPACE STATES ---
  const [mode, setMode] = useState<"Basic" | "Advanced">("Basic");
  const [depth, setDepth] = useState<"Short" | "Standard" | "Deep">("Standard");
  const [instructions, setInstructions] = useState("");
  const [playbookGuidelines, setPlaybookGuidelines] = useState("Use formal legal tone, favour the client, include strong indemnity and limitation clauses, structure with numbered clauses.");
  
  // Basic Mode Form Inputs
  const [basicPartyA, setBasicPartyA] = useState("CookieCare Corporate Client");
  const [basicPartyB, setBasicPartyB] = useState("Vendor Infrastructure Host");
  const [basicLaw, setBasicLaw] = useState("State of Delaware");
  const [basicLiability, setBasicLiability] = useState("USD $2,000,000 limit");

  // Advanced Mode step hierarchy
  const [advancedStep, setAdvancedStep] = useState<"selector" | "proactive" | "reactive">("selector");

  // Select indicators
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>("Mutual Non-Disclosure Agreement");
  const [aiRulebookPrompt, setAiRulebookPrompt] = useState("");

  // Drag and Drop Reactive Ingest
  const [isDragging, setIsDragging] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [advancedFieldValues, setAdvancedFieldValues] = useState<Record<string, string>>({});

  // Streaming & Loading states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingProgress, setStreamingProgress] = useState("");

  // Sync editor if document selection alters
  useEffect(() => {
    if (selectedDoc) {
      setEditorContent(selectedDoc.content);
      setIsGeneratorActive(false);
    }
  }, [selectedDoc]);

  const handleSelectDoc = (doc: LegalDocument) => {
    setSelectedDoc(doc);
    setIsGeneratorActive(false);
    onSelectDocument(doc);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const processFile = async (file: File) => {
    setUploadFileName(file.name);
    setIsParsingTemplate(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const res = await fetch(apiUrl("/api/drafting/process-uploaded-template"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
          body: JSON.stringify({ templateText: text })
        });
        const payload = await res.json();
        setUploadText(payload.data.redactedText || text);
        const seedVals: Record<string, string> = {};
        payload.data.fields?.forEach((f: any) => { seedVals[f.id] = f.defaultValue; });
        setAdvancedFieldValues(seedVals);
      } catch (err) {
        setUploadText(text);
      } finally {
        setIsParsingTemplate(false);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteDraftStream = async () => {
    setIsStreaming(true);
    setStreamingProgress("Initiating multi-agent ingestion pipeline...");
    
    const payload: any = {
      mode: mode,
      outputLevel: depth,
      instructions: instructions,
      playbookText: playbookGuidelines,
    };

    if (mode === "Basic") {
      payload.formFields = { party_a: basicPartyA, party_b: basicPartyB, governing_law: basicLaw, liability_cap: basicLiability };
    } else {
      if (advancedStep === "proactive") {
        payload.templateId = selectedTemplateName;
        payload.playbookText = aiRulebookPrompt || playbookGuidelines;
      } else {
        payload.sourceText = uploadText;
        payload.formFields = advancedFieldValues;
      }
    }

    setEditorContent("");
    setIsGeneratorActive(false);

    try {
      const res = await fetch(apiUrl("/api/drafting/generate-stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify(payload)
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value);
          setEditorContent(accumulated);
        }
      }
    } catch (err) {
      alert("Drafting failed.");
    } finally {
      setIsStreaming(false);
      setStreamingProgress("");
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSavingMsg("Saving to Enterprise Vault...");
    try {
      const res = await fetch(apiUrl("/api/drafting/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({
          id: selectedDoc?.id, // Send ID to allow update instead of duplicate
          title: selectedDoc?.title || selectedTemplateName || "Untitled Draft",
          content: editorContent,
          config_state: { mode, depth, selectedTemplateName }
        })
      });
      if (res.ok) {
        const result = await res.json();
        setSavingMsg("Saved Successfully!");
        if (!selectedDoc) {
          onRefresh(); // Refresh to get the new doc list
        }
      }
    } catch (err) {
      alert("Save failed");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSavingMsg(""), 3000);
    }
  };

  const handleExportDoc = async (format: "docx" | "pdf") => {
    try {
      const res = await fetch(apiUrl("/api/documents/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({
          title: selectedDoc?.title || "CookieCare_Draft",
          format,
          contentType: "redlines",
          content: editorContent
        })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Draft.${format}`;
      a.click();
    } catch (err) {
      alert("Export failed");
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex h-screen font-sans bg-[#FAFBFD]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-content { width: 100% !important; margin: 0 !important; padding: 20px !important; border: none !important; box-shadow: none !important; }
        }
      `}</style>
      
      {isGeneratorActive ? (
        <div className="flex-1 flex flex-col overflow-y-auto p-10 bg-white no-print">
          <div className="w-full max-w-4xl mx-auto">
            <h1 className="text-3xl font-extrabold text-[#0F172A]">Drafting Module</h1>
            
            <div className="flex justify-end my-6">
              <div className="bg-gray-100 p-1 rounded-full flex">
                <button onClick={() => setMode("Basic")} className={`px-5 py-1.5 rounded-full text-xs font-bold ${mode === "Basic" ? "bg-white shadow" : "text-gray-500"}`}>Basic</button>
                <button onClick={() => setMode("Advanced")} className={`px-5 py-1.5 rounded-full text-xs font-bold ${mode === "Advanced" ? "bg-white shadow" : "text-gray-500"}`}>Advanced</button>
              </div>
            </div>

            {mode === "Basic" ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold mb-2">1. Draft Input</label>
                  <textarea rows={4} value={instructions} onChange={e => setInstructions(e.target.value)} className="w-full border rounded-xl p-4 text-sm" placeholder="Define what you want to create... (No template selection here)" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">2. Drafting Instructions</label>
                  <textarea rows={4} value={playbookGuidelines} onChange={e => setPlaybookGuidelines(e.target.value)} className="w-full border rounded-xl p-4 text-sm" />
                </div>
                <button onClick={handleExecuteDraftStream} className="bg-[#0F172A] text-white px-6 py-3 rounded-lg font-bold">Generate Draft</button>
              </div>
            ) : (
              <div className="space-y-6">
                {advancedStep === "selector" && (
                  <div className="grid grid-cols-2 gap-6 pt-10">
                    <div onClick={() => setAdvancedStep("reactive")} className="border p-8 rounded-2xl cursor-pointer hover:bg-gray-50">
                      <h4 className="font-bold">Reactive Drafting</h4>
                      <p className="text-xs text-gray-500 mt-2">Draft in response to an uploaded document.</p>
                    </div>
                    <div onClick={() => setAdvancedStep("proactive")} className="border p-8 rounded-2xl cursor-pointer hover:bg-gray-50">
                      <h4 className="font-bold">Proactive Drafting</h4>
                      <p className="text-xs text-gray-500 mt-2">Create a new agreement using user templates from Vault.</p>
                    </div>
                  </div>
                )}

                {advancedStep === "proactive" && (
                  <div className="space-y-4">
                    <div className="border rounded-xl p-4">
                      <label className="block text-sm font-bold mb-2">Target Draft (User Vault)</label>
                      <select value={selectedTemplateName || ""} onChange={e => setSelectedTemplateName(e.target.value)} className="w-full border p-2 rounded text-sm">
                        <option value="">-- Select from Vault --</option>
                        {templateFolders[0].items.map(it => <option key={it} value={it}>{it}</option>)}
                        {documents.filter(doc => doc.is_template).map(doc => <option key={doc.id} value={doc.title}>{doc.title}</option>)}
                      </select>
                    </div>
                    <button onClick={handleExecuteDraftStream} className="bg-[#0F172A] text-white px-6 py-3 rounded-lg font-bold">Generate Proactive Draft</button>
                  </div>
                )}

                {advancedStep === "reactive" && (
                  <div className="space-y-4">
                    <div onDrop={handleDrop} onDragOver={handleDragOver} className="border-2 border-dashed p-10 text-center rounded-xl">
                      <Upload className="mx-auto text-gray-400" />
                      <p className="text-sm mt-2">Drop source document for reactive analysis</p>
                    </div>
                    {uploadFileName && <p className="text-xs font-bold text-emerald-600">File: {uploadFileName}</p>}
                    <button onClick={handleExecuteDraftStream} className="bg-[#0F172A] text-white px-6 py-3 rounded-lg font-bold">Generate Reactive Draft</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          <div className="p-4 bg-white border-b flex justify-between items-center no-print">
            <div className="flex items-center space-x-4">
              <button onClick={() => setIsGeneratorActive(true)} className="p-2 border rounded"><ArrowLeft size={16}/></button>
              <h2 className="font-bold">{selectedDoc?.title || "New Draft"}</h2>
            </div>
            <div className="flex space-x-2">
              <button onClick={handleSaveDraft} className="bg-[#0F172A] text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest">Save Draft</button>
              <button onClick={() => handleExportDoc("docx")} className="border px-4 py-2 rounded text-xs font-bold">Download Word</button>
              <button onClick={() => window.print()} className="border px-4 py-2 rounded text-xs font-bold">Print PDF</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-12 flex justify-center bg-gray-100">
            <div className="w-full max-w-4xl bg-white shadow-2xl p-16 min-h-[1000px] print-content">
              <textarea
                ref={editorRef}
                value={editorContent}
                onChange={e => setEditorContent(e.target.value)}
                className="w-full h-full border-none outline-none resize-none text-sm leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
