import React, { useMemo } from "react";
import { HeartHandshake, ChevronDown, ChevronUp } from "lucide-react";
import AiProgressOverlay from "../../../shared/components/AiProgressOverlay";
import { AgentMarkup } from "../types";
import { LegalDocument, RedlineProposal } from "../../../shared/types";
import { buildRenderedDocumentHtml } from "../utils";

interface DocumentViewerProps {
  activeDoc: LegalDocument;
  agentMarkups: AgentMarkup[];
  selectedMarkupId: string | null;
  evaluating: boolean;
  evaluationError: string;
  isLocked: boolean;
  redlinesOpen: boolean;
  pendingDbRedlines: RedlineProposal[];
  onDocumentPaneClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onRetryEvaluation: () => void;
  onDismissError: () => void;
  onToggleRedlines: () => void;
  onAcceptDbRedline: (id: string) => void;
  onRejectDbRedline: (id: string) => void;
}

export default function DocumentViewer({
  activeDoc, agentMarkups, selectedMarkupId, evaluating, evaluationError,
  isLocked, redlinesOpen, pendingDbRedlines,
  onDocumentPaneClick, onRetryEvaluation, onDismissError,
  onToggleRedlines, onAcceptDbRedline, onRejectDbRedline,
}: DocumentViewerProps) {
  const renderedHtml = useMemo(
    () => buildRenderedDocumentHtml(activeDoc.content, agentMarkups, selectedMarkupId),
    [activeDoc.content, agentMarkups, selectedMarkupId]
  );

  return (
    <div className="flex-1 min-w-0 px-10 py-7 overflow-y-auto">
      <div className="max-w-[780px] mx-auto">
        <div className="flex items-start justify-between mb-7">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{activeDoc.type}</span>
              {isLocked && <span className="badge badge-danger text-[10px]">Signed — Locked</span>}
            </div>
            <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">{activeDoc.title}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Version {activeDoc.versions?.length || 1} — ID: {activeDoc.id}</p>
          </div>
          {agentMarkups.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 mt-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[12px] font-medium text-gray-600">{agentMarkups.length} clause{agentMarkups.length !== 1 ? "s" : ""} flagged</span>
            </div>
          )}
        </div>

        <div className="relative bg-white border border-gray-200 rounded-[14px] shadow-sm px-10 py-10 min-h-[520px]">
          <AiProgressOverlay
            visible={evaluating || !!evaluationError}
            message={evaluating ? "Parsing contract structure and detecting risk clauses..." : ""}
            error={evaluationError}
            label="Evaluating contract..."
            onRetry={evaluationError ? onRetryEvaluation : undefined}
            onDismiss={evaluationError ? onDismissError : undefined}
          />
          {!evaluating && !evaluationError && (
            renderedHtml ? (
              <div
                className="negotiate-document-body prose prose-sm max-w-none text-[#1a2234]"
                onClick={onDocumentPaneClick}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <p className="text-gray-400 italic text-sm text-center py-12">Agreement content is empty.</p>
            )
          )}
        </div>

        {agentMarkups.length > 0 && (
          <p className="text-xs text-[#9CA3AF] mt-3 text-center">
            Click a highlighted clause to review the AI suggestion →
          </p>
        )}

        {/* Pending redlines accordion */}
        {pendingDbRedlines.length > 0 && (
          <div className="mt-4 border border-[#E5E7EB] rounded-[12px] overflow-hidden">
            <button
              onClick={onToggleRedlines}
              className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-[#9CA3AF]" />
                <span>Pending Redlines</span>
                <span className="badge badge-warning">{pendingDbRedlines.length}</span>
              </div>
              {redlinesOpen ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
            </button>
            {redlinesOpen && (
              <div className="px-6 pb-5 space-y-3 max-h-[260px] overflow-y-auto">
                {pendingDbRedlines.map((p) => (
                  <div key={p.id} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-[0.6875rem] text-[#9CA3AF]">
                      <span className="truncate max-w-[140px]">{p.proposedByEmail}</span>
                      <span>{new Date(p.proposedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[0.75rem] line-through text-red-600 leading-relaxed">{p.originalText}</p>
                      <p className="text-[0.75rem] text-emerald-700 font-medium leading-relaxed">{p.proposedText}</p>
                    </div>
                    {p.comment && <p className="text-[0.6875rem] italic text-[#9CA3AF]">{p.comment}</p>}
                    {!isLocked && (
                      <div className="flex gap-2 pt-0.5">
                        <button onClick={() => onAcceptDbRedline(p.id)} className="btn-primary text-[0.6875rem] py-1 px-3">Accept</button>
                        <button onClick={() => onRejectDbRedline(p.id)} className="btn-secondary text-[0.6875rem] py-1 px-3">Reject</button>
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
  );
}
