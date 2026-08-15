/**
 * QuestionLibraryModal — mirrors PromptLibraryModal layout.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, MousePointerClick, Check } from "lucide-react";
import { QuestionCategory, DEFAULT_QUESTION_CATEGORIES } from "../constants";
import { ANALYZE_STYLES } from "../styles/analyzeStyles";
import { LibraryModalColumns, libraryModalShellProps, LibraryModalOverlay } from "./LibraryModalColumns";

interface QuestionLibraryModalProps {
  questionsLibrary: string[];
<<<<<<< HEAD
  onApply: (questionText: string, categoryId?: string) => void;
=======
  onApply: (questionTexts: string[]) => void;
>>>>>>> origin/development
  onClose: () => void;
}

function buildCategories(_apiQuestions: string[]): QuestionCategory[] {
  return DEFAULT_QUESTION_CATEGORIES.map((cat) => ({
    ...cat,
    questions: [...cat.questions],
  }));
}

function normalise(s: string) {
  return s.toLowerCase().trim();
}

interface CategoryRailProps {
  categories: QuestionCategory[];
  activeCategoryId: string;
  onSelect: (id: string) => void;
  matchCounts: Record<string, number>;
}

function CategoryRail({ categories, activeCategoryId, onSelect, matchCounts }: CategoryRailProps) {
  return (
    <nav aria-label="Question categories" className="flex flex-col gap-1">
      {categories.map((cat) => {
        const count = matchCounts[cat.id] ?? 0;
        const isActive = cat.id === activeCategoryId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={`lib-modal-cat-btn ${isActive ? "is-active" : ""}`}
          >
            <span className="lib-modal-cat-label">{cat.label}</span>
            {count > 0 && (
              <span
                className={`score-badge shrink-0 text-[10px] font-semibold tabular-nums ${
                  isActive ? "bg-white/15 text-white" : "bg-[#EEF2FF] text-[#4F5BD9]"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

interface QuestionListProps {
  questions: Array<{ title: string; question: string }>;
  categoryId: string;
  selectedKeys: Set<string>;
  previewKey: string | null;
  searchQuery: string;
  onToggle: (key: string, item: { title: string; question: string }) => void;
}

function itemKey(categoryId: string, title: string, question: string) {
  return `${categoryId}::${title || question.slice(0, 48)}`;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-[#FEF3C7] text-[#92400E] rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function QuestionList({
  questions,
  categoryId,
  selectedKeys,
  previewKey,
  searchQuery,
  onToggle,
}: QuestionListProps) {
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF]">
          <Search className="h-4 w-4 text-[#4F5BD9]" />
        </div>
        <p className="text-[13px] font-medium text-[#1a1a1a]">No questions found</p>
        <p className="mt-1.5 text-[12px] text-dark-200">
          {searchQuery ? "Try a different search term." : "Questions will appear here once added."}
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 list-none p-0" role="listbox" aria-multiselectable="true">
      {questions.map((item) => {
        const key = itemKey(categoryId, item.title, item.question);
        const isSelected = selectedKeys.has(key);
        const isPreview = previewKey === key;
        return (
          <li
            key={key}
            role="option"
            aria-selected={isSelected}
            onClick={() => onToggle(key, item)}
            className={`lib-modal-list-item ${isPreview || isSelected ? "is-selected" : ""}`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] ${
                  isSelected ? "border-[#111827] bg-[#111827]" : "border-[#D0D5DD] bg-white"
                }`}
              >
                {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`lib-modal-list-title${isSelected ? "" : " text-[#3F3F46]"}`}>
                  {highlight(item.title || item.question, searchQuery)}
                </p>
                {item.title && (
                  <p className="lib-modal-list-desc">{highlight(item.question, searchQuery)}</p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface PreviewPaneProps {
  question: { title: string; question: string } | null;
}

function PreviewPane({ question }: PreviewPaneProps) {
  if (!question) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-10 py-16">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#EEF2FF]">
          <MousePointerClick className="h-5 w-5 text-[#4F5BD9]" />
        </div>
        <p className="text-[13px] font-medium text-[#1a1a1a]">Select questions to preview</p>
        <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-dark-200">
          Click one or more questions in the list. You can apply several at once.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b border-[rgba(16,24,40,0.06)] px-6 pb-4 pt-6">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
          Preview
        </p>
        {question.title && (
          <h4 className="m-0 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-[#1a1a1a]">
            {question.title}
          </h4>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
        <p className="lib-modal-preview-text m-0">{question.question}</p>
      </div>
    </div>
  );
}

export default function QuestionLibraryModal({
  questionsLibrary,
  onApply,
  onClose,
}: QuestionLibraryModalProps) {
  const categories = useMemo(() => buildCategories(questionsLibrary), [questionsLibrary]);

  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [selectedItems, setSelectedItems] = useState<
    Record<string, { title: string; question: string }>
  >({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectedKeys = useMemo(() => new Set(Object.keys(selectedItems)), [selectedItems]);
  const selectedList = useMemo(() => Object.values(selectedItems), [selectedItems]);
  const selectedQuestion =
    (previewKey && selectedItems[previewKey]) || selectedList[selectedList.length - 1] || null;

  const handleToggle = useCallback(
    (key: string, item: { title: string; question: string }) => {
      setSelectedItems((prev) => {
        const next = { ...prev };
        if (next[key]) delete next[key];
        else next[key] = item;
        return next;
      });
      setPreviewKey(key);
    },
    []
  );

  const filteredQuestions = useMemo(() => {
    const q = normalise(searchQuery);
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (!cat) return [];
    if (!q) return cat.questions;
    return cat.questions.filter(
      (item) =>
        normalise(item.question).includes(q) ||
        normalise(item.title ?? "").includes(q)
    );
  }, [categories, activeCategoryId, searchQuery]);

  const matchCounts = useMemo<Record<string, number>>(() => {
    const q = normalise(searchQuery);
    return Object.fromEntries(
      categories.map((cat) => [
        cat.id,
        q
          ? cat.questions.filter(
              (item) =>
                normalise(item.question).includes(q) ||
                normalise(item.title ?? "").includes(q)
            ).length
          : cat.questions.length,
      ])
    );
  }, [categories, searchQuery]);

  useEffect(() => {
    if (!searchQuery) return;
    const firstWithResults = categories.find((c) => (matchCounts[c.id] ?? 0) > 0);
    if (firstWithResults && firstWithResults.id !== activeCategoryId) {
      setActiveCategoryId(firstWithResults.id);
    }
  }, [searchQuery, matchCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = useCallback(() => {
<<<<<<< HEAD
    if (selectedQuestion) {
      onApply(selectedQuestion.question, activeCategoryId);
    }
  }, [selectedQuestion, onApply, activeCategoryId]);
=======
    if (selectedList.length === 0) return;
    onApply(selectedList.map((item) => item.question));
  }, [selectedList, onApply]);
>>>>>>> origin/development

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <LibraryModalOverlay label="Question Library" onClose={onClose}>
        <div {...libraryModalShellProps()} onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-center gap-5 border-b border-[rgba(16,24,40,0.06)] px-7 py-5">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                Question library
              </h2>
              <p className="mb-0 mt-1 text-[13px] text-dark-200">
                Browse and apply one or more legal review questions
              </p>
            </div>

            <div className="relative w-72 shrink-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions…"
                className="lib-modal-search"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#F7F8FB] hover:text-[#1a1a1a]"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#F7F8FB] hover:text-[#1a1a1a]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <LibraryModalColumns
            categories={
              <>
                <p className="m-0 mb-3 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                  Categories
                </p>
                <CategoryRail
                  categories={categories}
                  activeCategoryId={activeCategoryId}
                  onSelect={setActiveCategoryId}
                  matchCounts={matchCounts}
                />
              </>
            }
            listHeader={
              <div className="shrink-0 border-b border-[rgba(16,24,40,0.06)] px-6 py-3.5">
                <p className="m-0 text-[12px] text-[#98A2B3]">
                  {filteredQuestions.length}{" "}
                  {filteredQuestions.length === 1 ? "question" : "questions"}
                  {searchQuery && (
                    <span> matching &ldquo;{searchQuery}&rdquo;</span>
                  )}
                </p>
              </div>
            }
            listContent={
              <QuestionList
                questions={filteredQuestions}
                categoryId={activeCategoryId}
                selectedKeys={selectedKeys}
                previewKey={previewKey}
                searchQuery={searchQuery}
                onToggle={handleToggle}
              />
            }
            previewContent={<PreviewPane question={selectedQuestion} />}
          />

          <div className="flex shrink-0 items-center justify-between border-t border-[rgba(16,24,40,0.06)] bg-white px-7 py-4">
            <p className="m-0 min-w-0 truncate text-[12px] text-[#98A2B3]">
              {selectedList.length === 0
                ? "No questions selected"
                : `${selectedList.length} question${selectedList.length === 1 ? "" : "s"} selected`}
            </p>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-10 cursor-pointer rounded-full border border-gray-200 bg-white px-5 text-[13px] font-medium text-dark-200 transition-colors hover:bg-light-blue-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={selectedList.length === 0}
                className="h-10 cursor-pointer rounded-full primary-gradient px-6 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply {selectedList.length > 1 ? `${selectedList.length} questions` : "question"}
              </button>
            </div>
          </div>
        </div>
      </LibraryModalOverlay>
    </>
  );
}
