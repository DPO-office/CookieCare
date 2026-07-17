import React, { useRef, useEffect } from "react";
import { ArrowLeft, Sparkles, Globe, ExternalLink, Loader2, Copy, Download, Printer, Send, Check, HelpCircle } from "lucide-react";
import { Message } from "../types";
import { renderContentText } from "../utils";

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header bar */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 no-print">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 cursor-pointer bg-transparent border-0 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>{activeReportDocName}</span>
          <span className="text-gray-300 mx-1">·</span>
          <span className="text-gray-400">Analysis</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-gray-400">AI Active</span>
          </div>
          <HelpCircle className="w-3.5 h-3.5 text-gray-300 hover:text-gray-600 cursor-pointer transition-colors" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="w-full space-y-4">
          {/* Report card */}
          <div className="bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden print-container">
            <div className="px-7 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Legal Assessment</p>
                <p className="text-[11px] text-gray-300 mt-0.5">Confidential · AI Generated</p>
              </div>
              <Sparkles className="w-4 h-4 text-gray-300" />
            </div>

            <div className="px-7 py-6 space-y-5">
              {chatMessages.map((message, idx) => {
                const isUser = message.sender === "user";
                return (
                  <div key={idx} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`rounded-2xl text-[13px] leading-relaxed ${
                        isUser
                          ? "bg-gray-900 text-white px-5 py-3.5 max-w-sm shadow-sm"
                          : "w-full bg-gray-50/60 border border-gray-100 px-5 py-4"
                      }`}
                    >
                      <div className={`flex items-center gap-2 mb-2.5 ${isUser ? "justify-end" : "justify-between"}`}>
                        <span className="text-[11px] font-medium text-gray-400">
                          {isUser ? "You" : "AI Legal Analysis"}
                        </span>
                      </div>

                      {message.loading ? (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span className="text-[12px]">Analyzing your query...</span>
                        </div>
                      ) : (
                        <div>
                          {isUser ? (
                            <p className="whitespace-pre-wrap leading-relaxed text-[13px]">{message.text}</p>
                          ) : (
                            renderContentText(message.text)
                          )}
                        </div>
                      )}

                      {!isUser && message.sources && message.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-[11px] font-medium text-gray-400 mb-2">Sources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {message.sources.map((s, sIdx) => (
                              <a
                                key={sIdx}
                                href={`https://example.com/grounding?q=${encodeURIComponent(s.title)}`}
                                target="_blank"
                                referrerPolicy="no-referrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-all rounded-lg"
                              >
                                <Globe className="w-3 h-3 text-emerald-500 shrink-0" />
                                <span>{s.title} ({s.citation})</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Actions */}
            <div className="px-7 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2 no-print">
              {[
                { icon: Copy, label: "Copy", onClick: onCopy },
                { icon: Download, label: "Download", onClick: onDownload },
                { icon: Printer, label: "Print", onClick: onPrint },
              ].map(({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Follow-up chat */}
          <form
            onSubmit={onSendMessage}
            className="bg-white border border-gray-200/80 rounded-2xl shadow-sm p-2 flex items-center gap-2 no-print"
          >
            <input
              type="text"
              placeholder="Ask a follow-up question..."
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              className="flex-1 text-[13px] text-gray-700 bg-transparent px-3 py-2 focus:outline-none placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0 disabled:opacity-30"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {showCopyToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-[12px] font-medium px-4 py-2.5 rounded-xl shadow-lg select-none flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Copied to clipboard</span>
        </div>
      )}
    </div>
  );
}
