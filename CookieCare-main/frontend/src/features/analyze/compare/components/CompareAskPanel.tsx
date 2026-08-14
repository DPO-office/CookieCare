import { useState } from "react";
import { Loader2 } from "lucide-react";
import { markdownToHtml } from "../../../../shared/utils/markdownToHtml";

export interface CompareNote {
  question: string;
  answer?: string;
}

interface CompareAskPanelProps {
  notes: CompareNote[];
  pendingQuestion?: string | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function CompareAskPanel({
  notes,
  pendingQuestion,
  value,
  onChange,
  onSubmit,
  isLoading,
}: CompareAskPanelProps) {
  const [open, setOpen] = useState(notes.length > 0);
  const canSend = value.trim().length > 0 && !isLoading;

  return (
    <section
      className="mt-8 overflow-hidden rounded-2xl bg-white"
      style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-[#1a1a1a]">
            Clarify a finding
          </h3>
          <p className="mt-0.5 text-[13px] text-dark-200">
            Ask a specific question about this report. Answers appear as notes, not a chat thread.
          </p>
        </div>
        <span className="score-badge shrink-0 bg-light-blue-100 text-[11px] font-medium text-dark-200">
          {open ? "Hide" : "Open"}
        </span>
      </button>

      {open && (
        <div className="border-t border-light-blue-200 px-5 py-5 sm:px-6">
          {(notes.length > 0 || pendingQuestion) && (
            <div className="mb-5 space-y-3">
              {notes.map((note, i) => (
                <article key={`${note.question}-${i}`} className="rounded-2xl bg-[#F7F8FB] px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">
                    Question
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-[#1a1a1a]">{note.question}</p>
                  {note.answer && (
                    <div
                      className="rt-response mt-3 border-t border-white/80 pt-3 text-[13px] leading-relaxed text-dark-200"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(note.answer) }}
                    />
                  )}
                </article>
              ))}
              {pendingQuestion && (
                <article className="rounded-2xl bg-[#F7F8FB] px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">
                    Question
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-[#1a1a1a]">{pendingQuestion}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-dark-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Preparing a note…
                  </p>
                </article>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-[#F7F8FB] px-4 py-2 focus-within:border-[#C7D2FE] focus-within:bg-white">
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSend) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="e.g. How does liability differ in clause 8?"
              disabled={isLoading}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3]"
              aria-label="Ask a question about this comparison"
            />
            <button
              type="button"
              disabled={!canSend}
              onClick={onSubmit}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full bg-[#111827] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add note
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
