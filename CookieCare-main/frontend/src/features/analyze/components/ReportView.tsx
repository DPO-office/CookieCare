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
  Scale,
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
          className="mt-3.5 w-full rounded-lg bg-[#18181B] text-white text-[13px] font-medium py-2 disabled:opacity-40 hover:bg-[#27272A] transition-colors border-none cursor-pointer"
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
  }, [chatMessages]);

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

<<<<<<< HEAD
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
            {/* Report card */}
            <article className="analyze-report-card print-container overflow-hidden">
              <div className="px-8 py-5 border-b border-[#F0F0F0] bg-[#FAFAFA]/80 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider m-0">
                    Legal assessment
                  </p>
                  <p className="text-[12px] text-[#A1A1AA] m-0 mt-1">Confidential</p>
                </div>
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-white border border-[#EBEBEB] text-[#A1A1AA] shrink-0">
                  Report
                </span>
              </div>

              <div className="px-8 py-8">
                {chatMessages.length === 0 && openQuestions.length === 0 ? (
                  <div className="flex items-center gap-3 text-[#A1A1AA]">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span className="text-[13px]">Preparing analysis…</span>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {chatMessages.map((message, idx) => {
                      const isUser = message.sender === "user";
                      const isFirstAi =
                        !isUser && chatMessages.findIndex((m) => m.sender === "gemini") === idx;

                      if (isUser) {
                        return (
                          <div key={idx} className="flex justify-end no-print">
                            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#18181B] text-white px-5 py-3.5 shadow-sm">
                              <p className="text-[11px] font-medium text-white/50 mb-1.5 m-0">You asked</p>
                              <p className="text-[14px] leading-relaxed whitespace-pre-wrap m-0">
                                {message.text}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={idx} className="w-full">
                          {isFirstAi && (
                            <p className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-4 m-0">
                              AI legal analysis
                            </p>
                          )}
                          {!isFirstAi && (
                            <p className="text-[11px] font-medium text-[#C4C4C4] mb-3 m-0">Follow-up</p>
                          )}

                          {message.loading && !message.text ? (
                            <div className="flex items-center gap-2.5 text-[#A1A1AA] py-2">
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                              <span className="text-[13px]">
                                {progressMessage || "Analyzing your query…"}
                              </span>
                            </div>
                          ) : (
                            <div className="analyze-report-prose">
                              {message.text
                                ? renderContentText(message.text)
                                : (
                                  <p className="text-[13px] text-[#A1A1AA] m-0">
                                    {progressMessage || "Starting analysis…"}
                                  </p>
                                )}
                              {message.streaming && (
                                <span className="analyze-stream-caret" aria-hidden />
                              )}
                            </div>
                          )}

                          {!message.loading && message.sources && message.sources.length > 0 && (
                            <div className="mt-6 pt-5 border-t border-[#F0F0F0]">
                              <p className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider mb-3 m-0">
                                Sources
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {message.sources.map((s, sIdx) => (
                                  <a
                                    key={sIdx}
                                    href={`https://example.com/grounding?q=${encodeURIComponent(s.title)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E4E4E7] bg-[#FAFAFA] text-[11px] font-medium text-[#52525B] hover:bg-white hover:border-[#D4D4D8] transition-colors no-underline"
                                  >
                                    <Globe className="w-3 h-3 text-[#A1A1AA] shrink-0" />
                                    <span>
                                      {s.title} ({s.citation})
                                    </span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-40" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {openQuestions.length > 0 && (
                  <div className="mt-8 no-print">
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

              {primaryReport && (
                <div className="px-8 py-4 border-t border-[#F0F0F0] bg-[#FAFAFA]/60 flex flex-wrap items-center gap-2 no-print">
                  {[
                    { icon: Copy, label: "Copy", onClick: onCopy },
                    { icon: Download, label: "Download", onClick: onDownload },
                    { icon: Printer, label: "Print", onClick: onPrint },
                  ].map(({ icon: Icon, label, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-medium text-[#52525B] border border-[#E4E4E7] bg-white hover:bg-[#FAFAFA] hover:border-[#D4D4D8] transition-colors cursor-pointer"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {label}
                    </button>
=======
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
          <div className="mx-auto space-y-7 print-container" style={{ maxWidth: 768 }}>
            {chatMessages.length === 0 && (
              <div className="flex items-center gap-3 py-1 text-[#98A2B3]">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#4F5BD9]"
                      style={{ animationDelay: `${i * 0.16}s`, animationDuration: "0.8s" }}
                    />
>>>>>>> origin/development
                  ))}
                </span>
                <span className="text-[13px]">Preparing analysis…</span>
              </div>
            )}

<<<<<<< HEAD
            {/* Follow-up composer */}
            <form
              onSubmit={onSendMessage}
              className="analyze-report-composer no-print"
            >
              <input
                type="text"
                placeholder={
                  isStreaming
                    ? "Analysis is still writing…"
                    : openQuestions.length > 0 && !askResolved
                    ? "Answer the questions above to continue…"
                    : "Ask a follow-up question about this analysis…"
                }
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                disabled={isStreaming || (openQuestions.length > 0 && !askResolved)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-[#18181B] placeholder:text-[#C4C4C4] px-2 py-1 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={
                  isStreaming ||
                  !chatInput.trim() ||
                  (openQuestions.length > 0 && !askResolved)
                }
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[#18181B] text-white hover:bg-[#262626] transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed border-none cursor-pointer"
                aria-label="Send follow-up"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
=======
            {chatMessages.map((message, idx) => {
              const isUser = message.sender === "user";
              const isFirstAi =
                !isUser && chatMessages.findIndex((m) => m.sender === "gemini") === idx;

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
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                        <Scale className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                          LORA
                        </p>
                        <p className="m-0 mt-0.5 text-[11px] text-[#98A2B3]">
                          {isFirstAi ? "Analysis" : "Follow-up"}
                        </p>
                      </div>
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

                  <div className="pl-[42px]">
                    {message.loading ? (
                      <div className="flex items-center gap-3 py-1">
                        <span className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#4F5BD9]"
                              style={{ animationDelay: `${i * 0.16}s`, animationDuration: "0.8s" }}
                            />
                          ))}
                        </span>
                        <span className="text-[13px] text-[#98A2B3]">Analyzing your query…</span>
                      </div>
                    ) : (
                      <div className="analyze-report-prose">{renderContentText(message.text)}</div>
                    )}

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
                </div>
              );
            })}
            <div ref={chatBottomRef} />
>>>>>>> origin/development
          </div>
        </div>

        <div className="analyze-composer-fade no-print shrink-0 px-6 pb-5 pt-8">
          <form onSubmit={onSendMessage} className="analyze-report-composer mx-auto" style={{ maxWidth: 768 }}>
            <input
              type="text"
              placeholder="Ask a follow-up…"
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent px-2 py-1 text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3]"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
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
