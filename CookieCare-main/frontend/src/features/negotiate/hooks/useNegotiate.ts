import { useState, useEffect, useRef } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { LegalDocument } from "../../../shared/types";
import { AgentMarkup } from "../types";
import {
  evaluateDocument, submitRedline, acceptRedline,
  rejectRedline, generateCompromise, fetchDocumentDetails,
  saveNegotiationStep, exportDocument,
} from "../api/negotiateApi";

interface UseNegotiateOptions {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument) => void;
}

export function useNegotiate({
  documents, activeDocument, authToken, onRefresh, onSelectDocument,
}: UseNegotiateOptions) {
  const [selectedDocId, setSelectedDocId] = useState<string>(
    activeDocument?.id || documents[0]?.id || ""
  );
  const [activeDoc, setActiveDoc] = useState<LegalDocument | null>(null);
  const [agentMarkups, setAgentMarkups] = useState<AgentMarkup[]>([]);
  const [selectedMarkup, setSelectedMarkup] = useState<AgentMarkup | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [acceptingMarkupId, setAcceptingMarkupId] = useState<string | null>(null);
  const [evaluatingDocId, setEvaluatingDocId] = useState<string | null>(null);
  const [editingReplacement, setEditingReplacement] = useState(false);
  const [redlinesOpen, setRedlinesOpen] = useState(false);
  const [draftingCompromise, setDraftingCompromise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const evalRequestIdRef = useRef(0);
  const loadedDocIdRef = useRef<string | null>(null);

  const loadActiveDocumentDetails = async (docId: string) => {
    if (!docId) return;
    try {
      const fullDoc = await fetchDocumentDetails(authToken, docId);
      setActiveDoc(fullDoc);
      runMultiAgentEvaluation(docId, fullDoc.content, { title: fullDoc.title, type: fullDoc.type });
    } catch (err) {
      console.error("Error fetching document details:", err);
    }
  };

  useEffect(() => {
    const docId = activeDocument?.id || documents[0]?.id || "";
    if (!docId) return;
    if (docId === loadedDocIdRef.current) return;
    loadedDocIdRef.current = docId;
    setSelectedDocId(docId);
    loadActiveDocumentDetails(docId);
  }, [activeDocument, documents]);

  const handleDocumentChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const docId = e.target.value;
    setSelectedDocId(docId);
    const matched = documents.find((d) => d.id === docId);
    if (!matched) return;
    onSelectDocument(matched);
  };

  const runMultiAgentEvaluation = async (
    docId: string, docContent: string, metadata: { title: string; type: string }
  ) => {
    if (!docContent) return;
    if (evaluatingDocId === docId) return;
    const requestId = ++evalRequestIdRef.current;
    setEvaluatingDocId(docId);
    setEvaluating(true);
    setEvaluationError("");
    try {
      const { markups } = await evaluateDocument(authToken, docContent, metadata.title, metadata.type);
      if (requestId !== evalRequestIdRef.current) return;
      setAgentMarkups(markups);
      setSelectedMarkup(markups.length > 0 ? markups[0] : null);
    } catch (err: any) {
      if (requestId === evalRequestIdRef.current) setEvaluationError(err.message);
    } finally {
      if (requestId === evalRequestIdRef.current) { setEvaluating(false); setEvaluatingDocId(null); }
    }
  };

  const handleAcceptAgentMarkup = async (markup: AgentMarkup) => {
    if (!activeDoc || acceptingMarkupId === markup.clauseId) return;
    setAcceptingMarkupId(markup.clauseId);
    try {
      // 1. Programmatically locate the active targeted text segment within the main document content state
      const textIndex = activeDoc.content.indexOf(markup.original);
      if (textIndex === -1) {
        throw new Error("Could not find the target clause in the document content.");
      }

      // 2. Surgically replace the old liability text with the AI proposed text
      const updatedContent = activeDoc.content.replace(markup.original, markup.replacement);

      // 3. Dispatch an API payload to trigger saveStep, incrementing version to next sequential digit
      const nextVersion = (activeDoc.versions?.length || 1) + 1;
      await saveNegotiationStep(authToken, activeDoc.id, updatedContent, nextVersion);

      // Filter local agent markups and clear focus
      setAgentMarkups((prev) => prev.filter((m) => m.clauseId !== markup.clauseId));
      setSelectedMarkup(null);
      setEditingReplacement(false);

      onRefresh();
      await loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert(err.message || "Failed to accept markup patch.");
    } finally {
      setAcceptingMarkupId(null);
    }
  };

  const handleDismissMarkup = (clauseId: string) => {
    // 1. Dismiss the AI negotiation suggestion sidebar context safely
    // 2. Restore normal UI state configuration without altering the underlying main document text
    setSelectedMarkup(null);
    setEditingReplacement(false);
  };

  const handleSaveDraft = async () => {
    if (!activeDoc || saving) return;
    setSaving(true);
    try {
      const currentVersion = activeDoc.versions?.length || 1;
      await saveNegotiationStep(authToken, activeDoc.id, activeDoc.content, currentVersion);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
      onRefresh();
      await loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) {
      alert("Failed to save draft: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportDocument = async (format: "pdf" | "docx") => {
    if (!activeDoc) return;
    try {
      const blob = await exportDocument(authToken, activeDoc.id, activeDoc.title, activeDoc.content, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeDoc.title.toLowerCase().replace(/\s+/g, "_")}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to download document: " + err.message);
    }
  };

  const handleAcceptDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      await acceptRedline(authToken, activeDoc.id, rId);
      onRefresh(); loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) { alert(err.message); }
  };

  const handleRejectDbRedline = async (rId: string) => {
    if (!activeDoc) return;
    try {
      await rejectRedline(authToken, activeDoc.id, rId);
      onRefresh(); loadActiveDocumentDetails(activeDoc.id);
    } catch (err: any) { alert(err.message); }
  };

  const triggerAutoNegotiation = async (playbookPreferred: boolean) => {
    if (!selectedMarkup) return;
    setDraftingCompromise(true);
    try {
      const draftResult = await generateCompromise(
        authToken, selectedMarkup.original, selectedMarkup.reasoning, playbookPreferred
      );
      setSelectedMarkup((prev) => prev ? { ...prev, replacement: draftResult } : null);
      setAgentMarkups((prev) =>
        prev.map((m) => m.clauseId === selectedMarkup.clauseId ? { ...m, replacement: draftResult } : m)
      );
    } catch (err: any) {
      alert("Error drafting compromise: " + err.message);
    } finally {
      setDraftingCompromise(false);
    }
  };

  const handleDocumentPaneClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const highlight = target.closest("[data-clause-id]") as HTMLElement | null;
    if (!highlight) return;
    const clauseId = highlight.dataset.clauseId;
    const markup = agentMarkups.find((m) => m.clauseId === clauseId);
    if (markup) { setSelectedMarkup(markup); setEditingReplacement(false); }
  };

  const updateMarkupReplacement = (val: string) => {
    setSelectedMarkup((prev) => prev ? { ...prev, replacement: val } : null);
    setAgentMarkups((prev) =>
      prev.map((m) => m.clauseId === selectedMarkup?.clauseId ? { ...m, replacement: val } : m)
    );
  };

  const rerunEvaluation = () => {
    if (!activeDoc) return;
    setEvaluatingDocId(null);
    runMultiAgentEvaluation(activeDoc.id, activeDoc.content, { title: activeDoc.title, type: activeDoc.type });
  };

  return {
    selectedDocId, activeDoc, agentMarkups, selectedMarkup, setSelectedMarkup,
    evaluating, evaluationError, setEvaluationError, acceptingMarkupId,
    editingReplacement, setEditingReplacement, redlinesOpen, setRedlinesOpen,
    draftingCompromise, handleDocumentChange, handleAcceptAgentMarkup,
    handleDismissMarkup, handleAcceptDbRedline, handleRejectDbRedline,
    triggerAutoNegotiation, handleDocumentPaneClick, updateMarkupReplacement,
    rerunEvaluation, loadActiveDocumentDetails, saving, showSavedToast,
    handleSaveDraft, handleExportDocument,
  };
}
