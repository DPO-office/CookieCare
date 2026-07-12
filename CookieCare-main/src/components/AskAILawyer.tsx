import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiUrl } from "../config";
import { markdownToHtml } from "../utils/markdownToHtml";
import {
  Scale, Folder, FileText, Globe, Plus, Trash2, Copy, Check,
  BookmarkCheck, ExternalLink, X, BookOpen, RefreshCw, ArrowUp,
  FileCode, Gavel, ScrollText, Brain, AlertCircle, Upload,
  PanelRight, PanelRightClose, ChevronDown,
} from "lucide-react";
import { LegalDocument } from "../types";
import AiProgressOverlay from "./AiProgressOverlay";

/* ── Types ─────────────────────────────────────────────────────── */
interface FileContext { name: string; type: string; size: string; content: string; }
interface KBFolder { id: string; name: string; isSelected: boolean; files: FileContext[]; }
interface Source { id: string; title: string; citation: string; jurisdiction: string; documentType: string; officialCopy: string; }
interface AskAILawyerProps { authToken: string; documents?: LegalDocument[]; }
type PopoverType = "add" | "kb" | "web" | "jurisdictions" | "format" | null;

/* ── Quick-start suggestion cards ──────────────────────────────── */
const QUICK_PROMPTS = [
  { label: "GDPR Breach Liability", icon: AlertCircle,
    prompt: "Assess our liability exposure under GDPR Article 83 for a data breach affecting EU citizens stored on US servers." },
  { label: "Contract Indemnity Clause", icon: ScrollText,
    prompt: "Review standard indemnification clause enforceability and asymmetric risk allocation under English law." },
  { label: "Cross-Border Tax Relief", icon: Globe,
    prompt: "Assess double tax relief eligibility under applicable bilateral tax treaties for a UK-India corporate structure." },
  { label: "IP Ownership in Employment", icon: Brain,
    prompt: "Explain the default IP assignment rules for inventions created by employees during working hours across US, UK, and EU." },
];

