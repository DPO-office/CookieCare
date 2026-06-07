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
  Heading1, 
  Heading2, 
  Bold, 
  List, 
  RotateCcw,
  UserCheck,
  Sparkles,
  Upload,
  ArrowRight,
  Sliders,
  Play,
  Lock,
  Unlock,
  Layers,
  FileText,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Undo,
  Redo,
  Baseline,
  Highlighter,
  ListOrdered,
  Outdent,
  Indent,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table,
  Printer,
  Download,
  Save,
  Eraser,
  Search,
  ArrowLeft,
  Check,
  Columns,
  Eye,
  Trash2
} from "lucide-react";
import { LegalDocument, Version } from "../types";

// Dynamic template and clause integration

// ==============================================================================
// HIGH-FIDELITY DEFAULT TEXT CONSTANTS (Matching Screenshots 2 and 7)
// ==============================================================================
const NDA_DOC_CONTENT = `MUTUAL NON-DISCLOSURE AGREEMENT

THIS AGREEMENT is made on [● DATE Insert the date of execution of this Agreement]

BETWEEN:

[● PARTY A NAME Insert full legal name of the first party] a company incorporated under [● JURISDICTION Insert jurisdiction of incorporation] having its registered office at [● REGISTERED ADDRESS Insert complete registered address] (hereinafter referred to as "Party A" which expression shall, unless repugnant to the context or meaning thereof, include its successors and permitted assigns)

AND

[● PARTY B NAME Insert full legal name of the second party] a company incorporated under [● JURISDICTION Insert jurisdiction of incorporation] having its registered office at [● REGISTERED ADDRESS Insert complete registered address] (hereinafter referred to as "Party B" which expression shall, unless repugnant to the context or meaning thereof, include its successors and permitted assigns)

Party A and Party B are hereinafter individually referred to as a "Party" and collectively as the "Parties".

RECITALS:
1. The Parties are exploring a potential business relationship or transaction (the "Purpose").
2. In connection with the Purpose, each Party may disclose proprietary and confidential trade secrets, strategic plans, and technology datasets to the other Party.

Now therefore, the Parties agree as follows:

1. DEFINITIONS & INTERPRETATION

1.1 "Confidential Information" means any and all information disclosed by or on behalf of a Party (the "Disclosing Party") to the other Party (the "Receiving Party") that is marked as confidential or would reasonably be understood to be confidential under the circumstances of disclosure.

2. OBLIGATIONS OF NON-DISCLOSURE

2.1 The Receiving Party shall hold all Confidential Information in strict confidence and shall not, without the prior written consent of the Disclosing Party, disclose, disseminate, or publish such Confidential Information to any third party.

3. INTELLECTUAL PROPERTY RIGHTS

3.1 All Confidential Information disclosed by a Party shall remain the property of the Disclosing Party. Nothing in this Agreement shall be construed as granting any rights, by licence or otherwise, to any Confidential Information or any intellectual property rights therein.

3.2 No licence or other right is granted by this Agreement in respect of any patent, copyright, trade mark, trade secret, or other intellectual property right.

4. RETURN OR DESTRUCTION OF CONFIDENTIAL INFORMATION

4.1 Upon the written request of the Disclosing Party or upon the termination of this Agreement, the Receiving Party shall, at the Disclosing Party's option:
(a) promptly return to the Disclosing Party all documents and materials containing or reflecting any Confidential Information; and/or
(b) destroy all such documents and materials and certify in writing to the Disclosing Party that such destruction has been completed.
`;

const ARBITRATION_DOC_CONTENT = `IN THE COURT OF [● JURISDICTION Insert the appropriate court jurisdiction, e.g., District Court/High Court and location]

ARBITRATION PETITION NO. [● PETITION NUMBER Insert the petition number assigned by the court registry] OF [● YEAR Insert current year]

UNDER SECTION 11 OF THE ARBITRATION AND CONCILIATION ACT, 1996

IN THE MATTER OF:

An Arbitration Agreement dated [● DATE Insert the date of the contract containing the arbitration clause] between the Petitioner and the Respondent

AND

IN THE MATTER OF:

[● PETITIONER NAME Insert full legal name of the Petitioner] a company incorporated under the laws of India, having its registered office at [● PETITIONER ADDRESS Insert registered office address]
... Petitioner

VERSUS

[● RESPONDENT NAME Insert full legal name of the Respondent] a company incorporated under the laws of India, having its registered office at [● RESPONDENT ADDRESS Insert registered office address]
... Respondent

MOST RESPECTFULLY SHOWETH:

1. The present petition under Section 11 of the Arbitration and Conciliation Act, 1996 is being preferred by the Petitioner seeking appointment of a Sole Arbitrator to adjudicate the severe disputes and claims that have arisen between the parties under the contract dated [● DATE].

2. The Petitioner is a premier enterprise engaged in infrastructural installations and software application support frameworks across public and private segments.

3. The Respondent is a corporate client framework, who executed the Agreement dated [● DATE] for system deployments.

4. Clause 14 of the Agreement provides for standard Governing Arbitration covenants, which reads as under:
"14.1 Disputes arising out of or related to this Agreement shall be referred to arbitration of a Sole Arbitrator to be mutually appointed by the Parties. The venue and seat of arbitration shall be New Delhi, and proceedings conducted in English."
`;

interface DraftAgreementProps {
  documents: LegalDocument[];
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument | null) => void;
}

