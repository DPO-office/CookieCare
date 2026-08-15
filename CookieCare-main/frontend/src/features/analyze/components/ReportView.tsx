import React, { useRef, useEffect } from "react";
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
}: ReportViewProps) {
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const primaryReport = chatMessages.find((m) => m.sender === "gemini" && !m.loading);

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
            {chatMessages.length === 0 && (
              <div className="flex items-center gap-3 py-1 text-[#98A2B3]">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#4F5BD9]"
                      style={{ animationDelay: `${i * 0.16}s`, animationDuration: "0.8s" }}
                    />
                  ))}
                </span>
                <span className="text-[13px]">Preparing analysis…</span>
              </div>
            )}

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
