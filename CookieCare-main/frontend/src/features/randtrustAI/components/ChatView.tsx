// ─── ChatView ─────────────────────────────────────────────────────────────────
// Active conversation view — messages list + pinned composer.

import { useRef, useEffect } from "react";
import { Scale, RotateCcw, GitCompare } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import type { ComposerProps } from "./Composer";
import type { ChatMessage, QuickAction } from "../types";
import { CompareChatToolbar } from "../../analyze/compare/components/CompareChatToolbar";
import type { CompareHistoryEntry } from "../../analyze/compare/utils/compareHistory";

interface ChatViewProps {
  messages: ChatMessage[];
  composerProps: Omit<ComposerProps, "placeholder">;
  onReset: () => void;
  activeWorkflow: QuickAction | null;
  isCompareMode?: boolean;
  /** Compare sidebar tab — uses minimal toolbar instead of session bar */
  isCompareTab?: boolean;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onCloseHistory?: () => void;
  historyEntries?: CompareHistoryEntry[];
  activeHistoryId?: string | null;
  onSelectHistory?: (entry: CompareHistoryEntry) => void;
  onDeleteHistory?: (id: string) => void;
}

export function ChatView({
  messages,
  composerProps,
  onReset,
  activeWorkflow,
  isCompareMode = false,
  isCompareTab = false,
  historyOpen = false,
  onToggleHistory,
  onCloseHistory,
  historyEntries = [],
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
}: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {!isCompareTab && (
        <div
          className="flex items-center justify-between px-8 shrink-0"
          style={{
            height: 50,
            borderBottom: "1px solid #E4E4E7",
            background: "#FFFFFF",
          }}
        >
          <div className="flex items-center gap-2.5">
            <Scale className="w-3.5 h-3.5" style={{ color: "#D1D5DB" }} />
            <span className="text-[12.5px]" style={{ color: "#9CA3AF", fontWeight: 400 }}>
              {activeWorkflow ? activeWorkflow.label : "LORA AI"}
            </span>
            {activeWorkflow && (
              <span
                className="text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{
                  color: "#1A5BAD",
                  background: "#EBF2FD",
                  border: "1px solid rgba(33,117,217,0.20)",
                }}
              >
                Active
              </span>
            )}
            {isCompareMode && (
              <span
                className="flex items-center gap-1 text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{
                  color: "rgba(126,34,206,0.90)",
                  background: "rgba(168,85,247,0.08)",
                  border: "1px solid rgba(168,85,247,0.20)",
                }}
              >
                <GitCompare className="w-2.5 h-2.5" />
                Compare Mode
              </span>
            )}
          </div>

          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] transition-all duration-150"
            style={{ color: "#9CA3AF" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#374151";
              (e.currentTarget as HTMLElement).style.background = "#F3F4F6";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#9CA3AF";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            aria-label="New conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      )}

      {isCompareTab && onToggleHistory && onCloseHistory && onSelectHistory && onDeleteHistory && (
        <div className="absolute top-4 right-5 z-20">
          <CompareChatToolbar
            onNew={onReset}
            historyOpen={historyOpen}
            onToggleHistory={onToggleHistory}
            historyEntries={historyEntries}
            activeHistoryId={activeHistoryId}
            onSelectHistory={onSelectHistory}
            onDeleteHistory={onDeleteHistory}
            onCloseHistory={onCloseHistory}
          />
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto bg-[#FCFCFC]"
        style={{ padding: isCompareTab ? "3.5rem 1.5rem 2rem" : "1rem 1.5rem 2rem" }}
      >
        <div className="mx-auto space-y-8" style={{ maxWidth: 720 }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isCompareTab={isCompareTab} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-4 bg-white">
        <Composer
          {...composerProps}
          showAttachButton={!isCompareTab}
          placeholder={
            isCompareTab
              ? "Ask anything about the comparison…"
              : "Continue the conversation…"
          }
        />
      </div>
    </div>
  );
}
