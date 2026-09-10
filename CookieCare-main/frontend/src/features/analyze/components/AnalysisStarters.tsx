import { useState } from "react";
import { BookOpen } from "lucide-react";
import PromptLibraryModal from "./PromptLibraryModal";
import QuestionLibraryModal from "./QuestionLibraryModal";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";

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

  return (
    <>
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => setPromptOpen(true)}
          className="analyze-link"
        >
          <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
          Browse prompts
        </button>
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
