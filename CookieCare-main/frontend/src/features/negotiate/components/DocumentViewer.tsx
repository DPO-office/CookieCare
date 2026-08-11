import React, { useMemo } from "react";
import { HeartHandshake, ChevronDown, ChevronUp } from "lucide-react";
import AiProgressOverlay from "../../../shared/components/AiProgressOverlay";
import { AgentMarkup } from "../types";
import { LegalDocument, RedlineProposal } from "../../../shared/types";
import { buildRenderedDocumentHtml } from "../utils";
import { NEGOTIATE_WORKSPACE_STYLES } from "../styles/negotiateWorkspaceStyles";

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
  activeDoc,
  agentMarkups,
  selectedMarkupId,
  evaluating,
  evaluationError,
  isLocked,
  redlinesOpen,
  pendingDbRedlines,
  onDocumentPaneClick,
  onRetryEvaluation,
  onDismissError,
  onToggleRedlines,
  onAcceptDbRedline,
  onRejectDbRedline,
}: DocumentViewerProps) {
  const renderedHtml = useMemo(
    () => buildRenderedDocumentHtml(activeDoc.content, agentMarkups, selectedMarkupId),
    [activeDoc.content, agentMarkups, selectedMarkupId],
  );

  const clauseCnt = agentMarkups.length;

  return (
    <>
      <style>{NEGOTIATE_WORKSPACE_STYLES}</style>
      <div className="flex-1 min-w-0 overflow-y-auto bg-[#FAFAFA]">
        <div className="max-w-[780px] mx-auto px-6 py-6">
          <div
            className="relative bg-white overflow-hidden min-h-[540px]"
            style={{
              borderRadius: 22,
              border: "1px solid #EBEBEB",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)",
              padding: "48px 56px",
            }}
          >
            <AiProgressOverlay
              visible={evaluating || !!evaluationError}
              message={evaluating ? "Parsing contract structure and detecting risk clauses…" : ""}
              error={evaluationError}
              label="Evaluating contract"
              subtitle={activeDoc.title}
              onRetry={evaluationError ? onRetryEvaluation : undefined}
              onDismiss={evaluationError ? onDismissError : undefined}
            />

            {!evaluating && !evaluationError && (
              renderedHtml ? (
                <div
                  className="negotiate-document-body prose prose-sm max-w-none"
                  onClick={onDocumentPaneClick}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              ) : (
                <p className="text-[#A1A1AA] italic text-sm text-center py-16 m-0">
                  Agreement content is empty.
                </p>
              )
            )}
          </div>

          {clauseCnt > 0 && !evaluating && (
            <p className="text-[11px] text-[#C4C4C4] mt-4 text-center m-0">
              Click a highlighted clause in the document to review the AI suggestion
            </p>
          )}

          {pendingDbRedlines.length > 0 && (
            <div
              className="mt-5 overflow-hidden bg-white"
              style={{
                borderRadius: 22,
                border: "1px solid #EBEBEB",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <button
                type="button"
                onClick={onToggleRedlines}
                className="w-full flex items-center justify-between px-5 py-4 text-[13px] font-medium text-[#18181B] hover:bg-[#FAFAFA] transition border-none bg-transparent cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <HeartHandshake className="w-4 h-4 text-[#A1A1AA]" />
                  <span>Pending redlines</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#92400E]">
                    {pendingDbRedlines.length}
                  </span>
                </div>
                {redlinesOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#A1A1AA]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#A1A1AA]" />
                )}
              </button>

              {redlinesOpen && (
                <div className="px-5 pb-5 space-y-3 max-h-[280px] overflow-y-auto border-t border-[#F4F4F5]">
                  {pendingDbRedlines.map((p) => (
                    <div
                      key={p.id}
                      className="bg-[#FAFAFA] border border-[#F0F0F0] rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#A1A1AA]">
                        <span className="truncate max-w-[160px] font-medium">{p.proposedByEmail}</span>
                        <span>{new Date(p.proposedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[12px] line-through text-[#DC2626] leading-relaxed m-0">
                          {p.originalText}
                        </p>
                        <p className="text-[12px] text-[#166534] font-medium leading-relaxed m-0">
                          {p.proposedText}
                        </p>
                      </div>
                      {p.comment && (
                        <p className="text-[11px] italic text-[#A1A1AA] m-0">{p.comment}</p>
                      )}
                      {!isLocked && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onAcceptDbRedline(p.id)}
                            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[#18181B] text-white text-[12px] font-semibold hover:bg-[#262626] transition border-none cursor-pointer"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onRejectDbRedline(p.id)}
                            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-[#E4E4E7] bg-white text-[12px] font-medium text-[#52525B] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition cursor-pointer"
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
    </>
  );
}
