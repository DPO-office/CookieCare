import React, { useMemo, useState } from "react";
import {
  FileText,
  HeartHandshake,
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

interface NegotiateHubProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument) => void;
}

function NegotiateWorkspace({
  documents,
  activeDocument,
  authToken,
  onRefresh,
  onSelectDocument,
  onBack,
}: NegotiateHubProps & { onBack: () => void }) {
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
    editingReplacement,
    setEditingReplacement,
    redlinesOpen,
    setRedlinesOpen,
    draftingCompromise,
    handleDocumentChange,
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
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFA]">
      <header className="shrink-0 bg-white border-b border-[#F0F0F0] px-5 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F4F4F5] text-[#71717A] hover:bg-[#EBEBEB] hover:text-[#18181B] transition-colors shrink-0 border-none cursor-pointer"
              title="Back to document selection"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-[#18181B] m-0 truncate">
                Negotiate redlines
              </h1>
              <p className="text-[12px] text-[#A1A1AA] m-0 mt-0.5 truncate">
                {activeDoc?.title ?? "Select a document"}
              </p>
            </div>
          </div>

          {negotiableDocuments.length > 0 && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <div className="flex items-center gap-2 bg-white border border-[#E4E4E7] h-9 px-3 rounded-full">
                <FileText className="w-3.5 h-3.5 text-[#A1A1AA] shrink-0" />
                <select
                  value={selectedDocId}
                  onChange={handleDocumentChange}
                  className="bg-transparent border-none text-[12px] font-medium text-[#18181B] focus:outline-none cursor-pointer max-w-[220px]"
                >
                  {negotiableDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => handleExportDocument("docx")}
                disabled={!activeDoc || saving}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-[#E4E4E7] bg-white text-[#52525B] text-[12px] font-medium hover:bg-[#FAFAFA] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Word
              </button>
              <button
                type="button"
                onClick={() => handleExportDocument("pdf")}
                disabled={!activeDoc || saving}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-[#E4E4E7] bg-white text-[#52525B] text-[12px] font-medium hover:bg-[#FAFAFA] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={!activeDoc || saving}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#18181B] text-white text-[12px] font-semibold hover:bg-[#262626] transition disabled:opacity-40 disabled:cursor-not-allowed border-none cursor-pointer"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? "Saving…" : "Save"}
              </button>

              {showSavedToast && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181B] text-white text-[12px] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {activeDoc ? (
        <div className="flex-1 flex overflow-hidden min-h-0">
          <DocumentViewer
            activeDoc={activeDoc}
            agentMarkups={agentMarkups}
            selectedMarkupId={selectedMarkup?.clauseId ?? null}
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
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="bg-white border border-[#EBEBEB] rounded-[22px] shadow-sm p-12 text-center max-w-md w-full">
            <HeartHandshake className="w-10 h-10 text-[#D4D4D8] mx-auto mb-4" />
            <h3 className="font-semibold text-[#18181B] text-[16px] m-0">Loading document…</h3>
            <p className="text-[13px] text-[#A1A1AA] mt-2 leading-relaxed m-0">
              Fetching document details and starting AI evaluation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NegotiateHub({
  documents,
  activeDocument,
  authToken,
  onRefresh,
  onSelectDocument,
}: NegotiateHubProps) {
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
