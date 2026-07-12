import { useState, useEffect, useRef } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { LegalDocument } from "../../../shared/types";
import { AgentMarkup } from "../types";
import {
  evaluateDocument, submitRedline, acceptRedline,
  rejectRedline, generateCompromise, fetchDocumentDetails,
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
      const proposal = await submitRedline(
        authToken, activeDoc.id, markup.original, markup.replacement,
        `[Merged via AI Multi-Agent Audit]: ${markup.reasoning}`
      );
      await acceptRedline(authToken, activeDoc.id, proposal.id);
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
    if (selectedMarkup?.clauseId === clauseId) { setSelectedMarkup(null); setEditingReplacement(false); }
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
    rerunEvaluation, loadActiveDocumentDetails,
  };
}
