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
      {/* Streaming status bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white">
        <div className="relative w-5 h-5">
          <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
          <Sparkles className="w-3 h-3 text-gray-900 absolute inset-0 m-auto" />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {progress?.trim() || "Drafting your document…"}
        </span>
        <span className="ml-auto text-xs text-gray-400">Writing live · please wait</span>
      </div>

      {/* Live document */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-8 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-10 min-h-full">
          <div
            className="draft-streaming-content text-[15px] leading-relaxed text-gray-800"
            dangerouslySetInnerHTML={{
              __html: html || "<p style='color:#9ca3af'>Preparing your document…</p>",
            }}
          />
          {/* Blinking caret to signal live typing */}
          <span className="inline-block w-[2px] h-4 bg-gray-800 ml-0.5 align-text-bottom animate-pulse" />
        </div>
      </div>

      {/* Minimal typographic styling for the streamed markdown (no editor styles yet) */}
      <style>{`
        .draft-streaming-content h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.75rem; text-transform: uppercase; }
        .draft-streaming-content h2 { font-size: 1.15rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
        .draft-streaming-content h3 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.4rem; }
        .draft-streaming-content p { margin: 0 0 0.75rem; }
        .draft-streaming-content ul, .draft-streaming-content ol { margin: 0 0 0.75rem 1.25rem; }
        .draft-streaming-content li { margin: 0 0 0.25rem; }
        .draft-streaming-content strong { font-weight: 700; }
      `}</style>
    </div>
  );
}
