import React, { useRef, useEffect, useState } from "react";
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  Copy,
  Download,
  Printer,
  Send,
  Check,
} from "lucide-react";
import { Message } from "../types";
import { renderContentText } from "../utils";
import { ANALYZE_STYLES } from "../styles/analyzeStyles";
import type { AnalysisOpenQuestion } from "../api/analysisJobs";

interface ReportViewProps {
  activeReportDocName: string;
  chatMessages: Message[];
  chatInput: string;
  showCopyToast: boolean;
  onBack: () => void;
  onChatInputChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onCopy: () => void;
  onDownload: () => void;
  onPrint: () => void;
  openQuestions?: AnalysisOpenQuestion[];
  askResolved?: boolean;
  askDisabled?: boolean;
  onAskSubmit?: (answers: Record<string, string>) => void;
  isStreaming?: boolean;
  progressMessage?: string;
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

  const allFilled = questions.every((q) => (answers[q.id] || "").trim().length > 0);

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
            {q.options && q.options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={resolved || disabled}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                      }
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
          onClick={() => onSubmit?.(answers)}
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
    <span key={message} className="analyze-status-shimmer" aria-live="polite">
      {message}
    </span>
  );
}

export default function ReportView({
  activeReportDocName,
  chatMessages,
  chatInput,
  showCopyToast,
  onBack,
  onChatInputChange,
  onSendMessage,
  onCopy,
  onDownload,
  onPrint,
  openQuestions = [],
  askResolved = false,
  askDisabled = false,
  onAskSubmit,
  isStreaming = false,
  progressMessage,
}: ReportViewProps) {
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, progressMessage]);

  const primaryReport = chatMessages.find(
    (m) => m.sender === "gemini" && !m.loading && !m.streaming && Boolean(m.text)
  );

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <div className="dpa-results-bg flex min-h-0 flex-1 flex-col overflow-hidden font-sans">
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
            <span className="score-badge hidden shrink-0 bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9] sm:inline-flex">
              Analyze
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
          <div className="mx-auto space-y-7 print-container" style={{ maxWidth: 768 }}>
            {chatMessages.length === 0 && openQuestions.length === 0 && (
              <div className="flex items-center gap-2.5">
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
              const isLiveWriting = Boolean(message.streaming && message.text);
              const isThinking = Boolean(
                !isLiveWriting && (message.streaming || (message.loading && !message.text))
              );

              if (isUser) {
                return (
                  <div key={idx} className="no-print flex justify-end">
                    <div className="analyze-user-bubble max-w-[min(80%,36rem)] whitespace-pre-wrap px-4 py-2.5">
                      {message.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="w-full">
                  <div className={`flex items-center justify-between gap-3 ${isThinking ? "" : "mb-3"}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <img
                        src={LORA_MARK}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded-[9px] object-cover"
                      />
                      {isThinking ? (
                        <StreamStatus message={progressMessage || "Thinking…"} />
                      ) : (
                        <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                          {isLiveWriting ? "Writing…" : "LORA"}
                        </p>
                      )}
                    </div>
                    {isFirstAi && primaryReport && (
                      <div className="no-print flex shrink-0 items-center gap-0.5">
                        {[
                          { icon: Copy, label: "Copy", onClick: onCopy },
                          { icon: Download, label: "Download", onClick: onDownload },
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

                  {!isThinking && (
                  <div className="pl-[42px]">
                    <div className={`analyze-report-prose${isLiveWriting ? " is-streaming" : ""}`}>
                      {message.text ? renderContentText(message.text) : (
                        <StreamStatus message={progressMessage || "Thinking…"} />
                      )}
                    </div>

                    {!message.loading && message.sources && message.sources.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {message.sources.map((s, sIdx) => (
                          <a
                            key={sIdx}
                            href={`https://example.com/grounding?q=${encodeURIComponent(s.title)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-[#667085] no-underline transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                            style={{
                              boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
                            }}
                          >
                            <Globe className="h-3 w-3 shrink-0 text-[#4F5BD9]" />
                            <span>
                              {s.title} ({s.citation})
                            </span>
                            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-40" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}

            {openQuestions.length > 0 && (
              <div className="no-print">
                <AskQuestionCard
                  key={openQuestions.map((q) => q.id).join("-")}
                  questions={openQuestions}
                  resolved={askResolved}
                  disabled={askDisabled}
                  onSubmit={onAskSubmit}
                />
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
        </div>

        <div className="analyze-composer-fade no-print shrink-0 px-6 pb-5 pt-8">
          <form onSubmit={onSendMessage} className="analyze-report-composer mx-auto" style={{ maxWidth: 768 }}>
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
              disabled={isStreaming || (openQuestions.length > 0 && !askResolved)}
              className="min-w-0 flex-1 border-none bg-transparent px-2 py-1 text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                isStreaming ||
                !chatInput.trim() ||
                (openQuestions.length > 0 && !askResolved)
              }
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none primary-gradient text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send follow-up"
            >
              <Send className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </form>
        </div>

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
