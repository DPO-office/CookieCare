import React, { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

interface StreamingDraftPreviewProps {
  /** Live HTML of the document as it is being generated (already markdown -> HTML). */
  html: string;
  /** Latest progress message from the SSE stream. */
  progress?: string;
}

/**
 * Read-only live preview shown WHILE the document is being generated.
 *
 * We deliberately render the streamed HTML with a lightweight `dangerouslySetInnerHTML`
 * container instead of mounting the full TipTap editor: re-initializing a rich editor on
 * every token would be janky and expensive. The real editor takes over once generation
 * completes and the authoritative document is saved.
 */
export default function StreamingDraftPreview({ html, progress }: StreamingDraftPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest text in view as the document grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [html]);

  return (
    <div className="flex-1 bg-[#F2F4F7] flex flex-col overflow-hidden">

      {/* Streaming status bar - full width, like the editor header it becomes */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="relative w-5 h-5">
          <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
          <Sparkles className="w-3 h-3 text-gray-900 absolute inset-0 m-auto" />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {progress?.trim() || "Drafting your document…"}
        </span>
        <span className="ml-auto text-xs text-gray-400">Writing live · please wait</span>
      </div>

      {/* Live document - same centered sheet the editor uses, so the draft does
          not change width when streaming finishes. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-8 px-6 sm:px-10">
        <div className="w-full max-w-5xl mx-auto bg-white border border-gray-200 rounded-[18px] shadow-xs px-10 py-10">
          <div
            className="draft-streaming-content"
            dangerouslySetInnerHTML={{
              __html: html || "<p style='color:#9ca3af'>Preparing your document…</p>",
            }}
          />
          {/* Blinking caret to signal live typing */}
          <span className="inline-block w-[2px] h-4 bg-gray-800 ml-0.5 align-text-bottom animate-pulse" />
        </div>
      </div>
    </div>
  );
}
