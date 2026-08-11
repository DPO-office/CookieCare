
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, MousePointerClick } from "lucide-react";
import { PromptCategory, DEFAULT_PROMPT_CATEGORIES } from "../constants";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";
import { ANALYZE_STYLES } from "../styles/analyzeStyles";
import { LibraryModalColumns, libraryModalShellProps } from "./LibraryModalColumns";

interface PromptLibraryModalProps {
  promptLibrary: PromptLibraryItem[];
  onApply: (promptText: string) => void;
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
            className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] flex items-start justify-between gap-2 transition-colors border-none cursor-pointer ${
              isActive
                ? "bg-[#18181B] text-white font-medium"
                : "text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B] bg-transparent"
            }`}
          >
            <span className="lib-modal-cat-label">{cat.label}</span>
            {count > 0 && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 tabular-nums ${
                  isActive ? "bg-white/15 text-white/90" : "bg-[#F0F0F0] text-[#A1A1AA]"
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
  selectedIndex: number | null;
  searchQuery: string;
  onSelect: (index: number) => void;
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

function PromptList({ prompts, selectedIndex, searchQuery, onSelect }: PromptListProps) {
  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
        <div className="w-10 h-10 rounded-full bg-[#F4F4F5] flex items-center justify-center mb-4">
          <Search className="w-5 h-5 text-[#A1A1AA]" />
        </div>
        <p className="text-[13px] font-medium text-[#52525B]">No prompts found</p>
        <p className="text-[12px] text-[#A1A1AA] mt-1.5">
          {searchQuery ? "Try a different search term." : "Prompts will appear here once added."}
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 p-0 list-none divide-y divide-[#F4F4F4]" role="listbox">
      {prompts.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <li
            key={idx}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(idx)}
            style={{ width: "100%", boxSizing: "border-box" }}
            className={`px-6 py-4 cursor-pointer transition-colors border-l-[3px] ${
              isSelected
                ? "bg-[#FAFAFA] border-l-[#18181B]"
                : "hover:bg-[#FAFAFA] border-l-transparent"
            }`}
          >
            <p className={`lib-modal-list-title${isSelected ? "" : " text-[#3F3F46]"}`}>
              {highlight(item.title, searchQuery)}
            </p>
            <p className="lib-modal-list-desc">
              {highlight(item.prompt, searchQuery)}
            </p>
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
        <div className="w-11 h-11 rounded-2xl bg-white border border-[#EBEBEB] flex items-center justify-center mb-4">
          <MousePointerClick className="w-5 h-5 text-[#C4C4C4]" />
        </div>
        <p className="text-[13px] font-medium text-[#52525B]">Select a prompt to preview</p>
        <p className="text-[12px] text-[#A1A1AA] mt-2 max-w-[260px] leading-relaxed">
          Click any prompt in the list to see its full text here before applying.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-[#F0F0F0] shrink-0">
        <p className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider mb-2">
          Preview
        </p>
        <h4 className="text-[15px] font-semibold text-[#18181B] leading-snug m-0">
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  useEffect(() => {
    setSelectedIndex(null);
  }, [activeCategoryId, searchQuery]);

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

  const selectedPrompt = selectedIndex !== null ? filteredPrompts[selectedIndex] ?? null : null;

  const handleApply = useCallback(() => {
    if (selectedPrompt) {
      onApply(selectedPrompt.prompt);
    }
  }, [selectedPrompt, onApply]);

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-5"
        aria-modal="true"
        role="dialog"
        aria-label="Prompt Library"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div {...libraryModalShellProps()} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center gap-5 px-7 py-5 border-b border-[#F0F0F0] shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-semibold text-[#18181B] tracking-[-0.02em] m-0">
                Prompt library
              </h2>
              <p className="text-[13px] text-[#A1A1AA] mt-1 mb-0">
                Browse and apply pre-built legal analysis prompts
              </p>
            </div>

            <div className="relative w-72 shrink-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4] pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts…"
                className="w-full rounded-full border border-[#E4E4E7] bg-[#FAFAFA] pl-10 pr-10 py-2.5 text-[13px] text-[#18181B] placeholder:text-[#C4C4C4] outline-none transition-all focus:border-[#D4D4D8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(24,24,27,0.05)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors border-none bg-transparent cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors border-none bg-transparent cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <LibraryModalColumns
            categories={
              <>
                <p className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider mb-3 m-0 px-1">
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
              <div className="px-6 py-3.5 border-b border-[#F0F0F0] shrink-0">
                <p className="text-[12px] text-[#A1A1AA] m-0">
                  {filteredPrompts.length}{" "}
                  {filteredPrompts.length === 1 ? "prompt" : "prompts"}
                  {searchQuery && (
                    <span className="text-[#C4C4C4]"> matching &ldquo;{searchQuery}&rdquo;</span>
                  )}
                </p>
              </div>
            }
            listContent={
              <PromptList
                prompts={filteredPrompts}
                selectedIndex={selectedIndex}
                searchQuery={searchQuery}
                onSelect={setSelectedIndex}
              />
            }
            previewContent={<PreviewPane prompt={selectedPrompt} />}
          />

          {/* Footer */}
          <div className="flex items-center justify-between px-7 py-4 border-t border-[#F0F0F0] shrink-0 bg-[#FAFAFA]/80">
            <p className="text-[12px] text-[#A1A1AA] m-0 truncate min-w-0">
              {selectedPrompt ? `Selected: ${selectedPrompt.title}` : "No prompt selected"}
            </p>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 rounded-full border border-[#E4E4E7] bg-white text-[13px] font-medium text-[#52525B] hover:bg-[#FAFAFA] hover:border-[#D4D4D8] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!selectedPrompt}
                className="h-10 px-6 rounded-full text-[13px] font-semibold text-white bg-[#18181B] hover:bg-[#262626] disabled:opacity-35 disabled:cursor-not-allowed transition-colors border-none cursor-pointer"
              >
                Apply prompt
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
