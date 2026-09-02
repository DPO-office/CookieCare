import React, { useRef, useEffect, useState, useMemo, memo, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Copy,
  Printer,
  Send,
  Check,
  BookOpen,
  ExternalLink,
  Link2,
  History,
} from "lucide-react";
import { Message } from "../types";
import { renderContentText, StreamingPlainText } from "../utils";
import { ensureAnalyzeStyles } from "../ensureAnalyzeStyles";
import { useReportScroll } from "../hooks/useReportScroll";
import type { StreamingStore } from "../streamingStore";
import type { AnalysisOpenQuestion } from "../api/analysisJobs";
import QuestionLibraryModal from "./QuestionLibraryModal";

interface ReportViewProps {
  activeReportDocName: string;
  chatMessages: Message[];
  showCopyToast: boolean;
  onBack: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onPrint: () => void;
  openQuestions?: AnalysisOpenQuestion[];
  askResolved?: boolean;
  askDisabled?: boolean;
  onAskSubmit?: (answers: Record<string, string>) => void;
  isStreaming?: boolean;
  progressMessage?: string;
  streamingStore?: StreamingStore;
  onSendFollowUp?: (text: string) => void;
  questionsLibrary?: string[];
  onOpenHistory?: () => void;
}

/** Unique source entry for the references panel */
interface RefEntry {
  index: number;
  title: string;
  citation: string;
  url: string;
}

function buildRefList(messages: Message[]): RefEntry[] {
  const seen = new Map<string, RefEntry>();
  let counter = 1;
  for (const msg of messages) {
    if (msg.sender !== "gemini" || !msg.sources) continue;
    for (const s of msg.sources) {
      const key = s.title + "||" + s.citation;
      if (!seen.has(key)) {
        // Build the best available URL from the citation / title
        const url = s.citation.startsWith("http")
          ? s.citation
          : `https://www.google.com/search?q=${encodeURIComponent(s.title)}`;
        seen.set(key, { index: counter++, title: s.title, citation: s.citation, url });
      }
    }
  }
  return Array.from(seen.values());
}

