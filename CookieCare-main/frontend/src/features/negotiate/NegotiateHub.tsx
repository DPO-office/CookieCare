import React from "react";
import { FileText, HeartHandshake } from "lucide-react";
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
    rerunEvaluation, loadActiveDocumentDetails,
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
                <option key={doc.id} value={doc.id}>{doc.title} ({doc.type})</option>
              ))}
            </select>
          </div>
        )}
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
    </div>
  );
}
