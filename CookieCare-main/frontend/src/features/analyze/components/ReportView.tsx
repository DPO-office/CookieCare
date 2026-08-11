import React, { useRef, useEffect } from "react";
import {
  ArrowLeft,
  Sparkles,
  Globe,
  ExternalLink,
  Loader2,
  Copy,
  Download,
  Printer,
  Send,
  Check,
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
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFA]">
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-[#F0F0F0] px-6 py-4 no-print">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="group flex items-center gap-2.5 text-left border-none bg-transparent cursor-pointer p-0 min-w-0"
            >
              <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F4F4F5] text-[#71717A] group-hover:bg-[#EBEBEB] group-hover:text-[#18181B] transition-colors shrink-0">
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#18181B] truncate m-0 leading-snug">
                  {activeReportDocName}
                </p>
                <p className="text-[12px] text-[#A1A1AA] m-0 mt-0.5">Legal analysis report</p>
              </div>
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-[#C4C4C4] shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">RandTrust AI</span>
            </div>
          </div>
        </header>

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
                {chatMessages.length === 0 ? (
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

                          {message.loading ? (
                            <div className="flex items-center gap-2.5 text-[#A1A1AA] py-2">
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                              <span className="text-[13px]">Analyzing your query…</span>
                            </div>
                          ) : (
                            <div className="analyze-report-prose">
                              {renderContentText(message.text)}
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
                  ))}
                </div>
              )}
            </article>

            {/* Follow-up composer */}
            <form
              onSubmit={onSendMessage}
              className="analyze-report-composer no-print"
            >
              <input
                type="text"
                placeholder="Ask a follow-up question about this analysis…"
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-[#18181B] placeholder:text-[#C4C4C4] px-2 py-1"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[#18181B] text-white hover:bg-[#262626] transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed border-none cursor-pointer"
                aria-label="Send follow-up"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {showCopyToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#18181B] text-white text-[13px] font-medium px-4 py-2.5 rounded-full shadow-lg select-none">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            Copied to clipboard
          </div>
        )}
      </div>
    </>
  );
}