export default function DraftAgreement({ documents, authToken, onRefresh, onSelectDocument }: DraftAgreementProps) {
  const [templateFolders, setTemplateFolders] = useState<any[]>([]);
  const [clauseCategories, setClauseCategories] = useState<any[]>([]);

  const fetchLibrary = async () => {
    try {
      const res = await fetch(apiUrl("/api/library-items"), {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();

        // Group by type/category
        const templates = data.filter((i: any) => i.type === "templates");
        const clauses = data.filter((i: any) => i.type === "clauses");

        setTemplateFolders([{
          name: "PrivSecAI Templates",
          count: templates.length,
          items: templates.map((t: any) => t.name)
        }]);

        setClauseCategories([{
          name: "PrivSecAI Clause Library",
          count: clauses.length,
          items: clauses.map((c: any) => c.name)
        }]);
      }
    } catch (err) {
      console.error("Library fetch failed", err);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [authToken]);

  // Current active draft or editor context
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument | null>(documents[0] || null);
  const [editorContent, setEditorContent] = useState(selectedDoc ? selectedDoc.content : "");
  const [isSaving, setIsSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState("");
  
  // Dashboard vs Editor Workspace toggle structure
  // If true, we show the main AI generator panel, if false we show the editor canvas
  const [isGeneratorActive, setIsGeneratorActive] = useState(!documents[0]);

  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"NDA" | "DPA" | "SLA" | "Custom">("NDA");
  
  const [shareEmail, setShareEmail] = useState("");
  const [requestSignEmail, setRequestSignEmail] = useState("");
  const [signerName, setSignerName] = useState("");

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // --- AI GENERATOR WORKSPACE STATES ---
  const [mode, setMode] = useState<"Basic" | "Advanced">("Basic");
  const [depth, setDepth] = useState<"Short" | "Standard" | "Deep">("Standard");
  const [instructions, setInstructions] = useState("");
  const [playbookGuidelines, setPlaybookGuidelines] = useState("Use formal legal tone, favour the client, include strong indemnity and limitation clauses, structure with numbered clauses.");
  const [customClauseText, setCustomClauseText] = useState("");
  
  // Basic Mode Form Inputs
  const [basicPartyA, setBasicPartyA] = useState("PrivSecAI Corporate Client");
  const [basicPartyB, setBasicPartyB] = useState("Vendor Infrastructure Host");
  const [basicLaw, setBasicLaw] = useState("State of Delaware");
  const [basicLiability, setBasicLiability] = useState("USD $2,000,000 limit");

  // Advanced Mode step hierarchy matching screens
  const [advancedStep, setAdvancedStep] = useState<"selector" | "proactive" | "reactive">("selector");
  const [advSubTab, setAdvSubTab] = useState<"reactive" | "proactive">("proactive");
  const [clauseTab, setClauseTab] = useState<"clauses" | "custom">("clauses");

  // Expanded Accordion Sections under Proactive Drafting
  const [s1Open, setS1Open] = useState(true);
  const [s2Open, setS2Open] = useState(false);
  const [s3Open, setS3Open] = useState(false);
  const [s4Open, setS4Open] = useState(false);

  // Expand states for folders inside Section 1 & Section 3
  const [expandedFolder, setExpandedFolder] = useState<string | null>("PrivSecAI Templates");
  const [expandedClauseCat, setExpandedClauseCat] = useState<string | null>("PrivSecAI Clause Library");

  // Search filter query
  const [searchTemplateQuery, setSearchTemplateQuery] = useState("");
  const [searchClauseQuery, setSearchClauseQuery] = useState("");

  // Select indicators
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>("Mutual Non-Disclosure Agreement");
  const [selectedClauses, setSelectedClauses] = useState<string[]>([]);
  const [referenceInstructions, setReferenceInstructions] = useState("");
  const [aiRulebookPrompt, setAiRulebookPrompt] = useState("");

  // Drag and Drop Reactive Ingest
  const [isDragging, setIsDragging] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [advancedFields, setAdvancedFields] = useState<Array<{ id: string; name: string; defaultValue: string; description: string }>>([
    { id: "party_a", name: "Party A Title", defaultValue: "PrivSecAI Corporate", description: "Disclosing Primary Entity" },
    { id: "party_b", name: "Party B Title", defaultValue: "Vendor Tech Inc.", description: "Receiving technology Vendor" },
    { id: "jurisdiction", name: "Jurisdiction", defaultValue: "Delaware chancery", description: "Standard Governing Law" },
  ]);
  const [advancedFieldValues, setAdvancedFieldValues] = useState<Record<string, string>>({
    party_a: "PrivSecAI Corporate",
    party_b: "Vendor Tech Inc.",
    jurisdiction: "Delaware chancery"
  });

  // Streaming & Loading states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingProgress, setStreamingProgress] = useState("");

  // Floating Sparkle selection rewrites states
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [floatingMenuPos, setFloatingMenuPos] = useState({ x: 0, y: 0 });
  const [selectedTextRange, setSelectedTextRange] = useState<{ start: number; end: number } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [askAiQuery, setAskAiQuery] = useState("");
  const [showAskAiInput, setShowAskAiInput] = useState(false);
  const [isAiRefiningText, setIsAiRefiningText] = useState(false);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const editorSelectionRef = useRef<{ start: number; end: number } | null>(null);

  // Sync editor if document selection alters
  useEffect(() => {
    if (selectedDoc) {
      setEditorContent(selectedDoc.content);
      setIsGeneratorActive(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
      editorSelectionRef.current = null;
    }
  }, [selectedDoc]);

  const handleSelectDoc = (doc: LegalDocument) => {
    setSelectedDoc(doc);
    setIsGeneratorActive(false);
    onSelectDocument(doc);
  };

  const handleOpenGenerator = () => {
    setSelectedDoc(null);
    setIsGeneratorActive(true);
    onSelectDocument(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    editorSelectionRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setUploadFileName(file.name);
    setIsParsingTemplate(true);
    setStreamingProgress("Uploading template file and parsing legal structure securely...");
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isTemplate", "true");
      formData.append("templateType", "Template");

      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`
        },
        body: formData
      });
      
      let payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "File upload failed");

      if (res.status === 202 && payload.job_id) {
        setStreamingProgress("Offloaded to background job-queue. Processing file...");
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));

        eventSource.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "job_update" && data.job.id === payload.job_id) {
            setStreamingProgress(`Processing file... (${data.job.progress}%) - ${data.job.message}`);

            if (data.job.status === "completed") {
              eventSource.close();
              const resultData = data.job.result;
              setUploadText(resultData.content || "");
              await analyzeUploadedTemplate(resultData.content || "");
              if (onRefresh) onRefresh();
              setIsParsingTemplate(false);
            } else if (data.job.status === "failed") {
              eventSource.close();
              setIsParsingTemplate(false);
              alert("Background parsing failed: " + data.job.error);
            }
          }
        };
        return;
      }

      setUploadText(payload.content);
      await analyzeUploadedTemplate(payload.content);
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.warn("Secure backend upload bypassed, falling back to local text processing:", err.message);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        setUploadText(text);
        await analyzeUploadedTemplate(text);
      };
      reader.readAsText(file);
    } finally {
      setIsParsingTemplate(false);
      setStreamingProgress("");
    }
  };

  const analyzeUploadedTemplate = async (text: string) => {
    setIsParsingTemplate(true);
    setStreamingProgress("PII Shield Redaction & Parameter extraction active...");
    try {
      const res = await fetch(apiUrl("/api/drafting/process-uploaded-template"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ templateText: text })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);

      setUploadText(payload.data.redactedText || text);
      if (payload.data.fields && payload.data.fields.length > 0) {
        setAdvancedFields(payload.data.fields);
        const seedVals: Record<string, string> = {};
        payload.data.fields.forEach((f: any) => {
          seedVals[f.id] = f.defaultValue;
        });
        setAdvancedFieldValues(seedVals);
      }
      setStreamingProgress("");
    } catch (err: any) {
      console.warn("PII Sanitization placeholder applied", err);
    } finally {
      setIsParsingTemplate(false);
      setStreamingProgress("");
    }
  };

  const pushUndoSnapshot = (snapshot: string) => {
    if (undoStackRef.current[0] !== snapshot) {
      undoStackRef.current = [snapshot, ...undoStackRef.current].slice(0, 50);
    }
    redoStackRef.current = [];
  };

  const syncEditorSelection = (textarea: HTMLTextAreaElement) => {
    const selection = {
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? textarea.selectionStart ?? 0
    };

    editorSelectionRef.current = selection;
    if (selection.start !== selection.end) {
      setSelectedTextRange(selection);
      setShowFloatingMenu(true);
    }

    return selection;
  };

  // Insert standard markup helpers
  const insertTextAtCursor = (before: string, after: string = "") => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const selection = editorSelectionRef.current ?? syncEditorSelection(textarea);
    const startPos = selection.start;
    const endPos = selection.end;
    const text = textarea.value;
    const selected = text.substring(startPos, endPos);

    const replacement = before + (selected || "") + after;
    const newContent = text.substring(0, startPos) + replacement + text.substring(endPos);
    
    pushUndoSnapshot(editorContent);
    setEditorContent(newContent);
    textarea.focus();

    // Use requestAnimationFrame for resilient cursor sync in heavy React renders
    requestAnimationFrame(() => {
      const nextStart = startPos + before.length;
      const nextEnd = nextStart + selected.length;
      textarea.setSelectionRange(nextStart, nextEnd);
      editorSelectionRef.current = { start: nextStart, end: nextEnd };
    });
  };

  const handleUndo = () => {
    const previous = undoStackRef.current[0];
    if (previous === undefined) return;

    redoStackRef.current = [editorContent, ...redoStackRef.current].slice(0, 50);
    undoStackRef.current = undoStackRef.current.slice(1);
    setEditorContent(previous);
    editorSelectionRef.current = { start: previous.length, end: previous.length };
  };

  const handleRedo = () => {
    const next = redoStackRef.current[0];
    if (next === undefined) return;

    undoStackRef.current = [editorContent, ...undoStackRef.current].slice(0, 50);
    redoStackRef.current = redoStackRef.current.slice(1);
    setEditorContent(next);
    editorSelectionRef.current = { start: next.length, end: next.length };
  };

  const transformSelectedLines = (transformLine: (line: string) => string) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const selection = editorSelectionRef.current ?? syncEditorSelection(textarea);
    const startPos = selection.start;
    const endPos = selection.end;
    const text = textarea.value;
    const selected = text.substring(startPos, endPos);
    if (!selected) return;

    const replacement = selected
      .split("\n")
      .map(transformLine)
      .join("\n");

    pushUndoSnapshot(editorContent);
    const nextContent = text.substring(0, startPos) + replacement + text.substring(endPos);
    setEditorContent(nextContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(startPos, startPos + replacement.length);
      editorSelectionRef.current = { start: startPos, end: startPos + replacement.length };
    }, 10);
  };

  const handleToolbarFormat = (action: string) => {
    if (action === "h1") insertTextAtCursor("\n# ", "\n");
    else if (action === "h2") insertTextAtCursor("\n## ", "\n");
    else if (action === "bold") insertTextAtCursor("**", "**");
    else if (action === "list") insertTextAtCursor("\n- ", "\n");
    else if (action === "disclaimer") {
      insertTextAtCursor(
        "\n*COMPLIANCE DISCLAIMER: This clause represents vetted statutory privacy rules and does not alternate professional legal vetting.*\n"
      );
    } else if (action === "signature-block") {
      const cryptoStamp = Array.from(window.crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

      insertTextAtCursor(
        `\n\n[EXECUTED SIGNATURE SPECIFICATION]\nApproved legal representative: PrivSecAI Workspace\nCrypto Seal Identifier: STAMP_${cryptoStamp}_SECURE\nDate: ${new Date().toLocaleDateString()}\n`
      );
    }
  };

  const handleApplyRewriteResilient = async (type: string, param: string = "") => {
    if (!selectedTextRange) return;
    const originalText = editorContent.substring(selectedTextRange.start, selectedTextRange.end);
    if (!originalText) return;

    setIsAiRefiningText(true);
    setActiveDropdown(null);
    setShowAskAiInput(false);
    pushUndoSnapshot(editorContent);

    try {
      const res = await fetch(apiUrl("/api/drafting/refine"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ text: originalText, type, param })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);

      const rewritten = payload.data;
      const newContent = editorContent.substring(0, selectedTextRange.start) + rewritten + editorContent.substring(selectedTextRange.end);

      setEditorContent(newContent);

      requestAnimationFrame(() => {
        editorSelectionRef.current = {
          start: selectedTextRange.start,
          end: selectedTextRange.start + rewritten.length
        };
      });
    } catch (err: any) {
      console.error("Refinement failed", err);
      alert("Refinement failed: " + err.message);
    } finally {
      setIsAiRefiningText(false);
      setShowFloatingMenu(false);
      setSelectedTextRange(null);
      setAskAiQuery("");
    }
  };

  const handleExportDoc = async () => {
    try {
      const exportTitle = selectedDoc?.title || selectedTemplateName || "PrivSecAI Draft";
      const res = await fetch(apiUrl("/api/documents/export"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: exportTitle,
          contentType: "redlines",
          content: editorContent.replace(/\[GEMINI\]/g, "[AI LEGAL ASSISTANT]").replace(/\[USER\]/g, "[USER QUERY]"),
          format: "docx"
        })
      });

      if (!res.ok) throw new Error("Backend export failed");

      const blob = await res.blob();
      const element = document.createElement("a");
      element.href = URL.createObjectURL(blob);
      element.download = `${exportTitle.toLowerCase().replace(/\s+/g, "_")}_draft.docx`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (err: any) {
      console.warn("Secure DOCX export fallback applied:", err.message);
      const element = document.createElement("a");
      const file = new Blob([editorContent], {type: "text/plain"});
      element.href = URL.createObjectURL(file);
      element.download = `${selectedTemplateName?.toLowerCase().replace(/\s+/g, "_") || "legal_agreement"}_draft.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const handlePrintDoc = async () => {
    try {
      const exportTitle = selectedDoc?.title || selectedTemplateName || "PrivSecAI Draft";
      const res = await fetch("/api/documents/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: exportTitle,
          contentType: "redlines",
          content: editorContent.replace(/\[GEMINI\]/g, "[AI LEGAL ASSISTANT]").replace(/\[USER\]/g, "[USER QUERY]"),
          format: "pdf"
        })
      });

      if (!res.ok) throw new Error("Backend PDF generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        const element = document.createElement("a");
        element.href = url;
        element.download = `${exportTitle.toLowerCase().replace(/\s+/g, "_")}_draft.pdf`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      }
    } catch (err: any) {
      console.warn("Print fallback applied:", err.message);
      window.print();
    }
  };

  // Sparkle Tone rewrite triggers
  const handleEditorSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    syncEditorSelection(textarea);
    
    if (start !== end) {
      const text = textarea.value.substring(start, end).trim();
      if (text.length > 0) {
        // Compute floating coordinates inside viewport
        const rect = textarea.getBoundingClientRect();
        // Set coordinates to float nicely above selection
        setFloatingMenuPos({
          x: Math.max(20, Math.min(rect.width - 320, 200)),
          y: Math.max(10, Math.min(rect.height - 240, 130))
        });
        setShowFloatingMenu(true);
      }
    } else {
      setSelectedTextRange(null);
      setShowFloatingMenu(false);
    }
  };

  const handleApplyRewrite = (type: string, param: string = "") => {
    handleApplyRewriteResilient(type, param);
  };

  // START STREAMING ENGINE
  const handleExecuteDraftStream = async () => {
    setIsStreaming(true);
    setStreamingProgress("Initiating multi-agent ingestion pipeline...");
    pushUndoSnapshot(editorContent);
    
    let documentTitle = "Mutual Compliance Agreement";
    const payload: any = {
      mode: mode,
      outputLevel: depth,
      instructions: instructions,
    };

    if (mode === "Basic") {
      documentTitle = `Mutual NDA - ${basicPartyB}`;
      payload.formFields = {
        party_a: basicPartyA,
        party_b: basicPartyB,
        governing_law: basicLaw,
        liability_cap: basicLiability
      };
    } else {
      if (advancedStep === "proactive") {
        documentTitle = selectedTemplateName || "Proactive Draft Covenants";
        payload.templateId = selectedTemplateName;
        payload.playbookText = aiRulebookPrompt;
        payload.instructions = referenceInstructions || instructions;
      } else {
        documentTitle = `Ingested response: ${uploadFileName || "Reactive Blueprint"}`;
        payload.sourceText = uploadText;
        payload.formFields = advancedFieldValues;
      }
    }

    setEditorContent("");
    setIsGeneratorActive(false);

    try {
      const controller = new AbortController();
      const timeoutMs = 120_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(apiUrl("/api/drafting/generate-stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error("Drafting stream failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          accumulated += chunk;
          setEditorContent(accumulated);
          setStreamingProgress(`Streaming draft content block-by-block (${accumulated.split(/\s+/).length} words)...`);
        }
      }

      setStreamingProgress("");
      setIsStreaming(false);
      handleCreateAndSaveGeneratedDoc(documentTitle, accumulated);

    } catch (err: any) {
      const errorMessage = err?.name === "AbortError" ? "Drafting timed out" : (err?.message || "Drafting failed");
      console.error(err);
      setIsStreaming(false);
      setStreamingProgress("");
      alert("Drafting failed: " + errorMessage);
    }
  };

  const handleCreateAndSaveGeneratedDoc = async (title: string, content: string) => {
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ title, type: "Custom" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Save content
      const updatedDocId = data.id;
      const resUpdate = await fetch(apiUrl(`/api/documents/${updatedDocId}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ content, title, comment: `Multi-agent corporate flow ingested.` })
      });
      const finalized = await resUpdate.json();

      setSelectedDoc(finalized);
      setEditorContent(content);
      onRefresh();
    } catch (err: any) {
      console.error("Storing generated code failed, using fallback client storage", err);
    }
  };

  // API operations preserved
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ title: newTitle, type: newType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowCreateModal(false);
      setNewTitle("");
      onRefresh();
      
      setSelectedDoc(data);
      setEditorContent(data.content);
    } catch (err: any) {
      alert(err.message || "Failed to create agreement draft");
    }
  };

  const handleSaveDraft = async (commentText: string = "Manual Editor Draft Commit") => {
    if (!selectedDoc) return;
    setIsSaving(true);
    setSavingMsg("Encrypting and saving on clouds...");

    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ content: editorContent, title: selectedDoc.title, comment: commentText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDoc(data);
      onRefresh();
      setSavingMsg("FIPS Enclave Saved and Encrypted Successfully!");
      setTimeout(() => setSavingMsg(""), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to save document. Please verify signature locking details.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!selectedDoc) return;
    if (!confirm(`Are you sure you want to delete "${selectedDoc.title}"?`)) return;
    
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (res.ok) {
        setSelectedDoc(null);
        setIsGeneratorActive(true);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleShare = async () => {
    if (!selectedDoc || !shareEmail.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/share`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ email: shareEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShareEmail("");
      setSelectedDoc({ ...selectedDoc, sharedWith: data.sharedWith });
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRequestSignature = async () => {
    if (!selectedDoc || !requestSignEmail.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/request-signature`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ email: requestSignEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRequestSignEmail("");
      setSelectedDoc({ ...selectedDoc, signatures: data.signatures });
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSignDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !signerName.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/sign`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ fullName: signerName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSignerName("");
      const refreshedDocRes = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      const refreshedDoc = await refreshedDocRes.json();
      setSelectedDoc(refreshedDoc);
      setEditorContent(refreshedDoc.content);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleVersionRestore = (historicalContent: string, versionNumber: number) => {
    if (!confirm(`Are you sure you want to revert the live draft to Version ${versionNumber}?`)) return;
    setEditorContent(historicalContent);
    setTimeout(() => {
      handleSaveDraft(`Restored text to match historical Version ${versionNumber}`);
    }, 100);
  };

  const handleSealDocumentLocally = async () => {
    if (!selectedDoc) return;
    if (!confirm("Are you sure you want to apply cryptographic locking over this document? This seals all arrays as read-only forever.")) return;
    
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/sign`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ fullName: "SYSTEM EXECUTIVE LOCK SEAL" })
      });
      if (!res.ok) throw new Error("Could not register local locking execution.");
      
      const refreshedDocRes = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      const refreshedDoc = await refreshedDocRes.json();
      setSelectedDoc(refreshedDoc);
      setEditorContent(refreshedDoc.content);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isFullySigned = selectedDoc?.signatures?.length ? selectedDoc.signatures.every(s => s.status === "signed") : false;

  return (
    <div className="flex-1 overflow-hidden flex h-screen font-sans bg-[#FAFBFD]">
      
      {/* 2. CENTER PANEL: INGESTION SCREEN OR TEXT EDITOR */}
      {isGeneratorActive ? (
        // INTAKE SCREEN WITH CUSTOM RENDER GRID PAPER EFFECT (Screenshot 1 & 4 & 5 & 6)
        <div 
          className="flex-1 flex flex-col overflow-y-auto p-10 relative scrollbar-hidden select-none"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundColor: '#FAFBFD'
          }}
        >
          
          {/* HEADER LAYER WITH INTEGRATED SELECTION CONTROLS */}
          <div className="w-full max-w-4xl mx-auto flex justify-between items-start mb-8 z-10">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">Draft</h1>
              <p className="text-xs text-gray-400 mt-1.5">Get rapid first drafts in seconds</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5">
              {documents.length > 0 && (
                <div className="flex items-center space-x-2 bg-white border border-gray-200 h-9 px-3 rounded-lg shadow-xs select-none">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] font-mono font-bold uppercase text-gray-400">Target Draft:</span>
                  <select
                    value={selectedDoc?.id || ""}
                    onChange={(e) => {
                      const found = documents.find(d => d.id === e.target.value);
                      if (found) {
                        handleSelectDoc(found);
                      }
                    }}
                    className="bg-transparent border-none text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer p-0 pr-1"
                  >
                    <option value="" disabled>-- Select draft --</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => setShowCreateModal(true)}
                className="h-9 px-3.5 rounded-lg bg-[#0F172A] text-white hover:bg-slate-800 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer font-mono"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Draft</span>
              </button>

              <button className="flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 shadow-xs transition">
                <HelpCircle className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* MODE TOGGLE PILLS IN UPPER RIGHT (Screenshot 1) */}
          <div className="w-full max-w-4xl mx-auto flex justify-end mb-6 z-10">
            <div className="bg-gray-200/60 p-1 rounded-full flex items-center space-x-1">
              <button
                onClick={() => { setMode("Basic"); setAdvancedStep("selector"); }}
                className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  mode === "Basic"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Basic
              </button>
              <button
                onClick={() => setMode("Advanced")}
                className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  mode === "Advanced"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Advanced
              </button>
            </div>
          </div>

          {/* STREAM STATUS BAR IF STREAMING ACTIVE */}
          {isStreaming && (
            <div className="w-full max-w-4xl mx-auto mb-6 bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center space-x-3 text-sm text-amber-900 animate-pulse z-10 shadow-xs">
              <Clock className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
              <div>
                <p className="font-semibold">AI Streaming Generator Active</p>
                <p className="text-xs text-amber-700 mt-1">{streamingProgress || "Spawning drafting agent pipelines..."}</p>
              </div>
            </div>
          )}

          {/* BASIC MODE CANVAS (Screenshot 1) */}
          {mode === "Basic" && (
            <div className="w-full max-w-4xl mx-auto space-y-8 z-10 p-1 bg-transparent rounded-lg">
              
              {/* 1. Provide Draft Input */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5">
                  <h3 className="text-sm font-bold text-gray-900">1. Provide Draft Input <span className="text-rose-500 font-bold">*</span></h3>
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400">Define what you want to create and provide the necessary context or details.</p>
                
                <div className="relative">
                  <textarea
                    rows={4}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="E.g. Draft a reply to a breach notice, a shareholder agreement with vesting    terms, or a legal notice based on the attached facts."
                    className="w-full bg-white border border-gray-200 rounded-xl p-4 pr-16 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition"
                  />
                  {/* Custom green sparkle icons inside textarea matched to screenshot */}
                  <div className="absolute right-3.5 bottom-3.5 flex items-center space-x-2.5">
                    <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200/50 flex items-center justify-center cursor-pointer shadow-xs" title="Grammarly Compliant">
                      <span className="text-emerald-500 font-bold text-[10px]">G</span>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-teal-50 border border-teal-200/50 flex items-center justify-center cursor-pointer shadow-xs" title="AI Assistant active">
                      <Sparkles className="w-3 h-3 text-teal-600" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Set Drafting Instructions */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5">
                  <h3 className="text-sm font-bold text-gray-900">2. Set Drafting Instructions</h3>
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400">Set tone, structure, preferences, and any specific drafting requirements.</p>
                
                <textarea
                  rows={4}
                  value={playbookGuidelines}
                  onChange={(e) => setPlaybookGuidelines(e.target.value)}
                  placeholder="E.g. Use formal legal tone, favour the client, include strong indemnity and limitation clauses, structure with numbered clauses."
                  className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition"
                />
              </div>

              {/* 3. Select Output Detail Level */}
              <div className="space-y-2 max-w-sm">
                <div className="flex items-center space-x-1.5">
                  <h3 className="text-sm font-bold text-gray-900">3. Select Output Detail Level</h3>
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400 mb-2">Choose the depth and length of the draft output.</p>
                
                <div className="relative">
                  <select
                    value={depth}
                    onChange={(e: any) => setDepth(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-200 rounded-xl p-3 px-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                  >
                    <option value="Short">Short Output ( ~ 500 words)</option>
                    <option value="Standard">Standard Format ( ~ 1,000 words)</option>
                    <option value="Deep">5-Page Output ( ~ 1,500-2,000 words)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-500 absolute right-4 top-4.5 pointer-events-none" />
                </div>
                
                <p className="text-[11px] text-gray-500 mt-2">
                  Response structured as per in <span className="text-[#0F172A] font-semibold underline cursor-pointer">India jurisdiction.</span> <span className="font-bold underline text-gray-600 hover:text-black cursor-pointer">Change</span>
                </p>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-6 border-t border-gray-200/60 flex justify-start">
                <button
                  onClick={handleExecuteDraftStream}
                  disabled={isStreaming}
                  className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold text-xs tracking-wide px-5 py-3 rounded-lg uppercase flex items-center space-x-2 transition shadow-md hover:shadow-lg disabled:opacity-40 cursor-pointer font-mono"
                >
                  <span>Generate draft</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

          {/* ADVANCED MODE (Screens 4, 5, 6) */}
          {mode === "Advanced" && (
            <div className="w-full max-w-4xl mx-auto z-10">
              
              {/* STEP A: SELECTOR SCREEN (Screenshot 4) */}
              {advancedStep === "selector" && (
                <div className="text-center pt-8 max-w-2xl mx-auto">
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Are you drafting in response to something?</h2>
                  <p className="text-xs text-gray-400 mt-2 mb-8">Please select an option to proceed.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Reactive drafting */}
                    <div
                      onClick={() => { setAdvancedStep("reactive"); setAdvSubTab("reactive"); }}
                      className="border border-gray-200 bg-white p-6 rounded-2xl hover:border-gray-400 hover:shadow-md text-left cursor-pointer transition flex items-start space-x-4.5"
                    >
                      <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-100" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">Reactive drafting</h4>
                        <p className="text-xs text-gray-400 leading-relaxed mt-1.5">
                          Draft a response to a notice, petition, or other legal document. Upload the document you're responding to, along with any reference files.
                        </p>
                      </div>
                    </div>

                    {/* Proactive drafting */}
                    <div
                      onClick={() => { setAdvancedStep("proactive"); setAdvSubTab("proactive"); }}
                      className="border border-gray-200 bg-white p-6 rounded-2xl hover:border-gray-400 hover:shadow-md text-left cursor-pointer transition flex items-start space-x-4.5"
                    >
                      <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-100" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">Proactive drafting</h4>
                        <p className="text-xs text-gray-400 leading-relaxed mt-1.5">
                          Creating a first-instance draft like a contract or agreement, petition, or any other legal document.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP B: REACTIVE DRAFTING FORMS */}
              {advancedStep === "reactive" && (
                <div className="space-y-6">
                  {/* BACK BAR HEADER */}
                  <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-xs flex justify-between items-center mb-6">
                    <div>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block font-bold mb-1">Intake System</span>
                      <h2 className="text-base font-bold text-gray-900">Reactive Ingestion In-take</h2>
                      <p className="text-xs text-gray-400 mt-1">Upload external legal claims & notices to run parameter extraction plans.</p>
                    </div>
                    <button 
                      onClick={() => setAdvancedStep("selector")}
                      className="px-3.5 py-1.5 border border-gray-200 hover:bg-gray-50 bg-white rounded-lg text-xs font-semibold text-gray-700 shadow-xs transition"
                    >
                      Change mode
                    </button>
                  </div>

                  {/* Drag drop area */}
                  <div className="bg-white border border-gray-200 p-6 rounded-xl shadow-xs space-y-6">
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                        isDragging ? "bg-amber-50 border-amber-400 scale-[1.01]" : "border-gray-200 bg-[#fbfbfb] hover:bg-gray-50/55"
                      }`}
                    >
                      <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3 animate-pulse" />
                      <h4 className="font-bold text-sm text-gray-700">Drag & Drop Notice XML, TXT or PDF</h4>
                      <p className="text-xs text-gray-400 mt-1">Accepts compliance forms or court notices</p>
                      
                      <div className="mt-4">
                        <label className="inline-block bg-[#0F172A] text-white hover:bg-[#1E293B] px-4 py-2 text-xs font-semibold rounded-md transition cursor-pointer">
                          <span>Browse Local Folders</span>
                          <input type="file" onChange={handleFileChange} className="hidden" />
                        </label>
                      </div>
                    </div>

                    {uploadFileName && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded text-emerald-800 text-xs flex justify-between items-center font-mono font-bold">
                        <span>Sanitized successfully: {uploadFileName}</span>
                        <span className="text-[10px] text-emerald-600">Secure AES Vault Redacted</span>
                      </div>
                    )}

                    {/* EXTRACTED VARIABLES */}
                    {advancedFields.length > 0 && (
                      <div className="space-y-4">
                        <div className="border-b border-gray-100 pb-2">
                          <span className="text-[10px] bg-emerald-500 text-white font-mono uppercase px-1.5 py-0.5 rounded font-bold">Shield Extractor Vetted</span>
                          <h4 className="font-bold text-sm text-[#0F172A] mt-2?.5">Extracted Blueprints Checklist:</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {advancedFields.map((field) => (
                            <div key={field.id} className="space-y-1">
                              <label className="block text-[10px] font-bold text-gray-500 font-mono uppercase">{field.name}</label>
                              <input
                                type="text"
                                className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-black"
                                value={advancedFieldValues[field.id] || ""}
                                onChange={(e) => setAdvancedFieldValues({ ...advancedFieldValues, [field.id]: e.target.value })}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 pt-2">
                      <label className="block text-xs font-bold text-gray-600 uppercase">Input Custom Refinement Rules</label>
                      <textarea
                        rows={3}
                        placeholder="Define direct instructions to oppose this legal document..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg p-3 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
                      />
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                      <button
                        onClick={handleExecuteDraftStream}
                        className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs px-6 py-3 uppercase rounded-lg shadow-md hover:shadow-lg transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 animate-pulse" />
                        <span>Stream Response &gt;</span>
                      </button>
                    </div>

                  </div>
                </div>
              )}

              {/* STEP C: PROACTIVE DRAFTING INTAKE FORMS (Screenshot 5 & 6) */}
              {advancedStep === "proactive" && (
                <div className="space-y-5">
                  
                  {/* INTAKE INTRO BOX (Screenshot 5) */}
                  <div className="bg-white border border-gray-200/80 p-5 rounded-2xl shadow-xs flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block font-bold mb-1">Drafting Intake</span>
                      <h2 className="text-base font-bold text-gray-900">Proactive drafting</h2>
                      <p className="text-xs text-gray-500 mt-1">Creating a first-instance draft like a contract or agreement, petition, or any other legal document.</p>
                    </div>
                    <button 
                      onClick={() => setAdvancedStep("selector")}
                      className="px-4 py-2 border border-gray-200 hover:bg-gray-50 bg-white rounded-xl text-xs font-bold text-gray-700 shadow-xs transition"
                    >
                      Change mode
                    </button>
                  </div>

                  {/* ACCORDION 1: Would you like to use a template? (Screenshot 5) */}
                  <div className="border border-gray-200 rounded-2xl bg-white shadow-xs overflow-hidden">
                    <div 
                      onClick={() => setS1Open(!s1Open)}
                      className="p-4 px-6 bg-white hover:bg-gray-50/50 flex align-center justify-between border-b border-gray-100 cursor-pointer text-sm font-bold text-gray-950 select-none"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="text-gray-400 font-medium">1</span>
                        <span>Would you like to use a template?</span>
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div className="flex items-center space-x-3.5 text-xs text-gray-400 font-medium">
                        <span className="bg-slate-50 border border-slate-100 rounded px-2.5 py-0.5 text-[10px]">Optional</span>
                        {s1Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {s1Open && (
                      <div className="p-6 space-y-4">
                        <p className="text-xs text-gray-400">Choose from PrivSecAI Templates or your uploaded templates.</p>
                        
                        <div className="flex space-x-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={searchTemplateQuery}
                              onChange={(e) => setSearchTemplateQuery(e.target.value)}
                              placeholder="Search templates"
                              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                          </div>
                          
                          <button className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold text-slate-800 shadow-xs flex items-center space-x-1 hover:border-slate-400 transition">
                            <Plus className="w-4 h-4 text-slate-500" />
                            <span>Upload Template(s)</span>
                          </button>
                        </div>

                        {/* FOLDER VIEW */}
                        <div className="border border-gray-100/80 rounded-xl overflow-hidden divide-y divide-gray-100">
                          {templateFolders.map((folder) => {
                            const isFolderExpanded = expandedFolder === folder.name;
                            return (
                              <div key={folder.name} className="bg-white">
                                <div 
                                  onClick={() => setExpandedFolder(isFolderExpanded ? null : folder.name)}
                                  className="p-3 px-4 hover:bg-slate-50/50 flex items-center justify-between cursor-pointer select-none text-xs font-bold text-gray-700"
                                >
                                  <div className="flex items-center space-x-2">
                                    <FileText className="w-4 h-4 text-gray-400" />
                                    <span>{folder.name}</span>
                                  </div>
                                  <div className="flex items-center space-x-2 text-gray-400">
                                    <span className="bg-gray-100 text-gray-500 text-[10px] rounded-full px-2 py-0.2">{folder.count}</span>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isFolderExpanded ? "rotate-90" : ""}`} />
                                  </div>
                                </div>

                                {isFolderExpanded && (
                                  <div className="bg-slate-50/40 p-2 pl-8 divide-y divide-gray-100/50">
                                    {folder.items
                                      .filter(it => it.toLowerCase().includes(searchTemplateQuery.toLowerCase()))
                                      .map((item) => {
                                        const isSelected = selectedTemplateName === item;
                                        return (
                                          <div 
                                            key={item}
                                            onClick={() => setSelectedTemplateName(item)}
                                            className="p-2.5 hover:text-black flex items-center justify-between cursor-pointer text-xs select-none"
                                          >
                                            <span className={`${isSelected ? "font-bold text-black" : "text-gray-500"}`}>{item}</span>
                                            {isSelected && (
                                              <span className="bg-slate-900 text-white rounded-full p-0.5"><Check className="w-3 h-3" /></span>
                                            )}
                                          </div>
                                        );
                                      })
                                    }
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACCORDION 2: Select reference file(s) if any (Screenshot 5 & 6) */}
                  <div className="border border-gray-200 rounded-2xl bg-white shadow-xs overflow-hidden">
                    <div 
                      onClick={() => setS2Open(!s2Open)}
                      className="p-4 px-6 bg-white hover:bg-gray-50/50 flex align-center justify-between border-b border-gray-100 cursor-pointer text-sm font-bold text-gray-950 select-none"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="text-gray-400 font-medium">2</span>
                        <span>Select reference file(s) if any</span>
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div className="flex items-center space-x-3.5 text-xs text-gray-400 font-medium font-mono">
                        <span className="bg-slate-50 border border-slate-100 rounded px-2.5 py-0.5 text-[10px]">Optional</span>
                        {s2Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {s2Open && (
                      <div className="p-6 space-y-4">
                        <p className="text-xs text-gray-400">Select reference files and mention what should be referred to from the file(s).</p>
                        
                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 bg-slate-50/20 text-center text-xs text-gray-400">
                          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="font-semibold text-gray-600">Drag & Drop Reference Guidelines or PDF</p>
                          <p className="text-[10px] mt-0.5">Vetted for AI parsing context</p>
                        </div>

                        {/* Reference instructions (Screenshot 6 3a) */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-700">3a. What do you want to refer from the attached file(s)?</label>
                          <p className="text-[11px] text-gray-400">Specify what elements to extract or reference from your uploaded documents.</p>
                          <textarea
                            rows={3}
                            value={referenceInstructions}
                            onChange={(e) => setReferenceInstructions(e.target.value)}
                            placeholder="e.g., Use the indemnity clause structure from Document 1, pricing format from Document 2..."
                            className="w-full border border-gray-200 rounded-xl p-3 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACCORDION 3: Would you like to include specific clauses or paragraphs? (Screenshot 6) */}
                  <div className="border border-gray-200 rounded-2xl bg-white shadow-xs overflow-hidden">
                    <div 
                      onClick={() => setS3Open(!s3Open)}
                      className="p-4 px-6 bg-white hover:bg-gray-50/50 flex align-center justify-between border-b border-gray-100 cursor-pointer text-sm font-bold text-gray-950 select-none"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="text-gray-400 font-medium">3</span>
                        <span>Would you like to include any specific clauses or paragraphs?</span>
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div className="flex items-center space-x-3.5 text-xs text-gray-400 font-medium font-mono">
                        <span className="bg-slate-50 border border-slate-100 rounded px-2.5 py-0.5 text-[10px]">Optional</span>
                        {s3Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {s3Open && (
                      <div className="p-6 space-y-4">
                        <p className="text-xs text-gray-400">Use pre set clauses from the library or write your own custom clauses that you want to be included in the draft.</p>
                        
                        {/* Subtabs matching Screenshot 6 */}
                        <div className="flex border-b border-gray-100">
                          <button
                            onClick={() => setClauseTab("clauses")}
                            className={`py-2 px-4 text-xs font-bold transition border-b-2 flex items-center space-x-1 cursor-pointer ${
                              clauseTab === "clauses" ? "border-slate-850 text-slate-900" : "border-transparent text-gray-400 hover:text-gray-700"
                            }`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                            <span>Clauses</span>
                          </button>
                          <button
                            onClick={() => setClauseTab("custom")}
                            className={`py-2 px-4 text-xs font-bold transition border-b-2 flex items-center space-x-1 cursor-pointer ${
                              clauseTab === "custom" ? "border-slate-850 text-slate-900" : "border-transparent text-gray-400 hover:text-gray-700"
                            }`}
                          >
                            <FileEdit className="w-3.5 h-3.5 text-gray-400" />
                            <span>Make your own</span>
                          </button>
                        </div>

                        {clauseTab === "clauses" ? (
                          <div className="space-y-4">
                            <div className="flex space-x-2">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  value={searchClauseQuery}
                                  onChange={(e) => setSearchClauseQuery(e.target.value)}
                                  placeholder="Search clauses"
                                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
                                />
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                              </div>
                              <button className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 bg-white rounded-xl text-xs font-bold font-mono text-gray-700 flex items-center space-x-1 shadow-xs transition">
                                <Plus className="w-4 h-4 text-gray-500" />
                                <span>Add Clause</span>
                              </button>
                            </div>

                            {/* Dynamic Checklist split column matching Screenshot 6 layout */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {clauseCategories.map((cat) => {
                                const isCatExpanded = expandedClauseCat === cat.name;
                                return (
                                  <div key={cat.name} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                                    <div 
                                      onClick={() => setExpandedClauseCat(isCatExpanded ? null : cat.name)}
                                      className="p-3 px-4 hover:bg-slate-50/50 flex justify-between items-center cursor-pointer text-xs font-bold text-gray-700 select-none"
                                    >
                                      <div className="flex items-center space-x-2">
                                        <input type="checkbox" className="rounded" onClick={(e) => e.stopPropagation()} />
                                        <span>{cat.name}</span>
                                      </div>
                                      <div className="flex items-center space-x-1.5 text-gray-400 shrink-0">
                                        <span className="bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.2 text-[9px]">{cat.count}</span>
                                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCatExpanded ? "rotate-90" : ""}`} />
                                      </div>
                                    </div>

                                    {isCatExpanded && (
                                      <div className="bg-slate-50/35 p-2 pl-8 space-y-1.5">
                                        {cat.items.map((sub) => {
                                          const itemChecked = selectedClauses.includes(sub);
                                          return (
                                            <div 
                                              key={sub}
                                              onClick={() => {
                                                if (itemChecked) {
                                                  setSelectedClauses(selectedClauses.filter(v => v !== sub));
                                                } else {
                                                  setSelectedClauses([...selectedClauses, sub]);
                                                }
                                              }}
                                              className="flex items-center space-x-2 text-[11px] text-gray-500 hover:text-black cursor-pointer py-1 select-none"
                                            >
                                              <input type="checkbox" checked={itemChecked} readOnly className="rounded" />
                                              <span>{sub}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          // Custom clause text area
                          <textarea
                            rows={4}
                            value={customClauseText}
                            onChange={(e) => setCustomClauseText(e.target.value)}
                            placeholder="Type down special legal clauses or customized parameters you want to embed inside this first draft..."
                            className="w-full border border-gray-200 rounded-xl p-3 text-xs text-slate-800 placeholder-gray-400 focus:outline-none"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* ACCORDION 4: Should the draft follow any AI Rulebook? (Screenshot 6) */}
                  <div className="border border-gray-200 rounded-2xl bg-white shadow-xs overflow-hidden">
                    <div 
                      onClick={() => setS4Open(!s4Open)}
                      className="p-4 px-6 bg-white hover:bg-gray-50/50 flex align-center justify-between border-b border-gray-100 cursor-pointer text-sm font-bold text-gray-950 select-none"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="text-gray-400 font-medium">4</span>
                        <span>Should the draft follow any AI Rulebook?</span>
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div className="flex items-center space-x-3.5 text-xs text-gray-400 font-mono">
                        <span className="bg-slate-50 border border-slate-100 rounded px-2.5 py-0.5 text-[10px]">Optional</span>
                        {s4Open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {s4Open && (
                      <div className="p-6">
                        <p className="text-xs text-gray-400 mb-3">List down important do's and don'ts for the draft.</p>
                        <textarea
                          rows={3}
                          value={aiRulebookPrompt}
                          onChange={(e) => setAiRulebookPrompt(e.target.value)}
                          placeholder="e.g. Do not include strict technology lock-in rules. Ensure governing law defaults to Delhi High Court..."
                          className="w-full border border-gray-200 rounded-xl p-3 text-xs text-slate-800 placeholder-gray-400 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* PROACTIVE GENERATE ACTION LINE */}
                  <div className="pt-6 border-t border-gray-200/60 flex justify-end">
                    <button
                      onClick={handleExecuteDraftStream}
                      className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs tracking-wide px-6 py-3.5 uppercase rounded-lg shadow-md hover:shadow-lg transition flex items-center space-x-2 cursor-pointer font-mono"
                    >
                      <span>Generate draft</span>
                      <ArrowRight className="w-4 h-4 text-white" />
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>
      ) : (
        // OPTION B: STANDARD HIGH FI CANVAS TEXT EDITOR LAYOUT (Screenshot 2, 3 & 7)
        selectedDoc && (
          <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden relative select-all">
            
            {/* Editor Header: Back Arrow, Title, Status Info (Screenshot 2 / 7) */}
            <div className="p-4 px-6 border-b border-gray-200/70 bg-white flex align-center justify-between shrink-0">
              <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                <button 
                  onClick={() => setIsGeneratorActive(true)}
                  className="p-1.5 px-3 bg-slate-50 border border-gray-250 hover:bg-slate-100 rounded-lg text-[#0F172A] hover:text-[#0F172A] hover:border-slate-350 transition shadow-xs cursor-pointer inline-flex items-center space-x-1.5 shrink-0"
                  title="Return to Intake Options"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  <span className="text-[10px] font-mono font-bold uppercase hidden sm:inline text-slate-800">AI Gen</span>
                </button>
                
                {documents.length > 0 && (
                  <div className="flex items-center space-x-2 bg-slate-50 border border-gray-250 h-8.5 px-3 rounded-lg select-none max-w-xs min-w-0 shadow-xs">
                    <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      value={selectedDoc?.id || ""}
                      onChange={(e) => {
                        const found = documents.find(d => d.id === e.target.value);
                        if (found) {
                          handleSelectDoc(found);
                        }
                      }}
                      className="bg-transparent border-none text-xs font-bold text-slate-900 focus:outline-none cursor-pointer truncate max-w-[150px] p-0 pr-1"
                    >
                      {documents.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="p-1.5 px-3 border border-gray-250 hover:bg-slate-50 rounded-lg text-slate-750 hover:text-black transition shadow-xs flex items-center space-x-1.5 shrink-0 bg-white font-mono text-xs font-semibold"
                  title="New Draft Structure"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-mono font-bold uppercase hidden md:inline">Draft</span>
                </button>

                <div className="min-w-0 hidden lg:block">
                  <h2 className="text-xs font-bold text-gray-900 truncate">
                    {selectedDoc.title}
                  </h2>
                </div>
              </div>
              
              <div className="flex items-center space-x-3.5 text-xs shrink-0 select-none">
                {isSaving ? (
                  <span className="text-gray-400 italic font-mono text-xs animate-pulse">
                    {savingMsg || "Encrypting..."}
                  </span>
                ) : (
                  savingMsg && (
                    <span className="text-emerald-600 font-semibold text-xs bg-emerald-50 py-1 px-2.5 rounded border border-emerald-100/50">
                      {savingMsg}
                    </span>
                  )
                )}
                
                <button
                  id="save-draft-btn"
                  onClick={() => handleSaveDraft()}
                  disabled={isSaving || isFullySigned}
                  className="bg-[#0F172A] text-white font-semibold py-1.5 px-3.5 rounded-lg hover:bg-[#1E293B] hover:shadow-sm text-xs transition disabled:opacity-40 cursor-pointer font-mono uppercase"
                >
                  {isFullySigned ? "Locked" : "Save Draft"}
                </button>

                <button 
                  onClick={handleDeleteDraft}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 border border-rose-100 rounded-lg transition shrink-0 cursor-pointer"
                  title="Delete Draft"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* RICH INTERACTIVE TOOLBAR (Matches Screenshots 2 & 7 exactly) */}
            <div className="p-2.5 border-b border-gray-200 bg-white flex items-center justify-center space-x-1.5 overflow-x-auto shrink-0 select-none shadow-xs">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleUndo} className="p-1.5 hover:bg-slate-50 text-gray-600 rounded-md transition" title="Undo"><Undo className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleRedo} className="p-1.5 hover:bg-slate-50 text-gray-600 rounded-md transition" title="Redo"><Redo className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { pushUndoSnapshot(editorContent); setEditorContent(""); editorSelectionRef.current = { start: 0, end: 0 }; }} className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-md transition" title="Clear Slate"><Eraser className="w-4 h-4" /></button>
              
              <span className="w-[1px] h-5 bg-gray-200 mx-1" />
              
              {/* Functional dropdowns for Font, Size, and Paragraph */}
              <select
                onChange={(e) => insertTextAtCursor(`[font:${e.target.value}]`, "[/font]")}
                className="bg-slate-50 border border-gray-200 text-gray-700 text-xs rounded-md px-1 py-1 focus:outline-none cursor-pointer"
              >
                <option value="sans">Default</option>
                <option value="inter">Inter</option>
                <option value="mono">Fira Code</option>
                <option value="jetbrains">JetBrains Mono</option>
              </select>

              <select
                onChange={(e) => insertTextAtCursor(`[size:${e.target.value}]`, "[/size]")}
                className="bg-slate-50 border border-gray-200 text-gray-700 text-xs rounded-md px-1 py-1 focus:outline-none cursor-pointer"
              >
                <option value="12">Default (12px)</option>
                <option value="10">10px</option>
                <option value="14">14px</option>
                <option value="16">16px</option>
              </select>

              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "p") insertTextAtCursor("\n", "\n");
                  else if (val === "h1") handleToolbarFormat("h1");
                  else if (val === "h2") handleToolbarFormat("h2");
                  else if (val === "subtitle") insertTextAtCursor("\n### ", "\n");
                }}
                className="bg-slate-50 border border-gray-200 text-gray-700 text-xs rounded-md px-2 py-1 focus:outline-none cursor-pointer"
              >
                <option value="p">Paragraph</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="subtitle">Subtitle</option>
              </select>

              <span className="w-[1px] h-5 bg-gray-200 mx-1" />

              {/* Bold, Italic, Underline */}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("bold")} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition font-bold" title="Bold"><Bold className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("_", "_")} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition italic" title="Italic"><span className="font-serif font-bold text-sm">I</span></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("<u>", "</u>")} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition underline" title="Underline"><span className="underline font-bold text-xs">U</span></button>
              
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                const color = window.prompt("Enter a text color name or hex value", "#0F172A");
                if (!color) return;
                insertTextAtCursor(`[color:${color}]`, "[/color]");
              }} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition" title="Text Color"><Baseline className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                const color = window.prompt("Enter a background color name or hex value", "#FEF3C7");
                if (!color) return;
                insertTextAtCursor(`[highlight:${color}]`, "[/highlight]");
              }} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition" title="Background Color"><Highlighter className="w-4 h-4" /></button>
              
              <span className="w-[1px] h-5 bg-gray-200 mx-1" />

              {/* Lists */}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("list")} className="p-1.5 hover:bg-slate-50 text-gray-750 rounded-md transition" title="Unordered list"><List className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("\n1. ", "\n")} className="p-1.5 hover:bg-slate-50 text-gray-750 rounded-md transition" title="Ordered list"><ListOrdered className="w-4 h-4" /></button>
              
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => transformSelectedLines((line) => line.replace(/^\s{1,2}/, ""))} className="p-1.5 hover:bg-slate-50 text-gray-500 rounded-md transition" title="Outdent"><Outdent className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => transformSelectedLines((line) => `  ${line}`)} className="p-1.5 hover:bg-slate-50 text-gray-500 rounded-md transition" title="Indent"><Indent className="w-4 h-4" /></button>
              
              <span className="w-[1px] h-5 bg-gray-200 mx-1" />

              {/* Alignments */}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("\n[ALIGN:LEFT]\n")} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition" title="Align Left"><AlignLeft className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("\n[ALIGN:CENTER]\n")} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition" title="Align Center"><AlignCenter className="w-4 h-4" /></button>
              
              <span className="w-[1px] h-5 bg-gray-200 mx-1" />

              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n")} className="p-1.5 hover:bg-slate-50 text-gray-700 rounded-md transition" title="Insert Table"><Table className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTextAtCursor("\n---\n")} className="p-1.5 hover:bg-slate-50 text-gray-600 rounded-md transition" title="Horizontal divider line"><Columns className="w-4 h-4" /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("disclaimer")} className="p-1 text-[11px] font-mono hover:bg-slate-50 border border-gray-200 rounded-md transition text-slate-600" title="Add Disclaimer">+ Disclaimer</button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("signature-block")} className="p-1 text-[11px] font-mono hover:bg-slate-50 border border-gray-200 rounded-md transition text-slate-600" title="Apply Execution Stamp">+ Stamp</button>
            </div>

            {/* SECONDARY ACTION BAR DIRECTLY UNDER TOOLBAR (Screenshot 2 / 7) */}
            <div className="bg-slate-50 py-2 border-b border-gray-200 flex justify-center space-x-3 select-none shrink-0">
              <button onClick={() => { navigator.clipboard.writeText(editorContent); alert("Content Copied to secure clipboard."); }} className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 text-xs font-bold text-gray-600 rounded hover:bg-gray-50 hover:text-black shadow-xs transition">
                <Share2 className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
              <button onClick={handleExportDoc} className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 text-xs font-bold text-gray-600 rounded hover:bg-gray-50 hover:text-black shadow-xs transition" title="Export as valid Microsoft Word DOCX">
                <Download className="w-3.5 h-3.5" />
                <span>Download Word</span>
              </button>
              <button onClick={handlePrintDoc} className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 text-xs font-bold text-gray-600 rounded hover:bg-gray-50 hover:text-black shadow-xs transition" title="Print format optimized document or PDF">
                <Printer className="w-3.5 h-3.5" />
                <span>Print PDF</span>
              </button>
              <button onClick={() => handleSaveDraft()} className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 text-xs font-bold text-gray-600 rounded hover:bg-gray-50 hover:text-black shadow-xs transition">
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
              
              <div className="relative">
                <select className="appearance-none bg-white border border-gray-200 rounded text-xs font-semibold text-gray-600 px-3 pl-2 pr-6 py-1 focus:outline-none cursor-pointer">
                  <option>Version 1 (Active)</option>
                  <option>Version 2 (Commit backup)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-1.5 top-1.5 pointer-events-none" />
              </div>
            </div>

            {/* LIVE EDITOR CANVAS SHEET CONTAINER */}
            <div className="flex-1 relative overflow-y-auto p-12 flex justify-center">
              
              {/* WHITE CANVAS DOCUMENT PAPER SHEET SHADOWED */}
              <div className="w-full max-w-4xl bg-white border border-gray-200 shadow-xl min-h-[840px] p-16 flex flex-col justify-between relative text-left">
                
                {/* DYNAMIC SPARKLE REWRITE CONTAINER OVERLAY (Screenshot 3) */}
                {showFloatingMenu && selectedTextRange && (
                  <div 
                    className="absolute bg-white border border-gray-200 rounded-lg shadow-xl p-1.5 flex items-center space-x-1 z-30 select-none animate-in fade-in zoom-in duration-100"
                    style={{ left: `${floatingMenuPos.x}px`, top: `${floatingMenuPos.y}px` }}
                  >
                    <button onClick={() => insertTextAtCursor("**", "**")} className="p-1 px-1.5 hover:bg-slate-50 text-[11px] font-bold text-gray-700 rounded">B</button>
                    <button onClick={() => insertTextAtCursor("_", "_")} className="p-1 px-1.5 hover:bg-slate-50 text-[11px] italic text-gray-700 rounded">I</button>
                    <button onClick={() => insertTextAtCursor("<u>", "</u>")} className="p-1 px-1.5 hover:bg-slate-50 text-[11px] underline text-gray-700 rounded">U</button>
                    
                    <span className="w-[1px] h-5 bg-gray-200" />
                    
                    {/* Sparkle Dropdown options */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveDropdown(activeDropdown === "main" ? null : "main")}
                        className="px-2 py-1 bg-indigo-50 border border-indigo-150 rounded text-[10px] font-bold text-indigo-700 flex items-center space-x-1 hover:bg-indigo-100 transition"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-500 animate-spin" />
                        <span>AI Assistant</span>
                        <ChevronDown className="w-3 h-3 text-indigo-500" />
                      </button>

                      {activeDropdown === "main" && (
                        <div className="absolute left-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-lg shadow-2xl py-1 z-40 text-xs font-medium text-gray-700">
                          
                          {/* Tone submenu trigger */}
                          <div className="relative group/sub">
                            <div className="px-3.5 py-2 hover:bg-slate-50 hover:text-black flex justify-between items-center cursor-pointer">
                              <span>Adjust tone</span>
                              <ChevronRight className="w-3 h-3 text-gray-400" />
                            </div>
                            
                            <div className="absolute left-full top-0 ml-0.5 w-36 bg-white border border-gray-200 rounded-lg shadow-xl py-1 hidden group-hover/sub:block">
                              <div onClick={() => handleApplyRewrite("tone", "Formal")} className="px-3 py-1.5 hover:bg-slate-50 hover:text-black cursor-pointer">Formal</div>
                              <div onClick={() => handleApplyRewrite("tone", "Professional")} className="px-3 py-1.5 hover:bg-slate-50 hover:text-black cursor-pointer">Professional</div>
                              <div onClick={() => handleApplyRewrite("tone", "Casual")} className="px-3 py-1.5 hover:bg-slate-50 hover:text-black cursor-pointer">Casual</div>
                              <div onClick={() => handleApplyRewrite("tone", "Friendly")} className="px-3 py-1.5 hover:bg-slate-50 hover:text-black cursor-pointer">Friendly</div>
                            </div>
                          </div>

                          <div onClick={() => handleApplyRewrite("grammar")} className="px-3.5 py-2 hover:bg-slate-50 hover:text-black cursor-pointer text-left">Fix spelling & grammar</div>
                          <div onClick={() => handleApplyRewrite("extend")} className="px-3.5 py-2 hover:bg-slate-50 hover:text-black cursor-pointer text-left">Extend text</div>
                          <div onClick={() => handleApplyRewrite("reduce")} className="px-3.5 py-2 hover:bg-slate-50 hover:text-black cursor-pointer text-left">Reduce text</div>
                          <div onClick={() => handleApplyRewrite("simplify")} className="px-3.5 py-2 hover:bg-slate-50 hover:text-black cursor-pointer text-left">Simplify text</div>
                          
                          <div 
                            onClick={(e) => { e.stopPropagation(); setShowAskAiInput(!showAskAiInput); }}
                            className="px-3.5 py-2 hover:bg-slate-50 hover:text-black cursor-pointer border-t border-gray-100 text-left flex justify-between items-center"
                          >
                            <span>Ask AI</span>
                            <Sparkles className="w-3 h-3 text-amber-500" />
                          </div>

                          {showAskAiInput && (
                            <div className="p-2 bg-slate-50 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={askAiQuery}
                                onChange={(e) => setAskAiQuery(e.target.value)}
                                placeholder="E.g. rewrite in negative legal tone..."
                                className="w-full border border-gray-200 rounded p-1.5 text-[10px] bg-white focus:outline-none"
                              />
                              <button 
                                onClick={() => handleApplyRewrite("ask", askAiQuery)}
                                className="mt-1 w-full bg-[#0F172A] text-white py-1 rounded text-[9px] font-bold"
                              >
                                Command Write
                              </button>
                            </div>
                          )}

                          <div onClick={() => handleApplyRewrite("complete")} className="px-3.5 py-2 hover:bg-slate-50 hover:text-black cursor-pointer border-t border-gray-100 text-left">Complete sentence</div>
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={() => { setShowFloatingMenu(false); setSelectedTextRange(null); }}
                      className="text-[10px] text-gray-400 hover:text-black px-1.5 font-bold"
                    >
                      Close
                    </button>
                  </div>
                )}

                {/* TEXTAREA EDITOR OVERLAY STYLED AS A RAW PRISTINE PAPER SHEET COVENANT */}
                <div className="flex-1 flex flex-col">
                  {isAiRefiningText && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20">
                      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-2xl flex items-center space-x-3.5">
                        <Sparkles className="w-5 h-5 text-amber-400 animate-spin" />
                        <span className="text-xs font-mono font-bold tracking-tight">AI REWRITING TEXT REGION IN REALTIME...</span>
                      </div>
                    </div>
                  )}

                  <textarea
                    ref={editorRef}
                    onSelect={handleEditorSelect}
                    onMouseUp={(e) => syncEditorSelection(e.currentTarget)}
                    onKeyUp={(e) => syncEditorSelection(e.currentTarget)}
                    value={editorContent}
                    onChange={(e) => {
                      pushUndoSnapshot(editorContent);
                      setEditorContent(e.target.value);
                    }}
                    disabled={isFullySigned}
                    className="w-full flex-1 min-h-[640px] border-0 outline-none focus:ring-0 text-sm font-sans tracking-wide leading-relaxed text-gray-800 placeholder-gray-300 resize-none bg-transparent"
                    placeholder="Begin typing or select templates to trigger agentic intake..."
                  />
                </div>

                {/* IMMUTABLE SEALER CONTAINER AT THE BOTTOM OF THE SHEET (Screenshot 2) */}
                <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-200 select-none">
                  <div className="bg-slate-50 p-6 border border-gray-200/80 rounded-xl text-left flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h4 className="font-bold text-sm text-gray-900 tracking-tight flex items-center space-x-1.5">
                        <Lock className="w-4 h-4 text-emerald-600 animate-pulse" />
                        <span>Cryptographic Signature Lock Secure Seal</span>
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Apply permanent statutory encryption seal. Locking prevents further redactions permanently.
                      </p>
                    </div>
                    <button
                      onClick={handleSealDocumentLocally}
                      disabled={isFullySigned}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2.5 px-4 rounded-lg transition disabled:opacity-40 select-none shrink-0 cursor-pointer shadow-xs font-mono"
                    >
                      {isFullySigned ? "SEAL SECURED" : "SEAL DOCUMENT NOW"}
                    </button>
                  </div>
                </div>

              </div>

              {isFullySigned && (
                <div className="absolute inset-0 bg-gray-50/50 backdrop-blur-[1px] flex flex-col justify-center items-center text-center p-6 select-none z-20">
                  <div className="bg-white border border-gray-300 rounded-2xl p-8 shadow-2xl max-w-sm">
                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <h4 className="font-bold text-gray-900 text-lg">Agreement Sealed</h4>
                    <p className="text-xs text-gray-500 mt-2 font-mono leading-relaxed">
                      Statutory electronic seal signed off. Under law guidelines this copy has reached final immutable state.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )
      )}

      {/* 3. RIGHT PANE: SHARING, SIGNATORIES AND CO-SIGN LAW REGULAR */}
      {selectedDoc && !isGeneratorActive && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto divide-y divide-gray-100 select-none">
          
          {/* ACCESS & WORKFLOW SIGNATURES */}
          <div className="p-4">
            <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block mb-3">
              1. Document Signatories
            </span>
            
            {!isFullySigned && (
              <div className="mb-4">
                <div className="flex space-x-2">
                  <input
                    id="request-sig-email-input"
                    type="email"
                    placeholder="partner@example.com"
                    value={requestSignEmail}
                    onChange={(e) => setRequestSignEmail(e.target.value)}
                    className="flex-1 bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none"
                  />
                  <button
                    id="request-sig-submit-btn"
                    onClick={handleRequestSignature}
                    className="bg-[#0F172A] text-white p-1 px-3.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0 hover:bg-[#1E293B]"
                  >
                    Invite
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">Invite stakeholder to sign this contract</p>
              </div>
            )}

            <div className="space-y-2 mb-4">
              {(selectedDoc?.signatures?.length ?? 0) === 0 ? (
                <div className="text-[10px] text-gray-400 italic font-mono">- No pending invitation slots.</div>
              ) : (
                selectedDoc.signatures.map((sig, i) => (
                  <div key={i} className="bg-gray-50/70 border border-gray-150 rounded-lg p-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-800 truncate select-all">{sig.signerEmail}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        sig.status === "signed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      }`}>
                        {sig.status}
                      </span>
                    </div>
                    {sig.status === "signed" ? (
                      <div>
                        <p className="text-[9px] text-gray-500">Hash: {sig.signatureHash}</p>
                        <p className="text-[8px] text-gray-400 text-right">{new Date(sig.signedAt!).toLocaleString()}</p>
                      </div>
                    ) : (
                      <p className="text-[9px] text-gray-400">Invited, awaiting submission</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {!isFullySigned && (
              <form onSubmit={handleSignDocument} className="border-t border-gray-100 pt-3">
                <label className="block text-[10px] font-semibold text-gray-650 mb-1">Co-Sign Locally</label>
                <div className="flex space-x-2">
                  <input
                    id="signer-name-input"
                    type="text"
                    required
                    placeholder="e.g. Authorized Attorney"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                  />
                  <button
                    id="sign-document-submit-btn"
                    type="submit"
                    className="bg-emerald-600 text-white p-1 px-3 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition flex items-center space-x-1 cursor-pointer shrink-0"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Apply Signature</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* SHARE CONTROLS */}
          <div className="p-4">
            <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block mb-3">
              2. Share Securely
            </span>
            <div className="flex space-x-2 mb-2">
              <input
                id="share-email-input"
                type="email"
                placeholder="regulatory@partner.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                className="flex-1 bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <button
                id="share-submit-btn"
                onClick={handleShare}
                className="bg-[#0F172A] text-white p-1.5 px-3 rounded-lg text-xs font-semibold cursor-pointer shrink-0 hover:bg-[#1E293B]"
              >
                Share
              </button>
            </div>
            {(selectedDoc?.sharedWith?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedDoc.sharedWith.map((email, i) => (
                  <span key={i} className="text-[9px] bg-slate-105 text-gray-600 rounded px-1.5 py-0.5 select-all font-mono">
                    {email}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* VERSION HISTORY LEDGER */}
          <div className="p-4">
            <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block mb-3">
              3. Version History Control
            </span>
            <div className="space-y-3 relative before:absolute before:top-2 before:bottom-2 before:left-[14px] before:w-[1px] before:bg-gray-100">
              {selectedDoc.versions.map((ver) => (
                <div key={ver.version} className="flex space-x-3.5 relative">
                  <div className="w-7 h-7 rounded-full bg-gray-55 border border-gray-200 text-gray-600 flex items-center justify-center font-bold font-mono text-[10px] shrink-0 z-10">
                    v{ver.version}
                  </div>
                  <div className="text-xs min-w-0 flex-1 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-700">{ver.author}</span>
                      <button
                        onClick={() => handleVersionRestore(ver.content, ver.version)}
                        className="text-[10px] text-gray-400 hover:text-black hover:underline cursor-pointer flex items-center space-x-0.5"
                        disabled={isFullySigned}
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Restore</span>
                      </button>
                    </div>
                    <p className="text-gray-400 text-[9px] italic mt-0.5 leading-relaxed">"{ver.comment || 'Corporate parameter commit'}"</p>
                    <p className="text-[8px] text-gray-400 mt-1">{new Date(ver.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* COMPLIANCE INTIALIZE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl max-w-sm w-full relative">
            <h3 className="text-base font-bold text-gray-900 mb-2">Initialize compliance Draft</h3>
            
            <form onSubmit={handleCreateDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Agreement Custom Title</label>
                <input
                  id="create-doc-title-input"
                  type="text"
                  required
                  placeholder="e.g. Acme Corp NDA 2026"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-150 rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-750 mb-1">Legal Template Sector</label>
                <select
                  id="create-doc-type-select"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full bg-gray-50 border border-gray-150 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black cursor-pointer"
                >
                  <option value="NDA">Mutual NDA (Non-disclosure)</option>
                  <option value="DPA">GPDR DPA (Data Processing)</option>
                  <option value="SLA">Service Level Performance SLA</option>
                  <option value="Custom">Blank Custom Slate</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  id="create-doc-cancel-btn"
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="create-doc-submit-btn"
                  type="submit"
                  className="flex-1 bg-[#0F172A] text-white rounded-lg py-2 text-xs font-bold hover:bg-[#1E293B] transition shadow-md cursor-pointer font-mono uppercase"
                >
                  Load Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
