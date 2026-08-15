import React, { useEffect, useMemo } from "react";
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
  acceptingMarkupId: string | null;
  appliedClause: { id: string; text: string } | null;
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
  acceptingMarkupId,
  appliedClause,
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
    () =>
      buildRenderedDocumentHtml(activeDoc.content, agentMarkups, selectedMarkupId, {
        appliedClause,
      }),
    [activeDoc.content, agentMarkups, selectedMarkupId, appliedClause],
  );

  useEffect(() => {
    if (!acceptingMarkupId) return;
    const el = document.querySelector(
      `[data-clause-id="${CSS.escape(acceptingMarkupId)}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.classList.add("negotiate-clause-working");
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [acceptingMarkupId]);

  useEffect(() => {
    if (!appliedClause?.id) return;
    const el = document.querySelector(
      `[data-clause-id="${CSS.escape(appliedClause.id)}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [appliedClause?.id]);

  const clauseCnt = agentMarkups.length;

  return (
    <>
      <style>{NEGOTIATE_WORKSPACE_STYLES}</style>
      <div className="negotiate-scroll scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto bg-transparent">
        <div className="mx-auto flex min-h-full w-full max-w-[1100px] flex-col justify-start px-6 py-5 sm:px-10">
          <div
            className="negotiate-paper relative min-h-[calc(100%-8px)] flex-1 overflow-hidden bg-white"
            style={{
              borderRadius: 22,
              boxShadow:
                "0 25px 50px -12px rgba(15, 23, 42, 0.18), 0 8px 16px -8px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)",
              padding: "48px 56px 64px",
            }}
          >
            <AiProgressOverlay
              visible={evaluating || !!evaluationError}
              message={evaluating ? "Parsing contract structure and detecting risk clauses…" : ""}
              error={evaluationError}
              label="Evaluating contract"
              subtitle={activeDoc.title}
              illustration="scan"
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
            <p className="mt-4 text-center text-[11px] text-[#98A2B3]">
              Click a highlighted clause in the document to review the AI suggestion
            </p>
          )}

          {pendingDbRedlines.length > 0 && (
            <div
              className="mt-5 overflow-hidden bg-white"
              style={{
                borderRadius: 22,
                boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
              }}
            >
              <button
                type="button"
                onClick={onToggleRedlines}
                className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-5 py-4 text-[13px] font-medium text-[#1a1a1a] transition hover:bg-[#F7F8FB]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                    <HeartHandshake className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <span>Pending redlines</span>
                  <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
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
                <div className="negotiate-scroll max-h-[280px] space-y-3 overflow-y-auto border-t border-[#F4F4F5] px-5 pb-5">
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
                            className="primary-gradient inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-none px-4 text-[12px] font-semibold text-white"
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
