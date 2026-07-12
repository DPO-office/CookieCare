import React, { useState, useEffect, useRef, useMemo } from "react";
import { apiUrl } from "../config";
import {
  Scale,
  HeartHandshake,
  Check,
  X,
  FileText,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
  Edit3,
} from "lucide-react";
import { LegalDocument, RedlineProposal } from "../types";
import AiProgressOverlay from "./AiProgressOverlay";
import { markdownToHtml } from "../utils/markdownToHtml";

interface NegotiateHubProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument) => void;
}

interface AgentMarkup {
  clauseId: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
}

export default function NegotiateHub({
  documents,
  activeDocument,
  authToken,
  onRefresh,
  onSelectDocument,
}: NegotiateHubProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(
    activeDocument?.id || documents[0]?.id || ""
  );
  const [activeDoc, setActiveDoc] = useState<LegalDocument | null>(null);

  const [agentMarkups, setAgentMarkups] = useState<AgentMarkup[]>([]);
  const [selectedMarkup, setSelectedMarkup] = useState<AgentMarkup | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [errorText, setErrorText] = useState("");

  const [acceptingMarkupId, setAcceptingMarkupId] = useState<string | null>(null);
  const [evaluatingDocId, setEvaluatingDocId] = useState<string | null>(null);
  const evalRequestIdRef = useRef(0);

  // Edit mode for replacement text
  const [editingReplacement, setEditingReplacement] = useState(false);

  // Pending redlines accordion
  const [redlinesOpen, setRedlinesOpen] = useState(false);

  // Compromise drafting state (kept for API compatibility)
  const [draftingCompromise, setDraftingCompromise] = useState(false);

  // Manual proposal state (kept for API compatibility, no longer surfaced in UI)
  const [customOriginal, setCustomOriginal] = useState("");
  const [customProposed, setCustomProposed] = useState("");
  const [customComment, setCustomComment] = useState("");
  const [proposing, setProposing] = useState(false);

  const loadActiveDocumentDetails = async (docId: string) => {
    if (!docId) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${docId}`), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const fullDoc = await res.json();
        setActiveDoc(fullDoc);
        runMultiAgentEvaluation(docId, fullDoc.content, {
          title: fullDoc.title,
          type: fullDoc.type,
        });
      }
    } catch (err) {
      console.error("Error fetching document details:", err);
    }
  };

  const loadedDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    const docId = activeDocument?.id || documents[0]?.id || "";
    if (!docId) return;
    if (docId === loadedDocIdRef.current) return;
    loadedDocIdRef.current = docId;
    setSelectedDocId(docId);
    loadActiveDocumentDetails(docId);
  }, [activeDocument, documents]);

  const handleDocumentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const docId = e.target.value;
    setSelectedDocId(docId);
    const matched = documents.find((d) => d.id === docId);
    if (!matched) return;
    onSelectDocument(matched);
  };

  const runMultiAgentEvaluation = async (
    docId: string,
    docContent: string,
    metadata: { title: string; type: string }
  ) => {
    if (!docContent) return;
    if (evaluatingDocId === docId) return;
    const requestId = ++evalRequestIdRef.current;
    setEvaluatingDocId(docId);
    setEvaluating(true);
    setErrorText("");
    setEvaluationError("");
    try {
      const res = await fetch(apiUrl("/api/negotiate/evaluate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          content: docContent,
          documentTitle: metadata.title,
          documentType: metadata.type,
        }),
      });
      const parsed = await res.json();
      if (requestId !== evalRequestIdRef.current) return;
      if (!res.ok) throw new Error(parsed.error || "Evaluation failed.");
      const markups = parsed.data?.markups || [];
      setAgentMarkups(markups);
      setSelectedMarkup(markups.length > 0 ? markups[0] : null);
    } catch (err: any) {
      if (requestId === evalRequestIdRef.current) {
        setErrorText(err.message || "Failed to trigger multi-agent pipeline.");
        setEvaluationError(err.message || "Failed to trigger multi-agent pipeline.");
      }
    } finally {
      if (requestId === evalRequestIdRef.current) {
        setEvaluating(false);
        setEvaluatingDocId(null);
      }
    }
  };

  const handleAcceptAgentMarkup = async (markup: AgentMarkup) => {
    if (!activeDoc) return;
    if (acceptingMarkupId === markup.clauseId) return;
    setAcceptingMarkupId(markup.clauseId);
    try {
      const pRes = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          originalText: markup.original,
          proposedText: markup.replacement,
          comment: `[Merged via AI Multi-Agent Audit]: ${markup.reasoning}`,
        }),
      });
      const proposal = await pRes.json();
      if (!pRes.ok) throw new Error(proposal.error || "Failed to submit redline");
      const acceptRes = await fetch(
        apiUrl(`/api/documents/${activeDoc.id}/redline/${proposal.id}/accept`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        }
      );
      if (!acceptRes.ok) {
        const errData = await acceptRes.json();
        throw new Error(errData.error || "Failed to merge changes into contract.");
      }
      setAgentMarkups((prev) => prev.filter((m) => m.clauseId !== markup.clauseId));
      setSelectedMarkup((prev) => (prev?.clauseId === markup.clauseId ? null : prev));
      setEditingReplacement(false);
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message || "Failed to accept markup patch.");
    } finally {
      setAcceptingMarkupId(null);
    }
  };

  const handleDismissMarkup = (clauseId: string) => {
    setAgentMarkups((prev) => prev.filter((m) => m.clauseId !== clauseId));
    if (selectedMarkup?.clauseId === clauseId) {
      setSelectedMarkup(null);
      setEditingReplacement(false);
    }
  };

  const handleProposeCustomDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoc || !customOriginal.trim() || !customProposed.trim()) return;
    setProposing(true);
    try {
      const res = await fetch(apiUrl(`/api/documents/${activeDoc.id}/redline`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          originalText: customOriginal,
          proposedText: customProposed,
          comment: customComment || "User manual counter proposal",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit custom redline");
      setCustomOriginal("");
      setCustomProposed("");
      setCustomComment("");
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message || "Failed to propose custom redline.");
    } finally {
      setProposing(false);
    }
  };

  const handleAcceptDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      const res = await fetch(
        apiUrl(`/api/documents/${activeDoc.id}/redline/${rId}/accept`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Acceptance failed");
      }
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRejectDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      const res = await fetch(
        apiUrl(`/api/documents/${activeDoc.id}/redline/${rId}/reject`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Rejection failed");
      }
      onRefresh();
      loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const triggerAutoNegotiation = async (playbookPreferred: boolean) => {
    if (!selectedMarkup) return;
    setDraftingCompromise(true);
    try {
      const res = await fetch(apiUrl("/api/negotiate/compromise"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          originalText: selectedMarkup.original,
          riskExplanation: selectedMarkup.reasoning,
          userPrompt: "",
          playbookPreferred,
        }),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "Failed to generate compromise");
      const draftResult = parsed.result;
      setSelectedMarkup((prev) => (prev ? { ...prev, replacement: draftResult } : null));
      setAgentMarkups((prev) =>
        prev.map((m) =>
          m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: draftResult } : m
        )
      );
    } catch (err: any) {
      alert("Error drafting compromise: " + err.message);
    } finally {
      setDraftingCompromise(false);
    }
  };

  /**
   * Build the rendered HTML for the document.
   *
   * Documents are stored as raw Markdown (produced by the DraftingAgent and
   * NegotiationAgent). We convert to HTML with markdownToHtml(), then inject
   * clickable highlight spans around every flagged clause so the existing
   * clause-selection UX continues to work.
   *
   * The approach:
   *  1. Convert Markdown → HTML once.
   *  2. For each agentMarkup, search for the verbatim original text in the HTML
   *     and wrap it with a highlight span.
   *  3. dangerouslySetInnerHTML the result into the document pane.
   *     (No user-supplied HTML reaches this path — the content comes from
   *      the LLM via our own backend, and markdown-it has html:false.)
   */
  const renderedDocumentHtml = useMemo(() => {
    if (!activeDoc?.content) return "";

    const raw = activeDoc.content;
    // If the content is already HTML (e.g. saved from TipTap editor), use it
    // directly; otherwise convert from Markdown.
    const isHtml = /<[a-z][\s\S]*>/i.test(raw.trim());
    let html = isHtml ? raw : markdownToHtml(raw);

    // Overlay clause highlights by injecting spans into the rendered HTML.
    // We iterate markups in reverse risk-priority (RED first) so higher-risk
    // spans don't get nested inside lower-risk ones on duplicate matches.
    const sorted = [...agentMarkups].sort((a, b) => {
      const order = { RED: 0, YELLOW: 1, GREEN: 2 };
      return order[a.riskLevel] - order[b.riskLevel];
    });

    for (const m of sorted) {
      if (!m.original || m.original.trim().length <= 10) continue;

      // Escape the original text for use in a regex
      const escaped = m.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "");

      if (!regex.test(html)) continue; // clause not found in rendered HTML

      const isActive = selectedMarkup?.clauseId === m.clauseId;
      const riskColor =
        m.riskLevel === "RED"
          ? "bg-red-50 border-red-200 hover:bg-red-100"
          : m.riskLevel === "YELLOW"
          ? "bg-amber-50 border-amber-200 hover:bg-amber-100"
          : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100";
      const activeRing = isActive ? "ring-2 ring-offset-1 ring-gray-900" : "";

      const spanOpen =
        `<span ` +
        `data-clause-id="${m.clauseId}" ` +
        `class="negotiate-clause-highlight inline cursor-pointer rounded px-1 py-0.5 border transition-all ${riskColor} ${activeRing}" ` +
        `title="Click to review AI suggestion">` +
        `<span class="line-through text-red-600 text-[0.8125rem]">`;
      const spanClose = `</span></span>`;

      html = html.replace(regex, `${spanOpen}${m.original}${spanClose}`);
    }

    return html;
  }, [activeDoc?.content, agentMarkups, selectedMarkup]);

  // Handle clicks on highlighted clauses (delegated from the document pane).
  const handleDocumentPaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const highlight = target.closest("[data-clause-id]") as HTMLElement | null;
    if (!highlight) return;
    const clauseId = highlight.dataset.clauseId;
    const markup = agentMarkups.find((m) => m.clauseId === clauseId);
    if (markup) {
      setSelectedMarkup(markup);
      setEditingReplacement(false);
    }
  };

  const renderDocumentPane = (text: string) => {
    if (!text)
      return (
        <p className="text-gray-400 italic text-sm text-center py-12">
          Agreement content is empty.
        </p>
      );

    if (!renderedDocumentHtml) return null;

    return (
      <div
        className="negotiate-document-body prose prose-sm max-w-none text-[#1a2234]"
        onClick={handleDocumentPaneClick}
        // markdown-it renders with html:false, so no raw HTML injection risk.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: renderedDocumentHtml }}
      />
    );
  };

  const pendingDbRedlines = activeDoc?.redlines?.filter((r) => r.status === "pending") || [];
  const isLocked =
    activeDoc?.signatures &&
    activeDoc.signatures.length > 0 &&
    activeDoc.signatures.every((s) => s.status === "signed");

  const riskConfig = {
    RED: {
      label: "High Risk",
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
    YELLOW: {
      label: "Medium Risk",
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-700",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    GREEN: {
      label: "Low Risk",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB] min-h-screen">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="px-10 pt-8 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FAFAFB] sticky top-0 z-10 border-b border-gray-100">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Negotiate Redlines</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">AI-assisted contract negotiation workspace</p>
        </div>

        {documents.length > 0 && (
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xs shrink-0">
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-[11px] text-gray-400 font-medium">Document</span>
            <select
              value={selectedDocId}
              onChange={handleDocumentChange}
              className="bg-transparent border-none text-[13px] font-semibold text-gray-900 focus:outline-none cursor-pointer"
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title} ({doc.type})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Workspace ───────────────────────────────────────── */}
      {activeDoc ? (
        <div className="flex flex-col xl:flex-row gap-0 h-full">

          {/* ── LEFT: Document Viewer ──────────────────────── */}
          <div className="flex-1 min-w-0 px-10 py-7 overflow-y-auto">
            <div className="max-w-[780px] mx-auto">

              {/* Doc meta */}
              <div className="flex items-start justify-between mb-7">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{activeDoc.type}</span>
                    {isLocked && (
                      <span className="badge badge-danger text-[10px]">Signed · Locked</span>
                    )}
                  </div>
                  <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">{activeDoc.title}</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">Version {activeDoc.versions?.length || 1} · ID: {activeDoc.id}</p>
                </div>
                {agentMarkups.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[12px] font-medium text-gray-600">{agentMarkups.length} clause{agentMarkups.length !== 1 ? "s" : ""} flagged</span>
                  </div>
                )}
              </div>

              {/* Document paper */}
              <div className="relative bg-white border border-gray-200 rounded-[14px] shadow-sm px-10 py-10 min-h-[520px]">
                <AiProgressOverlay
                  visible={evaluating || !!evaluationError}
                  message={evaluating ? "Parsing contract structure and detecting risk clauses..." : ""}
                  error={evaluationError}
                  label="Evaluating contract..."
                  onRetry={
                    evaluationError
                      ? () => {
                          setEvaluationError("");
                          if (activeDoc)
                            runMultiAgentEvaluation(activeDoc.id, activeDoc.content, {
                              title: activeDoc.title,
                              type: activeDoc.type,
                            });
                        }
                      : undefined
                  }
                  onDismiss={evaluationError ? () => setEvaluationError("") : undefined}
                />
                {!evaluating && !evaluationError && renderDocumentPane(activeDoc.content)}
              </div>

              {agentMarkups.length > 0 && (
                <p className="text-xs text-[#9CA3AF] mt-3 text-center">
                  Click a highlighted clause to review the AI suggestion →
                </p>
              )}
            </div>
          </div>

          {/* ── RIGHT: AI Negotiation Panel ───────────────── */}
          <div className="xl:w-[380px] shrink-0 border-l border-[#E5E7EB] bg-white flex flex-col">

            {/* Panel header */}
            <div className="px-6 py-5 border-b border-[#E5E7EB]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#111827]" />
                  <span className="text-sm font-semibold text-[#111827]">AI Negotiation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {evaluating ? (
                    <span className="badge badge-neutral animate-pulse">Analyzing…</span>
                  ) : agentMarkups.length > 0 ? (
                    <span className="badge badge-warning">{agentMarkups.length} Active</span>
                  ) : (
                    <span className="badge badge-success">All Clear</span>
                  )}
                </div>
              </div>

              {/* Clause navigator pills */}
              {agentMarkups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {agentMarkups.map((m) => {
                    const cfg = riskConfig[m.riskLevel];
                    const isActive = selectedMarkup?.clauseId === m.clauseId;
                    return (
                      <button
                        key={m.clauseId}
                        onClick={() => { setSelectedMarkup(m); setEditingReplacement(false); }}
                        className={`px-2.5 py-1 rounded-md text-[0.6875rem] font-semibold border transition-all cursor-pointer ${
                          isActive
                            ? "bg-[#111827] text-white border-[#111827]"
                            : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`
                        }`}
                      >
                        {m.clauseId}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Panel body — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {selectedMarkup ? (
                <>
                  {/* Negotiation Status */}
                  <div>
                    <p className="section-label mb-2">Negotiation Status</p>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const cfg = riskConfig[selectedMarkup.riskLevel];
                        return (
                          <span className={`badge ${cfg.bg} ${cfg.text} ${cfg.border} border flex items-center gap-1`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        );
                      })()}
                      <span className="text-xs text-[#6B7280]">
                        Clause <span className="font-semibold text-[#111827]">{selectedMarkup.clauseId}</span>
                      </span>
                    </div>
                  </div>

                  {/* Selected Clause */}
                  <div>
                    <p className="section-label mb-2">Selected Clause</p>
                    <div className="bg-red-50 border border-red-200 rounded-[8px] px-4 py-3">
                      <p className="text-[0.8125rem] text-red-800 leading-relaxed line-through decoration-red-400">
                        {selectedMarkup.original}
                      </p>
                    </div>
                  </div>

                  {/* Suggested Revision */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="section-label">Suggested Revision</p>
                      {!isLocked && (
                        <button
                          onClick={() => setEditingReplacement(!editingReplacement)}
                          className="flex items-center gap-1 text-[0.6875rem] font-medium text-[#6B7280] hover:text-[#111827] transition cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          {editingReplacement ? "Done" : "Edit"}
                        </button>
                      )}
                    </div>
                    {editingReplacement ? (
                      <textarea
                        value={selectedMarkup.replacement}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedMarkup((prev) => prev ? { ...prev, replacement: val } : null);
                          setAgentMarkups((prev) =>
                            prev.map((m) =>
                              m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: val } : m
                            )
                          );
                        }}
                        className="input-base text-[0.8125rem] leading-relaxed min-h-[96px] resize-none"
                      />
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-[8px] px-4 py-3">
                        <p className="text-[0.8125rem] text-emerald-800 leading-relaxed">
                          {selectedMarkup.replacement}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div>
                    <p className="section-label mb-2">Reasoning</p>
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] px-4 py-3">
                      <p className="text-[0.8125rem] text-[#374151] leading-relaxed">
                        {selectedMarkup.reasoning}
                      </p>
                    </div>
                  </div>

                  {/* Compromise shortcuts */}
                  {!isLocked && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => triggerAutoNegotiation(false)}
                        disabled={draftingCompromise}
                        className="btn-secondary text-xs justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {draftingCompromise ? "Drafting…" : "Draft Compromise"}
                      </button>
                      <button
                        onClick={() => triggerAutoNegotiation(true)}
                        disabled={draftingCompromise}
                        className="btn-secondary text-xs justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Enforce Playbook
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
                    <Scale className="w-5 h-5 text-[#9CA3AF]" />
                  </div>
                  <p className="text-sm font-medium text-[#374151]">
                    {agentMarkups.length === 0 && !evaluating
                      ? "No clauses flagged"
                      : "No clause selected"}
                  </p>
                  <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
                    {agentMarkups.length === 0 && !evaluating
                      ? "The AI found no risk clauses, or evaluation hasn't run yet."
                      : "Select a highlighted clause to review AI suggestions."}
                  </p>
                  {agentMarkups.length === 0 && !evaluating && (
                    <button
                      onClick={() => {
                        if (!activeDoc) return;
                        setEvaluatingDocId(null);
                        runMultiAgentEvaluation(activeDoc.id, activeDoc.content, {
                          title: activeDoc.title,
                          type: activeDoc.type,
                        });
                      }}
                      className="btn-secondary mt-4 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-run Evaluation
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Accept / Reject footer — only when clause is selected ── */}
            {selectedMarkup && !isLocked && (
              <div className="px-6 py-4 border-t border-[#E5E7EB] flex items-center gap-3">
                <button
                  onClick={() => handleAcceptAgentMarkup(selectedMarkup)}
                  disabled={acceptingMarkupId === selectedMarkup.clauseId}
                  className="btn-primary flex-1 justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" />
                  {acceptingMarkupId === selectedMarkup.clauseId ? "Applying…" : "Accept"}
                </button>
                <button
                  onClick={() => handleDismissMarkup(selectedMarkup.clauseId)}
                  className="btn-secondary px-4 justify-center text-sm"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            )}

            {/* ── Pending Redlines accordion ──────────────── */}
            {pendingDbRedlines.length > 0 && (
              <div className="border-t border-[#E5E7EB]">
                <button
                  onClick={() => setRedlinesOpen(!redlinesOpen)}
                  className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-[#9CA3AF]" />
                    <span>Pending Redlines</span>
                    <span className="badge badge-warning">{pendingDbRedlines.length}</span>
                  </div>
                  {redlinesOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                  )}
                </button>
                {redlinesOpen && (
                  <div className="px-6 pb-5 space-y-3 max-h-[260px] overflow-y-auto">
                    {pendingDbRedlines.map((p) => (
                      <div
                        key={p.id}
                        className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-[0.6875rem] text-[#9CA3AF]">
                          <span className="truncate max-w-[140px]">{p.proposedByEmail}</span>
                          <span>{new Date(p.proposedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[0.75rem] line-through text-red-600 leading-relaxed">
                            {p.originalText}
                          </p>
                          <p className="text-[0.75rem] text-emerald-700 font-medium leading-relaxed">
                            {p.proposedText}
                          </p>
                        </div>
                        {p.comment && (
                          <p className="text-[0.6875rem] italic text-[#9CA3AF]">{p.comment}</p>
                        )}
                        {!isLocked && (
                          <div className="flex gap-2 pt-0.5">
                            <button
                              onClick={() => handleAcceptDbRedline(p.id)}
                              className="btn-primary text-[0.6875rem] py-1 px-3"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectDbRedline(p.id)}
                              className="btn-secondary text-[0.6875rem] py-1 px-3"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      ) : (
        /* No document state */
        <div className="flex items-center justify-center min-h-[60vh] px-8">
          <div className="bg-white border border-[#E5E7EB] rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-14 text-center max-w-md w-full">
            <HeartHandshake className="w-10 h-10 text-[#D1D5DB] mx-auto mb-4" />
            <h3 className="font-semibold text-[#111827] text-lg">No document selected</h3>
            <p className="text-sm text-[#6B7280] mt-2 leading-relaxed">
              Upload a document or create a draft to start the negotiation workflow.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
