import React, { useState } from "react";
import { BookOpen, HelpCircle, ChevronRight } from "lucide-react";
import { StepBadge } from "../../../shared/components/StepBadge";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";
import PromptLibraryModal from "./PromptLibraryModal";
import QuestionLibraryModal from "./QuestionLibraryModal";

interface PromptPanelProps {
  customPromptText: string;
  promptLibrary: PromptLibraryItem[];
  questionsLibrary: string[];
  onSetCustomPromptText: (text: string) => void;
  // kept for API compatibility — no longer used internally
  promptTab?: unknown;
  onSetPromptTab?: (tab: unknown) => void;
}

export default function PromptPanel({
  customPromptText,
  promptLibrary,
  questionsLibrary,
  onSetCustomPromptText,
}: PromptPanelProps) {
  const [promptModalOpen,   setPromptModalOpen]   = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  const handleApplyPrompt = (text: string) => {
    onSetCustomPromptText(text);
    setPromptModalOpen(false);
  };

  const handleApplyQuestion = (text: string) => {
    onSetCustomPromptText(text);
    setQuestionModalOpen(false);
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">

        {/* Section heading */}
        <div className="mb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <StepBadge>2</StepBadge>
            <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Write your prompt</h3>
          </div>
          <p className="text-xs text-gray-400 ml-[26px] leading-relaxed">
            Describe what you want the AI to analyze, or browse the libraries below.
          </p>
        </div>

        {/* Textarea — always visible */}
        <textarea
          rows={5}
          value={customPromptText}
          onChange={(e) => onSetCustomPromptText(e.target.value)}
          placeholder="Describe what you want the AI to analyze, or open the Prompt Library to apply a pre-built query…"
          className="w-full text-[13px] text-gray-700 border border-gray-200 bg-gray-50/50 p-4 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-xl placeholder:text-gray-400 resize-none leading-relaxed transition-shadow"
        />

        {/* Library shortcut buttons */}
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => setPromptModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 transition-all"
          >
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            Browse prompt library
            <ChevronRight className="w-3 h-3 text-gray-300" />
          </button>

          <button
            onClick={() => setQuestionModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
            Browse question library
            <ChevronRight className="w-3 h-3 text-gray-300" />
          </button>
        </div>

      </div>

      {/* Modals */}
      {promptModalOpen && (
        <PromptLibraryModal
          promptLibrary={promptLibrary}
          onApply={handleApplyPrompt}
          onClose={() => setPromptModalOpen(false)}
        />
      )}

      {questionModalOpen && (
        <QuestionLibraryModal
          questionsLibrary={questionsLibrary}
          onApply={handleApplyQuestion}
          onClose={() => setQuestionModalOpen(false)}
        />
      )}
    </>
  );
}
