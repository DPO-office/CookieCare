/**
 * AIResponseBlock — AI response in a Gemini/ChatGPT-style thread.
 * Prose sits on the canvas; no nested white card.
 */
import React from "react";
import { motion } from "motion/react";
import { Scale, Copy, Check } from "lucide-react";

interface AIResponseBlockProps {
  htmlContent: string;
  isStreaming: boolean;
  statusMessage?: string;
  label?: string;
  subLabel?: string;
  isCopied?: boolean;
  onCopy?: () => void;
  className?: string;
}

export function AIResponseBlock({
  htmlContent,
  isStreaming,
  statusMessage,
  label = "AI Response",
  subLabel,
  isCopied = false,
  onCopy,
  className,
}: AIResponseBlockProps) {
  const showTyping = isStreaming && !htmlContent;
  const showContent = !!htmlContent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]"
            aria-hidden="true"
          >
            <Scale className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a] leading-tight">
              {label}
            </p>
            {subLabel && (
              <p className="m-0 mt-0.5 max-w-[320px] truncate text-[11px] leading-tight text-[#98A2B3]">
                {subLabel}
              </p>
            )}
          </div>
        </div>

        {showContent && onCopy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={isCopied ? "Copied" : "Copy response"}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-2.5 text-[11px] font-medium text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
          >
            {isCopied ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="pl-[42px]" aria-live="polite" aria-busy={isStreaming}>
        {showTyping && (
          <div className="flex items-center gap-3 py-1">
            <div className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#4F5BD9]"
                  style={{
                    animationDelay: `${i * 0.16}s`,
                    animationDuration: "0.8s",
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
            <span className="text-[13px] text-[#98A2B3]">
              {statusMessage || "Researching…"}
            </span>
          </div>
        )}

        {showContent && (
          <div
            className={`ask-lawyer-prose md-content select-text${isStreaming ? " streaming-cursor" : ""}`}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}

        {!showTyping && !showContent && (
          <p className="m-0 text-[13px] text-[#98A2B3]">Waiting for response…</p>
        )}
      </div>
    </motion.div>
  );
}

export default AIResponseBlock;
