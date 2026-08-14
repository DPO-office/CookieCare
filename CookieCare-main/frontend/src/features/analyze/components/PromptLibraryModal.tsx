
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, MousePointerClick, Check } from "lucide-react";
import { PromptCategory, DEFAULT_PROMPT_CATEGORIES } from "../constants";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";
import { ANALYZE_STYLES } from "../styles/analyzeStyles";
import { LibraryModalColumns, libraryModalShellProps, LibraryModalOverlay } from "./LibraryModalColumns";

interface PromptLibraryModalProps {
  promptLibrary: PromptLibraryItem[];
  onApply: (promptTexts: string[]) => void;
  onClose: () => void;
}

function buildCategories(_apiItems: PromptLibraryItem[]): PromptCategory[] {
  return DEFAULT_PROMPT_CATEGORIES.map((cat) => ({
    ...cat,
    prompts: [...cat.prompts],
  }));
}

function normalise(s: string) {
  return s.toLowerCase().trim();
}

interface CategoryRailProps {
  categories: PromptCategory[];
  activeCategoryId: string;
  onSelect: (id: string) => void;
  matchCounts: Record<string, number>;
}

function CategoryRail({ categories, activeCategoryId, onSelect, matchCounts }: CategoryRailProps) {
  return (
    <nav aria-label="Prompt categories" className="flex flex-col gap-1">
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

interface PromptListProps {
  prompts: Array<{ title: string; prompt: string }>;
  categoryId: string;
  selectedKeys: Set<string>;
  previewKey: string | null;
  searchQuery: string;
  onToggle: (key: string, item: { title: string; prompt: string }) => void;
}

function itemKey(categoryId: string, title: string) {
  return `${categoryId}::${title}`;
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

function PromptList({
  prompts,
  categoryId,
  selectedKeys,
  previewKey,
  searchQuery,
  onToggle,
}: PromptListProps) {
  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF]">
          <Search className="h-4 w-4 text-[#4F5BD9]" />
        </div>
        <p className="text-[13px] font-medium text-[#1a1a1a]">No prompts found</p>
        <p className="mt-1.5 text-[12px] text-dark-200">
          {searchQuery ? "Try a different search term." : "Prompts will appear here once added."}
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 list-none p-0" role="listbox" aria-multiselectable="true">
      {prompts.map((item) => {
        const key = itemKey(categoryId, item.title);
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
                  {highlight(item.title, searchQuery)}
                </p>
                <p className="lib-modal-list-desc">{highlight(item.prompt, searchQuery)}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface PreviewPaneProps {
  prompt: { title: string; prompt: string } | null;
}

function PreviewPane({ prompt }: PreviewPaneProps) {
  if (!prompt) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-10 py-16">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#EEF2FF]">
          <MousePointerClick className="h-5 w-5 text-[#4F5BD9]" />
        </div>
        <p className="text-[13px] font-medium text-[#1a1a1a]">Select prompts to preview</p>
        <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-dark-200">
          Click one or more prompts in the list. You can apply several at once.
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
        <h4 className="m-0 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-[#1a1a1a]">
          {prompt.title}
        </h4>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
        <p className="lib-modal-preview-text m-0">{prompt.prompt}</p>
      </div>
    </div>
  );
}

export default function PromptLibraryModal({
  promptLibrary,
  onApply,
  onClose,
}: PromptLibraryModalProps) {
  const categories = useMemo(() => buildCategories(promptLibrary), [promptLibrary]);

  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [selectedItems, setSelectedItems] = useState<
    Record<string, { title: string; prompt: string }>
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
  const selectedPrompt =
    (previewKey && selectedItems[previewKey]) || selectedList[selectedList.length - 1] || null;

  const handleToggle = useCallback(
    (key: string, item: { title: string; prompt: string }) => {
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

  const handleApply = useCallback(() => {
    if (selectedList.length === 0) return;
    onApply(selectedList.map((item) => item.prompt));
  }, [selectedList, onApply]);

  const filteredPrompts = useMemo(() => {
    const q = normalise(searchQuery);
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (!cat) return [];
    if (!q) return cat.prompts;
    return cat.prompts.filter(
      (p) => normalise(p.title).includes(q) || normalise(p.prompt).includes(q)
    );
  }, [categories, activeCategoryId, searchQuery]);

  const matchCounts = useMemo<Record<string, number>>(() => {
    const q = normalise(searchQuery);
    return Object.fromEntries(
      categories.map((cat) => [
        cat.id,
        q
          ? cat.prompts.filter(
              (p) => normalise(p.title).includes(q) || normalise(p.prompt).includes(q)
            ).length
          : cat.prompts.length,
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

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <LibraryModalOverlay label="Prompt Library" onClose={onClose}>
        <div {...libraryModalShellProps()} onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-center gap-5 border-b border-[rgba(16,24,40,0.06)] px-7 py-5">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                Prompt library
              </h2>
              <p className="mb-0 mt-1 text-[13px] text-dark-200">
                Browse and apply one or more legal analysis prompts
              </p>
            </div>

            <div className="relative w-72 shrink-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts…"
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
                  {filteredPrompts.length}{" "}
                  {filteredPrompts.length === 1 ? "prompt" : "prompts"}
                  {searchQuery && (
                    <span> matching &ldquo;{searchQuery}&rdquo;</span>
                  )}
                </p>
              </div>
            }
            listContent={
              <PromptList
                prompts={filteredPrompts}
                categoryId={activeCategoryId}
                selectedKeys={selectedKeys}
                previewKey={previewKey}
                searchQuery={searchQuery}
                onToggle={handleToggle}
              />
            }
            previewContent={<PreviewPane prompt={selectedPrompt} />}
          />

          <div className="flex shrink-0 items-center justify-between border-t border-[rgba(16,24,40,0.06)] bg-white px-7 py-4">
            <p className="m-0 min-w-0 truncate text-[12px] text-[#98A2B3]">
              {selectedList.length === 0
                ? "No prompts selected"
                : `${selectedList.length} prompt${selectedList.length === 1 ? "" : "s"} selected`}
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
                Apply {selectedList.length > 1 ? `${selectedList.length} prompts` : "prompt"}
              </button>
            </div>
          </div>
        </div>
      </LibraryModalOverlay>
    </>
  );
}
