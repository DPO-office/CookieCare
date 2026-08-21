import React, { useMemo, useState } from "react";
import {
  FileDown,
  Printer,
  Save,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { LegalDocument } from "../../shared/types";
import { isPlaceholderVaultDocument } from "../analyze/utils/vaultDocumentFilters";
import { useNegotiate } from "./hooks/useNegotiate";
import DocumentViewer from "./components/DocumentViewer";
import NegotiationPanel from "./components/NegotiationPanel";
import DocumentPicker from "./components/DocumentPicker";
import DocumentSwitcher from "./components/DocumentSwitcher";
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
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument | null) => void;
  onBack: () => void;
}

function NegotiateWorkspace({
  documents,
  activeDocument,
  authToken,
  onRefresh,
  onSelectDocument,
  onBack,
}: WorkspaceProps) {
  const negotiableDocuments = useMemo(
    () => documents.filter((doc) => !isPlaceholderVaultDocument(doc)),
    [documents],
  );

  const {
    selectedDocId,
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
    selectDocumentById,
    handleAcceptAgentMarkup,
    handleDismissMarkup,
    handleAcceptDbRedline,
    handleRejectDbRedline,
    triggerAutoNegotiation,
    handleDocumentPaneClick,
    updateMarkupReplacement,
    rerunEvaluation,
    saving,
    showSavedToast,
    handleSaveDraft,
    handleExportDocument,
  } = useNegotiate({
    documents: negotiableDocuments,
    activeDocument,
    authToken,
    onRefresh,
    onSelectDocument,
  });

  const pendingDbRedlines = activeDoc?.redlines?.filter((r) => r.status === "pending") || [];
  const isLocked =
    activeDoc?.signatures &&
    activeDoc.signatures.length > 0 &&
    activeDoc.signatures.every((s) => s.status === "signed");

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
              {activeDoc?.title ?? "Negotiate redlines"}
            </p>
          </div>
        </div>

        {negotiableDocuments.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <DocumentSwitcher
              documents={negotiableDocuments}
              selectedId={selectedDocId}
              onSelect={selectDocumentById}
            />

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
        )}
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
            onRetryEvaluation={rerunEvaluation}
            onDismissError={() => setEvaluationError("")}
            onToggleRedlines={() => setRedlinesOpen(!redlinesOpen)}
            onAcceptDbRedline={handleAcceptDbRedline}
            onRejectDbRedline={handleRejectDbRedline}
          />
          <NegotiationPanel
            agentMarkups={agentMarkups}
            selectedMarkup={selectedMarkup}
            evaluating={evaluating}
            isLocked={!!isLocked}
            acceptingMarkupId={acceptingMarkupId}
            editingReplacement={editingReplacement}
            draftingCompromise={draftingCompromise}
            onSelectMarkup={(m) => {
              setSelectedMarkup(m);
              setEditingReplacement(false);
            }}
            onAccept={handleAcceptAgentMarkup}
            onDismiss={handleDismissMarkup}
            onToggleEdit={() => setEditingReplacement(!editingReplacement)}
            onUpdateReplacement={updateMarkupReplacement}
            onTriggerCompromise={triggerAutoNegotiation}
            onRerun={rerunEvaluation}
          />
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
  const { documents, activeDocument, authToken: ctxToken, fetchDocuments, setActiveDocument } = useAppContext();
  const authToken = ctxToken ?? "";
  const onRefresh = fetchDocuments;
  const onSelectDocument = setActiveDocument;

  const [confirmedDoc, setConfirmedDoc] = useState<LegalDocument | null>(null);

  const negotiableDocuments = useMemo(
    () => documents.filter((doc) => !isPlaceholderVaultDocument(doc)),
    [documents],
  );

  const handleConfirm = (doc: LegalDocument) => {
    onSelectDocument(doc);
    setConfirmedDoc(doc);
  };

  const handleBack = () => {
    setConfirmedDoc(null);
  };

  if (!confirmedDoc) {
    return <DocumentPicker documents={negotiableDocuments} onConfirm={handleConfirm} />;
  }

  return (
    <NegotiateWorkspace
      documents={negotiableDocuments}
      activeDocument={confirmedDoc}
      authToken={authToken}
      onRefresh={onRefresh}
      onSelectDocument={onSelectDocument}
      onBack={handleBack}
    />
  );
}
