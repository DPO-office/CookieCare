import React, { useState, useRef, useCallback } from "react";
import {
  FileDown,
  Printer,
  Save,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { LegalDocument } from "../../shared/types";
import { useNegotiate } from "./hooks/useNegotiate";
import DocumentViewer from "./components/DocumentViewer";
import NegotiationPanel from "./components/NegotiationPanel";
import DocumentPicker, { NegotiationSession } from "./components/DocumentPicker";
import { useAppContext } from "../../contexts/AppContext";

/** @deprecated All props are now read from AppContext */
interface NegotiateHubProps {
  documents?: LegalDocument[];
  activeDocument?: LegalDocument | null;
  authToken?: string;
  onRefresh?: () => void;
  onSelectDocument?: (doc: LegalDocument) => void;
}

interface WorkspaceProps {
  activeDocument: LegalDocument;
  authToken: string;
  onRefresh: () => void;
  onBack: () => void;
  /** Playbook selected on the entry screen — null means "no playbook". */
  initialPlaybookId: string | null;
  initialPlaybookName: string | null;
}

function NegotiateWorkspace({
  activeDocument,
  authToken,
  onRefresh,
  onBack,
  initialPlaybookId,
  initialPlaybookName,
}: WorkspaceProps) {
  const {
    activeDoc,
    agentMarkups,
    selectedMarkup,
    setSelectedMarkup,
    evaluating,
    evaluationError,
    setEvaluationError,
    acceptingMarkupId,
    appliedClause,
    editingReplacement,
    setEditingReplacement,
    redlinesOpen,
    setRedlinesOpen,
    draftingCompromise,
    handleAcceptAgentMarkup,
    handleDismissMarkup,
    handleAcceptDbRedline,
    handleRejectDbRedline,
    handleDocumentPaneClick,
    updateMarkupReplacement,
    rerunEvaluation,
    saving,
    showSavedToast,
    handleSaveDraft,
    handleExportDocument,
    userInstruction,
    setUserInstruction,
    selectedPlaybook,
    setSelectedPlaybook,
    negotiationStrategy,
    strategyDraftResult,
    draftFromStrategy,
    handleTextSelection,
    hasManualSelection,
    manualSelectionText,
    clearManualSelection,
    negotiateError,
    clearNegotiateError,
  } = useNegotiate({
    activeDocument,
    authToken,
    onRefresh,
    initialPlaybookId,
    initialPlaybookName,
  });

  const pendingDbRedlines = activeDoc?.redlines?.filter((r) => r.status === "pending") || [];
  const isLocked =
    activeDoc?.signatures &&
    activeDoc.signatures.length > 0 &&
    activeDoc.signatures.every((s) => s.status === "signed");

  // ── Resizable sidebar ──────────────────────────────────────────────────────
  const MIN_WIDTH = 300;
  const MAX_WIDTH = 560;
  const DEFAULT_WIDTH = 360;
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      // Dragging left edge: moving mouse LEFT increases width, RIGHT decreases
      const delta = startX.current - ev.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  return (
    <div className="dpa-results-bg flex h-full min-h-0 flex-1 flex-col overflow-hidden p-3 font-sans">
      <header
        className="mb-3 flex shrink-0 items-center justify-between gap-4 rounded-[24px] bg-white px-5 py-3.5"
        style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-[#EEF2FF] text-[#4F5BD9] transition-colors hover:bg-[#e4e9ff]"
            title="Back to document selection"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
              Legal Space · Negotiate
            </p>
            <p className="m-0 mt-0.5 truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              {activeDoc?.title ?? activeDocument.title}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleExportDocument("docx")}
            disabled={!activeDoc || saving}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#F7F8FB] px-3.5 text-[12px] font-medium text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileDown className="h-3.5 w-3.5" />
            Word
          </button>
          <button
            type="button"
            onClick={() => handleExportDocument("pdf")}
            disabled={!activeDoc || saving}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#F7F8FB] px-3.5 text-[12px] font-medium text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!activeDoc || saving}
            className="primary-gradient inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-none px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save"}
          </button>

          {showSavedToast && (
            <span className="score-badge bg-badge-green text-[12px] font-medium text-badge-green-text">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      </header>

      {activeDoc ? (
        <div className="flex min-h-0 flex-1 flex-nowrap gap-3 overflow-hidden">
          <DocumentViewer
            activeDoc={activeDoc}
            agentMarkups={agentMarkups}
            selectedMarkupId={selectedMarkup?.clauseId ?? null}
            acceptingMarkupId={acceptingMarkupId}
            appliedClause={appliedClause}
            evaluating={evaluating}
            evaluationError={evaluationError}
            isLocked={!!isLocked}
            redlinesOpen={redlinesOpen}
            pendingDbRedlines={pendingDbRedlines}
            onDocumentPaneClick={handleDocumentPaneClick}
            onTextSelection={handleTextSelection}
            hasManualSelection={hasManualSelection}
            onRetryEvaluation={rerunEvaluation}
            onDismissError={() => setEvaluationError("")}
            onToggleRedlines={() => setRedlinesOpen(!redlinesOpen)}
            onAcceptDbRedline={handleAcceptDbRedline}
            onRejectDbRedline={handleRejectDbRedline}
          />

          {/* Drag handle — sits between document and panel */}
          <div
            onMouseDown={onMouseDown}
            className="group relative flex shrink-0 cursor-col-resize items-center justify-center"
            style={{ width: "10px", marginLeft: "-6px", marginRight: "-6px", zIndex: 10 }}
            title="Drag to resize panel"
          >
            {/* Visual indicator: thin line + dots on hover */}
            <div className="h-full w-[2px] rounded-full bg-transparent transition-colors group-hover:bg-[#C7D0F8] group-active:bg-[#4F5BD9]" />
            <div className="absolute flex flex-col gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-1 w-1 rounded-full bg-[#D0D5DD] opacity-0 transition-opacity group-hover:opacity-100" />
              ))}
            </div>
          </div>

          {/* Resizable panel wrapper */}
          <div style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth }} className="shrink-0 h-full">
            <NegotiationPanel
              agentMarkups={agentMarkups}
              selectedMarkup={selectedMarkup}
              evaluating={evaluating}
              isLocked={!!isLocked}
              acceptingMarkupId={acceptingMarkupId}
              editingReplacement={editingReplacement}
              draftingCompromise={draftingCompromise}
              negotiationStrategy={negotiationStrategy}
              strategyDraftResult={strategyDraftResult}
              userInstruction={userInstruction}
              authToken={authToken}
              onSelectMarkup={(m) => {
                setSelectedMarkup(m);
                setEditingReplacement(false);
              }}
              onAccept={handleAcceptAgentMarkup}
              onDismiss={handleDismissMarkup}
              onToggleEdit={() => setEditingReplacement(!editingReplacement)}
              onUpdateReplacement={updateMarkupReplacement}
              onDraftFromStrategy={draftFromStrategy}
              onUserInstructionChange={setUserInstruction}
              onRerun={rerunEvaluation}
              selectedPlaybook={selectedPlaybook}
              onSelectedPlaybookChange={setSelectedPlaybook}
              hasManualSelection={hasManualSelection}
              manualSelectionText={manualSelectionText}
              onClearManualSelection={clearManualSelection}
              negotiateError={negotiateError}
              onClearNegotiateError={clearNegotiateError}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div
            className="w-full max-w-md rounded-[24px] bg-white px-8 py-10 text-center"
            style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
          >
            <img
              src="/images/resume-scan-2.gif"
              alt="Loading document"
              className="mx-auto mb-5 h-[140px] w-auto object-contain"
            />
            <h3 className="m-0 text-[18px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              Loading document…
            </h3>
            <p className="m-0 mt-2 text-[13px] leading-relaxed text-[#667085]">
              Fetching document details and starting AI evaluation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NegotiateHub(_props: NegotiateHubProps = {}) {
  const { authToken: ctxToken, fetchDocuments, setActiveDocument } = useAppContext();
  const authToken = ctxToken ?? "";
  const onRefresh = fetchDocuments;

  const [confirmedSession, setConfirmedSession] = useState<NegotiationSession | null>(null);

  const handleConfirm = (session: NegotiationSession) => {
    setActiveDocument(session.doc);
    setConfirmedSession(session);
  };

  const handleBack = () => {
    setConfirmedSession(null);
  };

  if (!confirmedSession) {
    return <DocumentPicker authToken={authToken} onConfirm={handleConfirm} />;
  }

  return (
    <NegotiateWorkspace
      activeDocument={confirmedSession.doc}
      authToken={authToken}
      onRefresh={onRefresh}
      onBack={handleBack}
      initialPlaybookId={confirmedSession.selectedPlaybookId}
      initialPlaybookName={confirmedSession.selectedPlaybookName}
    />
  );
}