export default function AskAILawyer({ authToken, documents: propDocs = [] }: AskAILawyerProps) {

  /* ── Core state (all business logic preserved) ─────────────────────── */
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"Brief Summary" | "Full IRAC" | "CREAC">("Full IRAC");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>([]);
  const [webDiscoveryUrlInput, setWebDiscoveryUrlInput] = useState("");
  const [webDiscoveryUrls, setWebDiscoveryUrls] = useState<string[]>([]);
  const [availableJurisdictions, setAvailableJurisdictions] = useState<any[]>([]);
  const [folders, setFolders] = useState<KBFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolderForUpload, setActiveFolderForUpload] = useState<string>("");
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [stepperPhase, setStepperPhase] = useState<"idle"|"division"|"sourcing"|"extracting"|"streaming"|"completed">("idle");
  const [stepperMessage, setStepperMessage] = useState("");
  const [streamedResult, setStreamedResult] = useState("");
  const [matchedSources, setMatchedSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCitationModal, setActiveCitationModal] = useState<Source | null>(null);
  const [lawyerProgress, setLawyerProgress] = useState("");
  const [lawyerError, setLawyerError] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  /* ── UI state ────────────────────────────────────────────────────────── */
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [showSources, setShowSources] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  /* ── Close popover on outside click ─────────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        composerRef.current && !composerRef.current.contains(e.target as Node)
      ) setOpenPopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (chatBottomRef.current) chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [streamedResult, isStreaming]);

  /* ── Data fetching ───────────────────────────────────────────────────── */
  const fetchSettings = async () => {
    try {
      const [jRes, wRes] = await Promise.all([
        fetch(apiUrl("/api/settings/jurisdictions"), { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/settings/web_discovery_sources"), { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);
      if (jRes.ok && wRes.ok) {
        const jData = await jRes.json(); const wData = await wRes.json();
        setAvailableJurisdictions(jData); setWebDiscoveryUrls(wData);
        if (jData.length >= 2) setSelectedJurisdictions([jData[0].label, jData[4]?.label].filter(Boolean));
      }
    } catch {}
  };

  const fetchKnowledgeBase = async () => {
    try {
      const [fRes, dRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/documents"), { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);
      if (fRes.ok && dRes.ok) {
        const fData = await fRes.json(); const dData = await dRes.json();
        setFolders(fData.map((f: any) => ({
          id: f.id, name: f.name, isSelected: true,
          files: dData.filter((d: any) => d.folder_id === f.id).map((d: any) => ({
            name: d.title || d.name, type: d.type || "DOC", size: "N/A", content: d.content,
          })),
        })));
      }
    } catch {}
  };

  useEffect(() => { fetchKnowledgeBase(); fetchSettings(); }, [authToken]);

  /* ── Textarea auto-resize ────────────────────────────────────────────── */
  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + "px";
    }
  }, []);

  /* ── Toggle helpers ──────────────────────────────────────────────────── */
  const toggleJurisdiction = (label: string) =>
    setSelectedJurisdictions(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFolders(prev => [...prev, { id: "folder_" + Date.now(), name: newFolderName.trim(), isSelected: true, files: [] }]);
    setNewFolderName("");
  };

  const toggleFolderSelection = (id: string) =>
    setFolders(prev => prev.map(f => f.id === id ? { ...f, isSelected: !f.isSelected } : f));

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  /* ── File upload (full logic preserved) ─────────────────────────────── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);
    if (activeFolderForUpload && !activeFolderForUpload.startsWith("folder_"))
      formData.append("folder_id", activeFolderForUpload);
    try {
      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST", headers: { Authorization: `Bearer ${authToken}` }, body: formData,
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Upload failed");
      if (res.status === 202 && payload.job_id) {
        setStepperPhase("extracting"); setStepperMessage(`Processing ${file.name}…`);
        const es = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        es.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "job_update" && data.job.id === payload.job_id) {
            if (data.job.status === "completed") { es.close(); fetchKnowledgeBase(); setStepperPhase("completed"); setStepperMessage(`${file.name} indexed.`); }
            else if (data.job.status === "failed") { es.close(); setStepperPhase("idle"); alert("Indexing failed: " + data.job.error); }
          }
        };
      } else { fetchKnowledgeBase(); }
    } catch (err: any) { alert("Upload failed: " + err.message); }
  };

  /* ── Web URL ────────────────────────────────────────────────────────── */
  const handleAddWebUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webDiscoveryUrlInput.trim()) return;
    if (!webDiscoveryUrls.includes(webDiscoveryUrlInput.trim()))
      setWebDiscoveryUrls(prev => [...prev, webDiscoveryUrlInput.trim()]);
    setWebDiscoveryUrlInput("");
  };
  const removeWebUrl = (url: string) => setWebDiscoveryUrls(prev => prev.filter(u => u !== url));

  /* ── Query dispatch (full logic preserved) ──────────────────────────── */
  const handleQueryDispatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isStreaming) return;
    const query = searchQuery.trim();
    setSubmittedQuery(query);
    setIsStreaming(true); setStreamedResult(""); setMatchedSources([]);
    setLawyerProgress("Preparing request…"); setLawyerError("");
    setStepperPhase("division"); setHasResult(false);
    setOpenPopover(null);
    const activeFiles = folders.filter(f => f.isSelected).flatMap(f =>
      f.files.map(fi => ({ name: fi.name, content: fi.content }))
    );
    try {
      const response = await fetch(apiUrl("/api/lawyer/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ prompt: query, jurisdiction: selectedJurisdictions, outputFormat: selectedFormat, webContext: webDiscoveryUrls, documents: activeFiles }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Advisory failed.");
      if (response.status === 202 && data.job_id) {
        setLawyerProgress("Analyzing…");
        const es = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        es.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            const job = payload.job;
            if (job.message) { setLawyerProgress(job.message); setStepperMessage(job.message); }
            if (job.status === "completed") {
              setStreamedResult(job.result.text); setStepperPhase("completed");
              setLawyerProgress(""); setIsStreaming(false); setHasResult(true); es.close();
            } else if (job.status === "failed") {
              es.close(); setLawyerError(job.error || "Advisory failed."); setIsStreaming(false);
            }
          }
        };
        es.onerror = () => { es.close(); setLawyerError("Connection interrupted. Please retry."); setIsStreaming(false); };
      }
    } catch (err: any) {
      setStepperPhase("idle"); setLawyerError(err.message || "Unexpected error."); setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQueryDispatch(); }
  };

  const handleCopyMarkdown = () => {
    if (!streamedResult) return;
    navigator.clipboard.writeText(streamedResult);
    setIsCopied(true); setTimeout(() => setIsCopied(false), 2000);
  };

  const applyQuickPrompt = (prompt: string) => {
    setSearchQuery(prompt);
    setTimeout(() => { autoResizeTextarea(); textareaRef.current?.focus(); }, 0);
  };

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const selectedKBCount = folders.filter(f => f.isSelected).reduce((acc, f) => acc + f.files.length, 0);
  const selectedFolderCount = folders.filter(f => f.isSelected).length;

  /* ── Popover toggle helper ───────────────────────────────────────────── */
  const togglePopover = (p: PopoverType) =>
    setOpenPopover(prev => prev === p ? null : p);

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex-1 flex flex-col overflow-hidden h-screen bg-[#F7F8FA]">

      {/* ── AI progress overlay ── */}
      {(isStreaming || !!lawyerError) && (
        <AiProgressOverlay
          visible={isStreaming || !!lawyerError}
          message={lawyerProgress}
          error={lawyerError}
          label="Consulting AI Lawyer…"
          onRetry={lawyerError ? () => setLawyerError("") : undefined}
          onDismiss={lawyerError ? () => setLawyerError("") : undefined}
        />
      )}

      {/* ── Header ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-7 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-[22px] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: "'Outfit','Inter',system-ui,sans-serif" }}
            >
              Ask AI Lawyer
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Legal research and advisory across global jurisdictions.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Sources toggle — only shown when a result exists */}
            {hasResult && (
              <button
                type="button"
                onClick={() => setShowSources(s => !s)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm cursor-pointer"
              >
                {showSources ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
                <span>{showSources ? "Hide" : "Show"} Sources</span>
                {matchedSources.length > 0 && (
                  <span className="bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                    {matchedSources.length}
                  </span>
                )}
              </button>
            )}
           
          </div>
        </div>
      </div>

      {/* ── Main area: conversation + optional sources panel ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Conversation column ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Scrollable messages */}
          <div className="flex-1 overflow-y-auto">
            {!hasResult && !isStreaming ? (

              /* ── Empty / welcome state ── */
              <div className="flex flex-col items-center justify-center h-full px-6 py-16">
                <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center mb-5 shadow-md">
                  <Scale className="w-6 h-6 text-white" />
                </div>
                <h2
                  className="text-2xl font-bold text-gray-900 tracking-tight mb-2 text-center"
                  style={{ fontFamily: "'Outfit','Inter',system-ui,sans-serif" }}
                >
                  How can I assist you legally?
                </h2>
                <p className="text-sm text-gray-500 text-center mb-10 leading-relaxed max-w-sm">
                  Ask about statutes, case law, contract terms, or compliance obligations.
                  Use the <strong className="text-gray-700 font-semibold">+</strong> button to attach context.
                </p>
                {/* Quick-start cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      onClick={() => applyQuickPrompt(qp.prompt)}
                      className="group flex items-start gap-3 p-3.5 bg-white border border-gray-200 rounded-2xl hover:border-gray-300 hover:shadow-sm transition-all text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-900 group-hover:border-gray-900 transition-all">
                        <qp.icon className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 mb-0.5">{qp.label}</p>
                        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{qp.prompt}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            ) : (

              /* ── Chat thread ── */
              <div className="max-w-3xl mx-auto w-full px-4 pt-8 pb-4">

                {/* User message bubble */}
                {submittedQuery && (
                  <div className="flex justify-end mb-6">
                    <div className="max-w-[72%] bg-gray-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                      {submittedQuery}
                    </div>
                  </div>
                )}

                {/* AI response bubble */}
                <div className="flex gap-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Scale className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Response meta row */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">AI Lawyer</span>
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {selectedFormat}
                        </span>
                        {selectedJurisdictions.length > 0 && (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                            {selectedJurisdictions.slice(0, 2).join(" · ")}
                            {selectedJurisdictions.length > 2 ? ` +${selectedJurisdictions.length - 2}` : ""}
                          </span>
                        )}
                      </div>
                      {streamedResult && (
                        <button
                          type="button"
                          onClick={handleCopyMarkdown}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-900 border border-gray-200 bg-white px-2.5 py-1 rounded-xl hover:bg-gray-50 transition cursor-pointer"
                        >
                          {isCopied
                            ? <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600">Copied</span></>
                            : <><Copy className="w-3 h-3" /><span>Copy</span></>}
                        </button>
                      )}
                    </div>

                    {/* Thinking animation */}
                    {isStreaming && !streamedResult ? (
                      <div className="flex items-center gap-2.5 py-4">
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400">{lawyerProgress || "Analyzing…"}</span>
                      </div>
                    ) : (
                      <div
                        className="prose prose-sm max-w-none text-gray-800 leading-relaxed bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-xs select-all"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(streamedResult) }}
                      />
                    )}
                  </div>
                </div>

                <div ref={chatBottomRef} />
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════
              PROMPT COMPOSER — pinned to bottom
          ════════════════════════════════════════════════════════ */}
          <div className="shrink-0 bg-[#F7F8FA] px-4 pb-5 pt-3">
            <div className="max-w-3xl mx-auto w-full relative" ref={composerRef}>

              {/* ── Active context chips (above the box) ── */}
              {(selectedJurisdictions.length > 0 || selectedKBCount > 0 || webDiscoveryUrls.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                  {selectedJurisdictions.slice(0, 3).map(j => (
                    <span key={j}
                      className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                      <Gavel className="w-2.5 h-2.5 text-gray-400" />
                      {j}
                      <button type="button" onClick={() => toggleJurisdiction(j)} className="hover:text-red-500 transition ml-0.5">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  {selectedJurisdictions.length > 3 && (
                    <span className="text-[11px] font-medium bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full shadow-xs">
                      +{selectedJurisdictions.length - 3} jurisdictions
                    </span>
                  )}
                  {selectedKBCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                      <Folder className="w-2.5 h-2.5 text-gray-400" />
                      {selectedKBCount} doc{selectedKBCount > 1 ? "s" : ""} from {selectedFolderCount} folder{selectedFolderCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {webDiscoveryUrls.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                      <Globe className="w-2.5 h-2.5 text-gray-400" />
                      {webDiscoveryUrls.length} web source{webDiscoveryUrls.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                    <FileCode className="w-2.5 h-2.5 text-gray-400" />
                    {selectedFormat}
                  </span>
                </div>
              )}

              {/* ── Composer box ── */}
              <div className="relative bg-white border border-gray-200 rounded-2xl shadow-md hover:shadow-lg focus-within:shadow-lg focus-within:border-gray-300 transition-all overflow-visible">

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  id="legal-prompt-input"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); autoResizeTextarea(); }}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  placeholder="Ask a legal question — GDPR compliance, contract review, tax treaties…"
                  rows={1}
                  className="w-full bg-transparent text-sm py-3.5 pl-4 pr-4 focus:outline-none placeholder:text-gray-400 text-gray-900 resize-none leading-relaxed"
                  style={{ minHeight: "52px", maxHeight: "180px" }}
                />

                {/* ── Toolbar row ── */}
                <div className="flex items-center justify-between px-3 pb-3 pt-1 gap-2">

                  {/* LEFT: + button + action chips */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">

                    {/* ── + Add menu button ── */}
                    <button
                      type="button"
                      onClick={() => togglePopover("add")}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all cursor-pointer shrink-0 ${
                        openPopover === "add"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                      }`}
                      title="Add context"
                    >
                      <Plus className={`w-3.5 h-3.5 transition-transform duration-200 ${openPopover === "add" ? "rotate-45" : ""}`} />
                    </button>

                    {/* Inline chips for active config items */}
                    <button type="button" onClick={() => togglePopover("jurisdictions")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                        openPopover === "jurisdictions"
                          ? "bg-gray-900 text-white border-gray-900"
                          : selectedJurisdictions.length > 0
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                      }`}>
                      <Gavel className="w-3 h-3" />
                      <span>{selectedJurisdictions.length > 0 ? `${selectedJurisdictions.length} Jurisdiction${selectedJurisdictions.length > 1 ? "s" : ""}` : "Jurisdictions"}</span>
                      <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                    </button>

                    <button type="button" onClick={() => togglePopover("format")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                        openPopover === "format"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                      }`}>
                      <FileCode className="w-3 h-3" />
                      <span>{selectedFormat}</span>
                      <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                    </button>

                    {selectedKBCount > 0 && (
                      <button type="button" onClick={() => togglePopover("kb")}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                          openPopover === "kb"
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}>
                        <Folder className="w-3 h-3" />
                        <span>{selectedKBCount} Doc{selectedKBCount > 1 ? "s" : ""}</span>
                      </button>
                    )}
                  </div>

                  {/* RIGHT: Send button */}
                  <button
                    id="legal-prompt-submit"
                    type="button"
                    onClick={() => handleQueryDispatch()}
                    disabled={!searchQuery.trim() || isStreaming}
                    className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm shrink-0"
                  >
                    {isStreaming
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <ArrowUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <p className="text-center text-[10px] text-gray-400 mt-2">
                <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send
                &nbsp;·&nbsp;
                <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
              </p>

              {/* ════════════════════════════════════════════════
                  FLOATING POPOVERS
              ════════════════════════════════════════════════ */}
              <AnimatePresence>
                {openPopover && (
                  <motion.div
                    key={openPopover}
                    ref={popoverRef}
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute bottom-full mb-3 left-0 z-50 w-full max-w-sm"
                  >

                    {/* ── ADD menu ── */}
                    {openPopover === "add" && (
                      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-700">Add context to your query</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Attach documents, URLs, or set preferences</p>
                        </div>
                        <div className="p-2">
                          {[
                            { icon: Upload, label: "Upload Document", desc: "PDF, DOCX, TXT, CSV, images", action: () => { setActiveFolderForUpload(""); setOpenPopover(null); fileUploadRef.current?.click(); } },
                            { icon: Folder, label: "Knowledge Base", desc: `${selectedKBCount > 0 ? `${selectedKBCount} docs active` : "Select document folders"}`, action: () => setOpenPopover("kb") },
                            { icon: Globe, label: "Web Discovery", desc: `${webDiscoveryUrls.length > 0 ? `${webDiscoveryUrls.length} URL${webDiscoveryUrls.length > 1 ? "s" : ""} added` : "Add web sources"}`, action: () => setOpenPopover("web") },
                            { icon: Gavel, label: "Jurisdictions", desc: `${selectedJurisdictions.length > 0 ? selectedJurisdictions.slice(0,2).join(", ") : "None selected"}`, action: () => setOpenPopover("jurisdictions") },
                            { icon: FileCode, label: "Output Format", desc: selectedFormat, action: () => setOpenPopover("format") },
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

                    {/* ── JURISDICTIONS popover ── */}
                    {openPopover === "jurisdictions" && (
                      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <div>
                            <p className="text-xs font-semibold text-gray-800">Select Jurisdictions</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{selectedJurisdictions.length} selected</p>
                          </div>
                          <button type="button" onClick={() => setOpenPopover(null)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                            <X className="w-3.5 h-3.5" />
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

                    {/* ── KNOWLEDGE BASE popover ── */}
                    {openPopover === "kb" && (
                      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <div>
                            <p className="text-xs font-semibold text-gray-800">Knowledge Base</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{selectedKBCount} docs active across {selectedFolderCount} folders</p>
                          </div>
                          <button type="button" onClick={() => setOpenPopover(null)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="p-3 space-y-2">
                          {/* New folder form */}
                          <form onSubmit={handleAddFolder} className="flex gap-1.5">
                            <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                              placeholder="Create new folder…"
                              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition placeholder:text-gray-400" />
                            <button type="submit"
                              className="w-7 h-7 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition shrink-0 cursor-pointer">
                              <Plus className="w-3 h-3" />
                            </button>
                          </form>
                          {/* Folder list */}
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
                                    <button type="button" onClick={(e) => { setActiveFolderForUpload(f.id); e.stopPropagation(); fileUploadRef.current?.click(); }}
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

                    {/* ── WEB DISCOVERY popover ── */}
                    {openPopover === "web" && (
                      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <div>
                            <p className="text-xs font-semibold text-gray-800">Web Discovery</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">External sources to reference during research</p>
                          </div>
                          <button type="button" onClick={() => setOpenPopover(null)}
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

                    {/* ── OUTPUT FORMAT popover ── */}
                    {openPopover === "format" && (
                      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-800">Output Format</p>
                          <button type="button" onClick={() => setOpenPopover(null)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="p-3 space-y-1.5">
                          {([
                            { fmt: "Brief Summary" as const, desc: "Concise overview with key findings and practical recommendations." },
                            { fmt: "Full IRAC" as const, desc: "Issue · Rule · Application · Conclusion — standard legal analysis." },
                            { fmt: "CREAC" as const, desc: "Conclusion · Rule · Explanation · Application · Conclusion." },
                          ]).map(({ fmt, desc }) => (
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

                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>{/* end composer area */}

        </div>{/* end conversation column */}

        {/* ══ RIGHT: Sources panel (collapsible, shown only after a result) ══ */}
        <AnimatePresence>
          {hasResult && showSources && (
            <motion.aside
              key="sources-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 264, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="shrink-0 bg-white border-l border-gray-200 overflow-hidden flex flex-col"
              style={{ minWidth: 0 }}
            >
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <BookmarkCheck className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-800">Sources</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                      {matchedSources.length}
                    </span>
                    <button type="button" onClick={() => setShowSources(false)}
                      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {matchedSources.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-3">
                    <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
                      <BookOpen className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">Verified citations will appear here after a query completes.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {matchedSources.map((source) => (
                      <button key={source.id} type="button" onClick={() => setActiveCitationModal(source)}
                        className="w-full text-left border border-gray-200 rounded-xl p-3 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                            {source.documentType}
                          </span>
                          <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition" />
                        </div>
                        <h4 className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2 mb-1">{source.title}</h4>
                        <p className="text-[10px] text-gray-400">{source.jurisdiction}</p>
                        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1">
                          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Ref:</span>
                          <span className="text-[10px] text-gray-500 truncate font-mono">{source.citation}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

      </div>{/* end main area */}

      {/* ── Hidden file input ── */}
      <input type="file" ref={fileUploadRef} className="hidden"
        accept=".pdf,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg" onChange={handleFileUpload} />

      {/* ══════════════════════════════════════════════════════════
          CITATION MODAL
      ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {activeCitationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setActiveCitationModal(null)}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase tracking-wide">
                      {activeCitationModal.documentType}
                    </span>
                    <span className="text-[10px] text-gray-400">{activeCitationModal.jurisdiction}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{activeCitationModal.title}</h3>
                </div>
                <button type="button" onClick={() => setActiveCitationModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition cursor-pointer ml-4 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-6 py-2.5 border-b border-gray-100 bg-gray-50">
                <span className="text-[11px] text-gray-500">
                  <strong className="text-gray-700">Citation: </strong>{activeCitationModal.citation}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap select-all font-mono">
                  {activeCitationModal.officialCopy}
                </pre>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-white">
                <button type="button"
                  onClick={() => { navigator.clipboard.writeText(activeCitationModal.officialCopy); alert("Copied to clipboard."); }}
                  className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-gray-800 transition cursor-pointer">
                  <Copy className="w-3.5 h-3.5" /><span>Copy transcript</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
