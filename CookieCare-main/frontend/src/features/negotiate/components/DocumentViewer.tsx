import React, { useMemo } from "react";
import { HeartHandshake, ChevronDown, ChevronUp, FileText, GitBranch } from "lucide-react";
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
    [activeDoc.content, agentMarkups, selectedMarkupId],
  );

  const version   = activeDoc.versions?.length || 1;
  const clauseCnt = agentMarkups.length;

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-[#FAFAFB]">
      <div className="max-w-[820px] mx-auto px-10 py-8">

        {/* ── Document body card ──────────────────────────────────── */}
        <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm px-12 py-10 min-h-[540px]">
          <AiProgressOverlay
            visible={evaluating || !!evaluationError}
            message={evaluating ? "Parsing contract structure and detecting risk clauses…" : ""}
            error={evaluationError}
            label="Evaluating contract…"
            onRetry={evaluationError ? onRetryEvaluation : undefined}
            onDismiss={evaluationError ? onDismissError : undefined}
          />

          {!evaluating && !evaluationError && (
            renderedHtml ? (
              <div
                className="negotiate-document-body prose prose-sm max-w-none text-gray-800 leading-[1.75]"
                onClick={onDocumentPaneClick}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <p className="text-gray-400 italic text-sm text-center py-16">
                Agreement content is empty.
              </p>
            )
          )}
        </div>

        {/* Hint */}
        {clauseCnt > 0 && !evaluating && (
          <p className="text-[11.5px] text-gray-400 mt-3 text-center">
            Click a highlighted clause in the document to review the AI suggestion →
          </p>
        )}

        {/* ── Pending DB redlines accordion ───────────────────────── */}
        {pendingDbRedlines.length > 0 && (
          <div className="mt-5 border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <button
              onClick={onToggleRedlines}
              className="w-full flex items-center justify-between px-6 py-4 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <HeartHandshake className="w-4 h-4 text-gray-400" />
                <span>Pending Redlines</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  {pendingDbRedlines.length}
                </span>
              </div>
              {redlinesOpen
                ? <ChevronUp   className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {redlinesOpen && (
              <div className="px-6 pb-5 space-y-3 max-h-[280px] overflow-y-auto border-t border-gray-100">
                {pendingDbRedlines.map((p) => (
                  <div
                    key={p.id}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span className="truncate max-w-[160px] font-medium">{p.proposedByEmail}</span>
                      <span>{new Date(p.proposedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[12px] line-through text-red-600 leading-relaxed">{p.originalText}</p>
                      <p className="text-[12px] text-emerald-700 font-medium leading-relaxed">{p.proposedText}</p>
                    </div>
                    {p.comment && (
                      <p className="text-[11.5px] italic text-gray-400">{p.comment}</p>
                    )}
                    {!isLocked && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => onAcceptDbRedline(p.id)}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-white text-[12px] font-semibold hover:opacity-90 transition"
                          style={{ background: "#1D6FD8" }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => onRejectDbRedline(p.id)}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
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
  );
}
