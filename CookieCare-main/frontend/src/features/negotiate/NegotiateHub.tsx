import React from "react";
import { FileText, HeartHandshake, Check, FileDown, Printer, Save } from "lucide-react";
import { LegalDocument } from "../../shared/types";
import { useNegotiate } from "./hooks/useNegotiate";
import DocumentViewer from "./components/DocumentViewer";
import NegotiationPanel from "./components/NegotiationPanel";

interface NegotiateHubProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument) => void;
}

export default function NegotiateHub({
  documents, activeDocument, authToken, onRefresh, onSelectDocument,
}: NegotiateHubProps) {
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
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB] min-h-screen">

      {/* Page Header */}
      <div className="px-10 pt-8 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FAFAFB] sticky top-0 z-10 border-b border-gray-100">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Negotiate Redlines</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">AI-assisted contract negotiation workspace</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {documents.length > 0 && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xs shrink-0">
              <FileText className="w-5 h-5 text-gray-400 shrink-0" />
              <select
                value={selectedDocId}
                onChange={handleDocumentChange}
                className="bg-transparent border-none text-[13px] font-semibold text-gray-900 focus:outline-none cursor-pointer"
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>{doc.title} ({doc.type})</option>
                ))}
              </select>
            </div>
          )}

          {activeDoc && (
            <>
              <span className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

              {/* Download as Word Button */}
              <button
                type="button"
                onClick={() => handleExportDocument("docx")}
                title="Download as Word"
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs cursor-pointer"
              >
                <FileDown className="w-4 h-4 text-gray-400" />
                <span className="hidden sm:inline">Word</span>
              </button>

              {/* Download as PDF Button */}
              <button
                type="button"
                onClick={() => handleExportDocument("pdf")}
                title="Download as PDF"
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4 text-gray-400" />
                <span className="hidden sm:inline">PDF</span>
              </button>

              {/* Save Draft Button */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || isLocked}
                title={isLocked ? "Document is sealed" : "Save draft"}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isLocked ? "Locked" : saving ? "Saving..." : "Save"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Workspace */}
      {activeDoc ? (
        <div className="flex flex-col xl:flex-row gap-0 h-full">
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

      {showSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-[12px] font-medium px-4 py-2.5 rounded-xl shadow-lg select-none flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Draft Saved Successfully</span>
        </div>
      )}
    </div>
  );
}
