<<<<<<< HEAD
import { useRef, useEffect, useState } from "react";
import { Sparkles, MoreVertical } from "lucide-react";
=======
import { useRef, useEffect, ReactNode } from "react";
import { Sparkles } from "lucide-react";
>>>>>>> origin/development
import { DraftComposer } from "./DraftComposer";
import type { DraftChatMessage } from "../hooks/useDraftChat";
import type { DraftOpenQuestion } from "../api/draftingJobs";

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
  /** Called when user submits answers for an ASK card. */
  onAskSubmit?: (messageId: string, answers: Record<string, string>) => void;
}

function AskQuestionCard({
  messageId,
  content,
  questions,
  resolved,
  disabled,
  onSubmit,
}: {
  messageId: string;
  content: string;
  questions: DraftOpenQuestion[];
  resolved?: boolean;
  disabled?: boolean;
  onSubmit?: (messageId: string, answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.id] = "";
    return initial;
  });

  const allFilled = questions.every((q) => (answers[q.id] || "").trim().length > 0);

  return (
    <div className="flex items-start gap-2.5 max-w-[95%]">
      <div className="w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3.5 shadow-sm">
        <p className="text-[13.5px] text-[#3F3F46] leading-[1.65] mb-3">{content}</p>
        <div className="space-y-3.5">
          {questions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <label className="block text-[12.5px] font-medium text-[#52525B] leading-snug">
                {q.question}
                {q.severity === "critical" && (
                  <span className="ml-1 text-[#DC2626]">*</span>
                )}
              </label>
              {q.options && q.options.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={resolved || disabled}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                        }
                        className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                          selected
                            ? "border-[#3F3F46] bg-[#3F3F46] text-white"
                            : "border-[#E4E4E7] bg-[#FAFAFA] text-[#52525B] hover:border-[#A1A1AA]"
                        } disabled:opacity-60`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={answers[q.id] || ""}
                  disabled={resolved || disabled}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                  placeholder="Your answer"
                  className="w-full rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5 text-[13px] text-[#3F3F46] outline-none focus:border-[#A1A1AA] disabled:opacity-60"
                />
              )}
            </div>
          ))}
        </div>
        {!resolved && (
          <button
            type="button"
            disabled={disabled || !allFilled}
            onClick={() => onSubmit?.(messageId, answers)}
            className="mt-3.5 w-full rounded-lg bg-[#18181B] text-white text-[13px] font-medium py-2 disabled:opacity-40 hover:bg-[#27272A] transition-colors"
          >
            Continue drafting
          </button>
        )}
        {resolved && (
          <p className="mt-3 text-[12px] text-[#71717A] italic">Answers submitted.</p>
        )}
      </div>
    </div>
  );
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
  onAskSubmit,
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

<<<<<<< HEAD
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5 min-h-0 bg-[#FCFCFC]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[13px] text-[#A1A1AA] leading-relaxed max-w-[240px]">
              Your conversation will appear here as you draft and refine your agreement.
            </p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="draft-chat-user-bubble max-w-[90%] px-4 py-3 text-[13.5px] leading-[1.65]">
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.kind === "ask" && msg.questions?.length) {
            return (
              <AskQuestionCard
                key={msg.id}
                messageId={msg.id}
                content={msg.content}
                questions={msg.questions}
                resolved={msg.askResolved}
                disabled={isLoading}
                onSubmit={onAskSubmit}
              />
            );
          }

          if (msg.kind === "example") {
            return (
              <div key={msg.id} className="space-y-2.5">
                <p className="text-[13.5px] text-[#3F3F46] leading-[1.65] whitespace-pre-wrap">
                  {msg.content.split("\n\n")[0]}
                </p>
                {msg.content.includes("\n\n") && (
                  <div className="draft-chat-example px-4 py-3 text-[13px] text-[#52525B] leading-[1.65]">
                    {msg.content.split("\n\n").slice(1).join("\n\n")}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex items-start gap-2.5 max-w-[95%]">
              {msg.kind === "progress" && (
                <Sparkles className="w-4 h-4 text-[#A1A1AA] shrink-0 mt-0.5" />
              )}
              <p
                className={`text-[13.5px] leading-[1.65] whitespace-pre-wrap ${
                  msg.kind === "progress" ? "text-[#71717A] italic" : "text-[#3F3F46]"
                }`}
              >
                {msg.content}
=======
      <div className="draft-chat-stage relative min-h-0 flex-1">
        <div className="scrollbar-hide h-full space-y-3.5 overflow-y-auto px-4 pb-28 pt-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#4F5BD9] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <p className="m-0 max-w-[220px] text-[13px] leading-relaxed text-[#667085]">
                Ask a follow-up about this draft — tighten a clause, change tone, or add a section.
>>>>>>> origin/development
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
