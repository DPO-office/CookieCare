import { useRef, useEffect } from "react";
import { Sparkles, MoreVertical } from "lucide-react";
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
