import React, { useState } from "react";
import { FileText, HeartHandshake, FileDown, Printer, Save, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { LegalDocument } from "../../shared/types";
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

/* ·············································································
   NegotiateWorkspace
   Mounted only after the user has explicitly chosen a document.
   Keeps the hook and all negotiation logic completely unchanged.
············································································· */
function NegotiateWorkspace({
  documents, activeDocument, authToken, onRefresh, onSelectDocument, onBack,
}: NegotiateHubProps & { onBack: () => void }) {
  const {
    selectedDocId, activeDoc, agentMarkups, selectedMarkup, setSelectedMarkup,
    evaluating, evaluationError, setEvaluationError, acceptingMarkupId,
    editingReplacement, setEditingReplacement, redlinesOpen, setRedlinesOpen,
    draftingCompromise, handleDocumentChange, handleAcceptAgentMarkup,
    handleDismissMarkup, handleAcceptDbRedline, handleRejectDbRedline,
    triggerAutoNegotiation, handleDocumentPaneClick, updateMarkupReplacement,
    rerunEvaluation, loadActiveDocumentDetails, saving, showSavedToast,
    handleSaveDraft, handleExportDocument,
  } = useNegotiate({ documents, activeDocument, authToken, onRefresh, onSelectDocument });

  const pendingDbRedlines = activeDoc?.redlines?.filter((r) => r.status === "pending") || [];
  const isLocked =
    activeDoc?.signatures &&
    activeDoc.signatures.length > 0 &&
    activeDoc.signatures.every((s) => s.status === "signed");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFB]">

      {/* ·· Page header — matches Draft Agreements pattern ·········· */}
      <div className="px-10 pt-8 pb-6 shrink-0">
        <div className="w-full max-w-5xl mx-auto flex justify-between items-start">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all shrink-0 mt-1"
              title="Back to document selection"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#2175D9" }}>Negotiate Redlines</h1>
              <p className="text-[13px] text-gray-500 mt-1">Review, redline, and resolve contract positions.</p>
            </div>
          </div>

          {/* Right: doc switcher + tools */}
          {documents.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Document selector */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 h-9 px-3 rounded-xl shadow-xs">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <select
                  value={selectedDocId}
                  onChange={handleDocumentChange}
                  className="bg-transparent border-none text-[12px] font-semibold text-gray-800 focus:outline-none cursor-pointer max-w-[280px]"
                >
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                  ))}
                </select>
              </div>

              {/* Export buttons */}
              <button
                type="button"
                onClick={() => handleExportDocument("docx")}
                disabled={!activeDoc || saving}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 bg-white text-gray-500 text-[12px] font-medium hover:bg-gray-50 hover:text-gray-900 transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Word</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportDocument("pdf")}
                disabled={!activeDoc || saving}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 bg-white text-gray-500 text-[12px] font-medium hover:bg-gray-50 hover:text-gray-900 transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={!activeDoc || saving}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-white text-[12px] font-semibold hover:opacity-90 transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "#2175D9" }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saving ? "Saving…" : "Save"}</span>
              </button>

              {showSavedToast && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-medium border border-emerald-100">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ·· Workspace body ·········································· */}
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
            onSelectMarkup={(m) => { setSelectedMarkup(m); setEditingReplacement(false); }}
            onAccept={handleAcceptAgentMarkup}
            onDismiss={handleDismissMarkup}
            onToggleEdit={() => setEditingReplacement(!editingReplacement)}
            onUpdateReplacement={updateMarkupReplacement}
            onTriggerCompromise={triggerAutoNegotiation}
            onRerun={rerunEvaluation}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-10">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-14 text-center max-w-md w-full">
            <HeartHandshake className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 text-[16px]">Loading document…</h3>
            <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">
              Fetching document details and starting AI evaluation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ·············································································
   NegotiateHub  (entry point)
   Shows DocumentPicker until the user explicitly confirms a selection.
············································································· */
export default function NegotiateHub({
  documents, activeDocument, authToken, onRefresh, onSelectDocument,
}: NegotiateHubProps) {
  const [confirmedDoc, setConfirmedDoc] = useState<LegalDocument | null>(null);

  const handleConfirm = (doc: LegalDocument) => {
    onSelectDocument(doc);
    setConfirmedDoc(doc);
  };

  const handleBack = () => {
    setConfirmedDoc(null);
  };

  if (!confirmedDoc) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFB]">
        {/* Page header — matches Draft Agreements pattern */}
        <div className="px-10 pt-8 pb-0 shrink-0">
          <div className="w-full max-w-5xl mx-auto flex justify-between items-start mb-9">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#2175D9" }}>Negotiate Redlines</h1>
              <p className="text-[13px] text-gray-500 mt-1">Review, redline, and resolve contract positions.</p>
            </div>
          </div>
        </div>
        <DocumentPicker documents={documents} onConfirm={handleConfirm} />
      </div>
    );
  }

  return (
    <NegotiateWorkspace
      documents={documents}
      activeDocument={confirmedDoc}
      authToken={authToken}
      onRefresh={onRefresh}
      onSelectDocument={onSelectDocument}
      onBack={handleBack}
    />
  );
}
