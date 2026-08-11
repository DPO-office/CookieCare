/**
 * AIResponseBlock — AI response container for legal advice output.
 * Premium black/zinc styling aligned with Analyze, Draft, Negotiate.
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "#F4F4F5" }}
            aria-hidden="true"
          >
            <Scale className="w-3.5 h-3.5" style={{ color: "#18181B" }} strokeWidth={1.75} />
          </div>

          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-[#18181B] leading-tight">{label}</p>
            {subLabel && (
              <p className="m-0 mt-0.5 text-[11px] text-[#A1A1AA] truncate max-w-[280px] leading-tight">
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
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium transition-colors cursor-pointer border shrink-0"
            style={{
              background: isCopied ? "#18181B" : "#FFFFFF",
              borderColor: isCopied ? "#18181B" : "#E4E4E7",
              color: isCopied ? "#FFFFFF" : "#52525B",
            }}
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>

      <div
        className="overflow-hidden"
        style={{
          background: "#FFFFFF",
          border: "1px solid #EBEBEB",
          borderRadius: 22,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
        }}
        aria-live="polite"
        aria-busy={isStreaming}
      >
        {showTyping && (
          <div className="px-6 py-6 flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce inline-block"
                  style={{
                    background: "#18181B",
                    opacity: 0.35,
                    animationDelay: `${i * 0.16}s`,
                    animationDuration: "0.8s",
                  }}
                />
              ))}
            </div>
            <span className="text-[13px] text-[#A1A1AA]">
              {statusMessage || "Researching…"}
            </span>
          </div>
        )}

        {showContent && (
          <div
            className={`md-content px-7 py-6 select-text${isStreaming ? " streaming-cursor" : ""}`}
            style={{
              fontSize: "15px",
              lineHeight: 1.75,
              color: "#3F3F46",
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}

        {!showTyping && !showContent && (
          <div className="px-7 py-10 text-center">
            <p className="m-0 text-[13px] text-[#A1A1AA]">Waiting for response…</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default AIResponseBlock;
