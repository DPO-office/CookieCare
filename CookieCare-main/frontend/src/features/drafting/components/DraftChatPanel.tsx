import { useRef, useEffect, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { DraftComposer } from "./DraftComposer";
import type { DraftChatMessage } from "../hooks/useDraftChat";

interface DraftChatPanelProps {
  title: string;
  messages: DraftChatMessage[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  attachedFileName?: string;
  isLoading?: boolean;
  isParsing?: boolean;
  isDragging: boolean;
  composerPlaceholder?: string;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

function FollowUpCard({
  author,
  isAi,
  isProgress,
  children,
}: {
  author: string;
  isAi?: boolean;
  isProgress?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={`draft-followup-card${isAi ? " is-ai" : ""}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            isAi ? "bg-[#EEF2FF] text-[#4F5BD9]" : "bg-[#0F172A] text-white"
          }`}
        >
          {isAi ? <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> : author.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
            {author}
          </p>
          {isProgress && (
            <p className="m-0 mt-0.5 text-[11px] text-[#98A2B3]">Working…</p>
          )}
        </div>
      </div>
      <div
        className={`text-[13px] leading-[1.65] whitespace-pre-wrap ${
          isProgress ? "text-[#667085]" : "text-[#1a1a1a]"
        }`}
      >
        {children}
      </div>
    </article>
  );
}

export default function DraftChatPanel({
  title,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  onFileSelect,
  onRemoveFile,
  attachedFileName,
  isLoading = false,
  isParsing = false,
  isDragging,
  composerPlaceholder = "Ask a follow-up…",
  onDragOver,
  onDragLeave,
  onDrop,
}: DraftChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const visibleCount = messages.filter((m) => m.kind !== "progress").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden font-sans">
      <header className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
            Ask AI
          </p>
          <p className="m-0 mt-0.5 truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            Follow-ups
          </p>
        </div>
        <span className="score-badge shrink-0 bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
          {visibleCount}
        </span>
      </header>

      <div className="draft-chat-stage relative min-h-0 flex-1">
        <div className="scrollbar-hide h-full space-y-3.5 overflow-y-auto px-4 pb-28 pt-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#4F5BD9] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <p className="m-0 max-w-[220px] text-[13px] leading-relaxed text-[#667085]">
                Ask a follow-up about this draft — tighten a clause, change tone, or add a section.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <FollowUpCard key={msg.id} author="You">
                  {msg.content}
                </FollowUpCard>
              );
            }

            if (msg.kind === "example") {
              return (
                <FollowUpCard key={msg.id} author="LORA" isAi>
                  {msg.content}
                </FollowUpCard>
              );
            }

            return (
              <FollowUpCard
                key={msg.id}
                author="LORA"
                isAi
                isProgress={msg.kind === "progress"}
              >
                {msg.content}
              </FollowUpCard>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#FAFBFD] via-[#FAFBFD]/90 to-transparent px-4 pb-4 pt-8">
          <div className="pointer-events-auto">
            <DraftComposer
              variant="chat"
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onSubmit}
              onFileSelect={onFileSelect}
              onRemoveFile={onRemoveFile}
              attachedFileName={attachedFileName}
              isLoading={isLoading}
              isParsing={isParsing}
              isDragging={isDragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              placeholder={composerPlaceholder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
