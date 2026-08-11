// ─── MessageBubble ────────────────────────────────────────────────────────────
// Renders a single chat message — user (right-aligned text) or assistant
// (markdown HTML with streaming cursor and copy button).
// When a message carries compareResult, the CompareResultCards are rendered
// below the markdown content for interactive exploration.

import { useState } from "react";
import { FileText, Copy, Check } from "lucide-react";
import { markdownToHtml } from "../../../shared/utils/markdownToHtml";
import { useLoadingStage } from "../hooks/useLoadingStage";
import { LOADING_STAGES } from "../constants";
import type { ChatMessage } from "../types";
import { CompareResultCards } from "../../analyze/compare/components/CompareResultCards";

interface MessageBubbleProps {
  message: ChatMessage;
  isCompareTab?: boolean;
}

function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*/g, "");
}

export function MessageBubble({ message, isCompareTab = false }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const streaming = !!message.isStreaming;
  const loadingStage = useLoadingStage(streaming && !message.content);
  const displayContent = stripMarkdownBold(message.content);
  const isCompareIntent =
    isUser && displayContent.toLowerCase().startsWith("compare agreements:");

  const htmlContent = !isUser ? markdownToHtml(message.content) : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  return (
    <div
      className={[
        "rt-msg-in flex flex-col min-w-0 w-full",
        isUser
          ? isCompareTab && isCompareIntent
            ? "items-center"
            : "items-end"
          : "items-start",
      ].join(" ")}
    >
      {/* Attached files */}
      {message.files && message.files.length > 0 && !(isCompareTab && isCompareIntent) && (
        <div
          className={[
            "flex flex-wrap gap-2 mb-2.5",
            isUser ? "justify-end" : "justify-start",
          ].join(" ")}
        >
          {message.files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: "#F3F4F6",
                border: "1px solid #E4E4E7",
              }}
            >
              <FileText
                className="w-3 h-3 shrink-0"
                style={{ color: "#9CA3AF" }}
              />
              <span
                className="text-[11.5px] font-medium"
                style={{ color: "#374151" }}
              >
                {f.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Message content */}
      {isUser ? (
        isCompareTab && isCompareIntent ? (
          <p className="text-[13px] leading-relaxed text-center text-[#52525B] max-w-full">
            {displayContent}
          </p>
        ) : (
          <p
            className="text-[14px] leading-[1.65] text-right max-w-[75%]"
            style={{ color: "#111827", fontWeight: 450 }}
          >
            {displayContent}
          </p>
        )
      ) : (
        <div className="group w-full">
          {streaming && !message.content ? (
            <div className="flex items-center gap-2 py-1">
              <span className="text-[13px] rt-loading-text font-medium">
                {LOADING_STAGES[loadingStage]}
              </span>
            </div>
          ) : streaming && message.content ? (
            /* Compare progress: show the current stage label from the SSE stream */
            <div className="flex items-center gap-2 py-1">
              <span className="text-[13px] rt-loading-text font-medium">
                {message.content}
              </span>
            </div>
          ) : (
            <>
              <div
                className={["rt-response text-[14px]", streaming ? "rt-cursor" : ""].join(" ")}
                dangerouslySetInnerHTML={{ __html: htmlContent ?? "" }}
              />

              {/* Interactive compare result tabs — only on compare messages */}
              {!streaming && message.compareResult && (
                <CompareResultCards result={message.compareResult} />
              )}

              {!streaming && message.content && (
                <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] transition-all"
                    style={{
                      color: copied ? "#059669" : "#9CA3AF",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "#F3F4F6")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
