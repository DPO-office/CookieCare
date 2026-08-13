import { useState } from "react";
import {
  Shield,
  FileSearch,
  Scale,
  AlertTriangle,
  BookOpen,
  MessageSquareText,
} from "lucide-react";
import { DEFAULT_PROMPT_CATEGORIES, DEFAULT_QUESTION_CATEGORIES } from "../constants";
import PromptLibraryModal from "./PromptLibraryModal";
import QuestionLibraryModal from "./QuestionLibraryModal";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";

interface MixedSuggestion {
  title: string;
  text: string;
  icon: React.ElementType;
  libraryId?: string;
}

const SUGGESTION_ICONS = [Shield, FileSearch, Scale, AlertTriangle, BookOpen, MessageSquareText];

function getCuratedSuggestions(): MixedSuggestion[] {
  const fromPrompts = DEFAULT_PROMPT_CATEGORIES.slice(0, 2).flatMap((cat) => {
    const p = cat.prompts[0];
    if (!p) return [];
    return [{ title: p.title, text: p.prompt, libraryId: cat.id }];
  });

  const fromQuestions = DEFAULT_QUESTION_CATEGORIES.slice(0, 2).flatMap((cat) => {
    const q = cat.questions[0];
    if (!q) return [];
    return [{ title: q.title, text: q.question, libraryId: cat.id }];
  });

  return [...fromPrompts, ...fromQuestions].slice(0, 4).map((item, i) => ({
    ...item,
    icon: SUGGESTION_ICONS[i % SUGGESTION_ICONS.length],
  }));
}

function QuickChip({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] text-[#71717A] bg-[#FAFAFA] border border-[#EBEBEB] hover:border-[#D4D4D8] hover:text-[#3F3F46] hover:bg-white transition-colors whitespace-nowrap"
      title={label}
    >
      <Icon className="w-3 h-3 shrink-0 text-[#A1A1AA]" />
      <span>{label}</span>
    </button>
  );
}

interface AnalysisStartersProps {
  promptLibrary: PromptLibraryItem[];
  questionsLibrary: string[];
  onApply: (text: string, promptLibraryId?: string) => void;
  promptModalOpen?: boolean;
  questionModalOpen?: boolean;
  onPromptModalOpenChange?: (open: boolean) => void;
  onQuestionModalOpenChange?: (open: boolean) => void;
}

export function AnalysisStarters({
  promptLibrary,
  questionsLibrary,
  onApply,
  promptModalOpen: controlledPromptOpen,
  questionModalOpen: controlledQuestionOpen,
  onPromptModalOpenChange,
  onQuestionModalOpenChange,
}: AnalysisStartersProps) {
  const [internalPromptOpen, setInternalPromptOpen] = useState(false);
  const [internalQuestionOpen, setInternalQuestionOpen] = useState(false);

  const promptModalOpen = controlledPromptOpen ?? internalPromptOpen;
  const questionModalOpen = controlledQuestionOpen ?? internalQuestionOpen;

  const setPromptOpen = (open: boolean) => {
    onPromptModalOpenChange?.(open);
    if (controlledPromptOpen === undefined) setInternalPromptOpen(open);
  };

  const setQuestionOpen = (open: boolean) => {
    onQuestionModalOpenChange?.(open);
    if (controlledQuestionOpen === undefined) setInternalQuestionOpen(open);
  };

  const suggestions = getCuratedSuggestions();

  return (
    <>
      <div className="flex flex-col items-center w-full">
        <div className="flex flex-wrap items-center justify-center gap-2 w-full">
          {suggestions.map((item) => (
            <QuickChip
              key={item.title}
              label={item.title}
              icon={item.icon}
              onClick={() => onApply(item.text, item.libraryId)}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="text-[12px] text-[#C4C4C4] hover:text-[#52525B] transition-colors bg-transparent border-none cursor-pointer"
          >
            Browse prompts
          </button>
          <button
            type="button"
            onClick={() => setQuestionOpen(true)}
            className="text-[12px] text-[#C4C4C4] hover:text-[#52525B] transition-colors bg-transparent border-none cursor-pointer"
          >
            Browse questions
          </button>
        </div>
      </div>

      {promptModalOpen && (
        <PromptLibraryModal
          promptLibrary={promptLibrary}
          onApply={(text, libraryId) => {
            onApply(text, libraryId);
            setPromptOpen(false);
          }}
          onClose={() => setPromptOpen(false)}
        />
      )}

      {questionModalOpen && (
        <QuestionLibraryModal
          questionsLibrary={questionsLibrary}
          onApply={(text, libraryId) => {
            onApply(text, libraryId);
            setQuestionOpen(false);
          }}
          onClose={() => setQuestionOpen(false)}
        />
      )}
    </>
  );
}