/** References side panel */
function ReferencesPanel({ refs }: { refs: RefEntry[] }) {
  if (refs.length === 0) return null;

  return (
    <aside className="analyze-refs-panel no-print">
      <div className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-[#4F5BD9]" strokeWidth={1.75} />
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
          References
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-5">
        <div className="space-y-0.5">
          {refs.map((ref) => (
            <a
              key={ref.index}
              href={ref.url}
              target="_blank"
              rel="noreferrer noopener"
              className="analyze-refs-item group"
            >
              <span className="analyze-refs-citation shrink-0">{ref.index}</span>
              <div className="min-w-0 flex-1">
                <p className="analyze-refs-title m-0 line-clamp-2">{ref.title}</p>
                <p className="m-0 mt-0.5 truncate text-[11px] text-[#98A2B3]">
                  {ref.citation}
                </p>
              </div>
              <ExternalLink
                className="h-3 w-3 shrink-0 text-[#D0D5DD] opacity-0 transition-opacity group-hover:opacity-100 mt-0.5"
                strokeWidth={1.75}
              />
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** field:"documentRoles" answer format the backend parser expects: "docId:role;docId:role". */
function composeDocumentRolesAnswer(
  perDocumentRoles: Array<{ docId: string; title: string }>,
  selections: Record<string, "target" | "reference">
): string {
  return perDocumentRoles
    .map(({ docId }) => (selections[docId] ? `${docId}:${selections[docId]}` : ""))
    .filter(Boolean)
    .join(";");
}

function DocumentRolePicker({
  perDocumentRoles,
  selections,
  disabled,
  onChange,
}: {
  perDocumentRoles: Array<{ docId: string; title: string }>;
  selections: Record<string, "target" | "reference">;
  disabled?: boolean;
  onChange: (docId: string, role: "target" | "reference") => void;
}) {
  return (
    <div className="space-y-2">
      {perDocumentRoles.map(({ docId, title }) => (
        <div
          key={docId}
          className="flex items-center justify-between gap-3 rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5"
        >
          <span className="text-[12.5px] text-[#3F3F46] truncate" title={title}>
            {title}
          </span>
          <div className="flex gap-1 shrink-0">
            {(["reference", "target"] as const).map((role) => {
              const selected = selections[docId] === role;
              return (
                <button
                  key={role}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(docId, role)}
                  className={`px-2 py-1 rounded text-[11.5px] border transition-colors ${
                    selected
                      ? "border-[#3F3F46] bg-[#3F3F46] text-white"
                      : "border-[#E4E4E7] bg-white text-[#52525B] hover:border-[#A1A1AA]"
                  } disabled:opacity-60`}
                >
                  {role === "reference" ? "Playbook" : "Target"}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AskQuestionCard({
  questions,
  resolved,
  disabled,
  onSubmit,
}: {
  questions: AnalysisOpenQuestion[];
  resolved?: boolean;
  disabled?: boolean;
  onSubmit?: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.id] = "";
    return initial;
  });
  const [docRoleSelections, setDocRoleSelections] = useState<
    Record<string, Record<string, "target" | "reference">>
  >(() => {
    const initial: Record<string, Record<string, "target" | "reference">> = {};
    for (const q of questions) if (q.perDocumentRoles) initial[q.id] = {};
    return initial;
  });

  const isFilled = (q: AnalysisOpenQuestion) => {
    if (q.perDocumentRoles && q.perDocumentRoles.length > 0) {
      const selections = docRoleSelections[q.id] || {};
      return q.perDocumentRoles.every((d) => Boolean(selections[d.docId]));
    }
    return (answers[q.id] || "").trim().length > 0;
  };
  const allFilled = questions.every(isFilled);

  const buildSubmission = (): Record<string, string> => {
    const out = { ...answers };
    for (const q of questions) {
      if (q.perDocumentRoles && q.perDocumentRoles.length > 0) {
        out[q.id] = composeDocumentRolesAnswer(q.perDocumentRoles, docRoleSelections[q.id] || {});
      }
    }
    return out;
  };

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white px-5 py-4 shadow-sm">
      <p className="text-[13.5px] text-[#3F3F46] leading-[1.65] mb-3 m-0">
        I need a few details before I can finish this analysis:
      </p>
      <div className="space-y-3.5">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <label className="block text-[12.5px] font-medium text-[#52525B] leading-snug">
              {q.question}
              {q.severity === "critical" && (
                <span className="ml-1 text-[#DC2626]">*</span>
              )}
            </label>
            {q.perDocumentRoles && q.perDocumentRoles.length > 0 ? (
              <DocumentRolePicker
                perDocumentRoles={q.perDocumentRoles}
                selections={docRoleSelections[q.id] || {}}
                disabled={resolved || disabled}
                onChange={(docId, role) =>
                  setDocRoleSelections((prev) => ({
                    ...prev,
                    [q.id]: { ...(prev[q.id] || {}), [docId]: role },
                  }))
                }
              />
            ) : q.options && q.options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={resolved || disabled}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                        selected
                          ? "border-[#3F3F46] bg-[#3F3F46] text-white"
                          : "border-[#E4E4E7] bg-[#FAFAFA] text-[#52525B] hover:border-[#A1A1AA]"
                      } disabled:opacity-60`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                value={answers[q.id] || ""}
                disabled={resolved || disabled}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                placeholder="Your answer"
                className="w-full rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5 text-[13px] text-[#3F3F46] outline-none focus:border-[#A1A1AA] disabled:opacity-60"
              />
            )}
          </div>
        ))}
      </div>
      {!resolved && (
        <button
          type="button"
          disabled={disabled || !allFilled}
          onClick={() => onSubmit?.(buildSubmission())}
          className="mt-3.5 w-full rounded-lg primary-gradient text-white text-[13px] font-medium py-2 disabled:opacity-40 hover:opacity-90 transition-opacity border-none cursor-pointer"
        >
          Continue analysis
        </button>
      )}
      {resolved && (
        <p className="mt-3 text-[12px] text-[#71717A] italic m-0">Answers submitted.</p>
      )}
    </div>
  );
}

const LORA_MARK = "/images/logo/favicon.png";

function StreamStatus({ message }: { message: string }) {
  return (
    <span className="analyze-status-shimmer" aria-live="polite">
      {message}
    </span>
  );
}

function LiveStreamHeader({
  store,
  progressMessage,
}: {
  store: StreamingStore;
  progressMessage?: string;
}) {
  const text = useSyncExternalStore(store.subscribe, store.getText, store.getText);
  if (!text) {
    return <StreamStatus message={progressMessage || "Thinking…"} />;
  }
  return (
    <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
      Writing…
    </p>
  );
}

interface ReportMessageListProps {
  chatMessages: Message[];
  openQuestions: AnalysisOpenQuestion[];
  progressMessage?: string;
  askResolved: boolean;
  askDisabled: boolean;
  streamingStore?: StreamingStore;
  onAskSubmit?: (answers: Record<string, string>) => void;
  onCopy: () => void;
  onPrint: () => void;
}

const ReportMessageList = memo(function ReportMessageList({
  chatMessages,
  openQuestions,
  progressMessage,
  askResolved,
  askDisabled,
  streamingStore,
  onAskSubmit,
  onCopy,
  onPrint,
}: ReportMessageListProps) {
  const primaryReport = chatMessages.find(
    (m) => m.sender === "gemini" && !m.loading && !m.streaming && Boolean(m.text)
  );
  const hasRequirementsTable = chatMessages.some(
    (m) =>
      m.sender === "gemini" &&
      /\|\s*Requirement\s*\|\s*Status\s*\|\s*Evidence\s*\|\s*Finding\s*\|\s*Action\s*\|/i.test(
        m.text || ""
      )
  );
  const hasRefs = useMemo(() => buildRefList(chatMessages).length > 0, [chatMessages]);

  return (
    <div
      className="mx-auto space-y-7 print-container analyze-prose-container"
      data-has-refs={hasRefs ? "true" : "false"}
      data-has-wide-table={hasRequirementsTable ? "true" : "false"}
    >
      {chatMessages.length === 0 && openQuestions.length === 0 && (
        <div className="analyze-report-message flex items-center gap-2.5">
          <img
            src={LORA_MARK}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-[9px] object-cover"
          />
          <StreamStatus message={progressMessage || "Thinking…"} />
        </div>
      )}

      {chatMessages.map((message, idx) => {
        const isUser = message.sender === "user";
        const isFirstAi =
          !isUser && chatMessages.findIndex((m) => m.sender === "gemini") === idx;
        const isStreamingMsg = Boolean(message.streaming);

        if (isUser) {
          return (
            <div key={idx} className="analyze-report-message no-print flex justify-end">
              <div className="analyze-user-bubble max-w-[min(80%,36rem)] whitespace-pre-wrap px-4 py-2.5">
                {message.text}
              </div>
            </div>
          );
        }

        return (
          <div key={idx} className="analyze-report-message w-full">
            <div className={`flex items-center gap-3 ${isStreamingMsg ? "" : "mb-3"}`}>
              <img
                src={LORA_MARK}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-[9px] object-cover"
              />
              {isStreamingMsg && streamingStore ? (
                <LiveStreamHeader store={streamingStore} progressMessage={progressMessage} />
              ) : (
                <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                  LORA
                </p>
              )}
            </div>

            {(isStreamingMsg && streamingStore) || message.text ? (
              <div className={hasRequirementsTable ? "min-w-0" : "pl-[42px]"}>
                <div
                  className={`analyze-report-prose${
                    isStreamingMsg ? " is-streaming" : ""
                  }${hasRequirementsTable ? " analyze-report-prose--wide-table" : ""}`}
                >
                  {isStreamingMsg && streamingStore ? (
                    <StreamingPlainText store={streamingStore} />
                  ) : message.text ? (
                    renderContentText(message.text)
                  ) : null}
                </div>
                {isFirstAi && primaryReport && (
                  <div className="no-print mt-3 flex items-center gap-0.5">
                    {[
                      { icon: Copy, label: "Copy", onClick: onCopy },
                      { icon: Printer, label: "Print", onClick: onPrint },
                    ].map(({ icon: Icon, label, onClick }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={onClick}
                        title={label}
                        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-2.5 text-[11px] font-medium text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {openQuestions.length > 0 && (
        <div className="analyze-report-message no-print">
          <AskQuestionCard
            key={openQuestions.map((q) => q.id).join("-")}
            questions={openQuestions}
            resolved={askResolved}
            disabled={askDisabled}
            onSubmit={onAskSubmit}
          />
        </div>
      )}
    </div>
  );
});

interface ReportFollowUpComposerProps {
  chatInput: string;
  isStreaming: boolean;
  openQuestions: AnalysisOpenQuestion[];
  askResolved: boolean;
  hasRequirementsTable: boolean;
  hasMarkdownTable: boolean;
  hasRefs: boolean;
  onChatInputChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onOpenQuestions: () => void;
}

const ReportFollowUpComposer = memo(function ReportFollowUpComposer({
  chatInput,
  isStreaming,
  openQuestions,
  askResolved,
  hasRequirementsTable,
  hasMarkdownTable,
  hasRefs,
  onChatInputChange,
  onSendMessage,
  onOpenQuestions,
}: ReportFollowUpComposerProps) {
  const followUpBlocked = isStreaming || (openQuestions.length > 0 && !askResolved);

  return (
    <div className="analyze-composer-fade no-print shrink-0 px-6 pb-5 pt-8">
      <form
        onSubmit={onSendMessage}
        className="analyze-report-composer mx-auto"
        style={{
          maxWidth: hasRequirementsTable ? 1100 : hasMarkdownTable ? 1100 : hasRefs ? 720 : 768,
        }}
      >
        <button
          type="button"
          onClick={onOpenQuestions}
          disabled={followUpBlocked}
          className="analyze-icon-btn shrink-0"
          aria-label="Browse questions"
          title="Browse questions"
        >
          <BookOpen className="h-[15px] w-[15px]" strokeWidth={1.75} />
        </button>
        <input
          type="text"
          placeholder={
            isStreaming
              ? "Analysis is still writing…"
              : openQuestions.length > 0 && !askResolved
              ? "Answer the questions above to continue…"
              : "Ask a follow-up…"
          }
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          disabled={followUpBlocked}
          className="min-w-0 flex-1 border-none bg-transparent px-2 py-1 text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={followUpBlocked || !chatInput.trim()}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none primary-gradient text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send follow-up"
        >
          <Send className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
});

export default function ReportView({
  activeReportDocName,
  chatMessages,
  showCopyToast,
  onBack,
  onCopy,
  onDownload,
  onPrint,
  openQuestions = [],
  askResolved = false,
  askDisabled = false,
  onAskSubmit,
  isStreaming = false,
  progressMessage,
  streamingStore,
  onSendFollowUp,
  questionsLibrary = [],
  onOpenHistory,
}: ReportViewProps) {
  const reportBodyRef = useRef<HTMLDivElement>(null);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    ensureAnalyzeStyles();
  }, []);

  useReportScroll(reportBodyRef);

  const handleSendFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !onSendFollowUp) return;
    setChatInput("");
    onSendFollowUp(text);
  };

  // Delegated handler for Show more / Show less toggles injected by markdownToHtml
  useEffect(() => {
    const container = reportBodyRef.current;
    if (!container) return;

    function handleToggleClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest(".md-clause-toggle");
      if (!btn) return;
      const textSpan = btn.previousElementSibling;
      if (!textSpan || !textSpan.classList.contains("md-clause-text")) return;
      const expanded = textSpan.classList.toggle("md-clause-expanded");
      btn.textContent = expanded ? "Show less" : "Show more";
    }

    container.addEventListener("click", handleToggleClick);
    return () => container.removeEventListener("click", handleToggleClick);
  }, []);

  const allRefs = useMemo(() => buildRefList(chatMessages), [chatMessages]);
  const hasRefs = allRefs.length > 0;
  const hasMarkdownTable = useMemo(
    () => chatMessages.some((m) => m.sender === "gemini" && /\|.+\|/.test(m.text || "")),
    [chatMessages]
  );
  const hasRequirementsTable = useMemo(
    () =>
      chatMessages.some(
        (m) =>
          m.sender === "gemini" &&
          /\|\s*Requirement\s*\|\s*Status\s*\|\s*Evidence\s*\|\s*Finding\s*\|\s*Action\s*\|/i.test(
            m.text || ""
          )
      ),
    [chatMessages]
  );

  return (
    <>
      <div className="dpa-results-bg flex min-h-0 flex-1 flex-col overflow-hidden font-sans">
        {/* Header */}
        <header className="no-print flex shrink-0 items-center justify-center px-6 pt-4 pb-2">
          <div className="analyze-chat-session flex h-11 w-full max-w-[768px] items-center justify-between gap-3 pl-3 pr-2">
            <button
              type="button"
              onClick={onBack}
              className="flex min-w-0 cursor-pointer items-center gap-2.5 border-none bg-transparent p-0 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  {activeReportDocName}
                </p>
              </div>
            </button>

            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="no-print analyze-history-btn"
                aria-label="Analysis history"
              >
                <History className="h-[13px] w-[13px]" strokeWidth={1.75} />
                <span>History</span>
              </button>
            )}
          </div>
        </header>

        {/* Body: main content + optional RHS references panel */}
        <div className="min-h-0 flex-1 flex min-w-0">
          {/* Main scrollable report area */}
          <div className="min-h-0 flex-1 flex flex-col min-w-0">
            <div ref={reportBodyRef} className="analyze-report-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
              <ReportMessageList
                chatMessages={chatMessages}
                openQuestions={openQuestions}
                progressMessage={progressMessage}
                askResolved={askResolved}
                askDisabled={askDisabled}
                streamingStore={streamingStore}
                onAskSubmit={onAskSubmit}
                onCopy={onCopy}
                onPrint={onPrint}
              />
            </div>

            <ReportFollowUpComposer
              chatInput={chatInput}
              isStreaming={isStreaming}
              openQuestions={openQuestions}
              askResolved={askResolved}
              hasRequirementsTable={hasRequirementsTable}
              hasMarkdownTable={hasMarkdownTable}
              hasRefs={hasRefs}
              onChatInputChange={setChatInput}
              onSendMessage={handleSendFollowUp}
              onOpenQuestions={() => setQuestionModalOpen(true)}
            />
          </div>

          {/* RHS references panel — only shown when there are sources */}
          <ReferencesPanel refs={allRefs} />
        </div>

        {/* Question library modal */}
        {questionModalOpen && (
          <QuestionLibraryModal
            questionsLibrary={questionsLibrary}
            onApply={(text) => {
              setChatInput(text);
              setQuestionModalOpen(false);
            }}
            onClose={() => setQuestionModalOpen(false)}
          />
        )}

        {/* Copy toast */}
        {showCopyToast && (
          <div className="fixed bottom-6 right-6 z-50 flex select-none items-center gap-2 rounded-full bg-[#111827] px-4 py-2.5 text-[13px] font-medium text-white">
            <Check className="h-4 w-4 shrink-0 text-[#3D9B8F]" />
            Copied to clipboard
          </div>
        )}
      </div>
    </>
  );
}
