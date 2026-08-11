import { useRef, useEffect, useState } from "react";
import { Sparkles, MoreVertical } from "lucide-react";
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
  composerPlaceholder = "Ask anything.",
  onDragOver,
  onDragLeave,
  onDrop,
  onAskSubmit,
}: DraftChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white overflow-hidden">
      <header className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-5 h-[52px] border-b border-[#EBEBEB] bg-white">
        <div />
        <p
          className="text-[12.5px] font-medium text-[#3F3F46] truncate text-center tracking-[-0.01em] max-w-[220px]"
          title={title}
        >
          {title}
        </p>
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors justify-self-end"
          aria-label="More options"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </header>

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
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-6 pb-6 pt-4 bg-white">
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
  );
}
