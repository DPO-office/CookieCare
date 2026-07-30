

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PromptCategory, DEFAULT_PROMPT_CATEGORIES } from "../constants";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";

// Types

interface PromptLibraryModalProps {
  /** Resolved library items coming from the API (merged with defaults). */
  promptLibrary: PromptLibraryItem[];
  /** Called when the user confirms their selection. */
  onApply: (promptText: string) => void;
  /** Called when the user dismisses the modal without applying. */
  onClose: () => void;
}
// Helpers

/**
 * Return a deep copy of the static category definitions.
 * API items are intentionally ignored here · the static DEFAULT_PROMPT_CATEGORIES
 * already contains the full, correctly categorised prompt library.
 * Merging flat API items into a single category caused every prompt to appear
 * under General Analysis instead of its assigned category.
 */
function buildCategories(_apiItems: PromptLibraryItem[]): PromptCategory[] {
  return DEFAULT_PROMPT_CATEGORIES.map((cat) => ({
    ...cat,
    prompts: [...cat.prompts],
  }));
}

function normalise(s: string) {
  return s.toLowerCase().trim();
}

// Sub-components

interface CategoryRailProps {
  categories: PromptCategory[];
  activeCategoryId: string;
  onSelect: (id: string) => void;
  matchCounts: Record<string, number>;
}

function CategoryRail({ categories, activeCategoryId, onSelect, matchCounts }: CategoryRailProps) {
  return (
    <nav
      aria-label="Prompt categories"
      className="flex flex-col gap-0.5 overflow-y-auto"
    >
      {categories.map((cat) => {
        const count = matchCounts[cat.id] ?? 0;
        const isActive = cat.id === activeCategoryId;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between gap-2 transition-colors ${
              isActive
                ? "bg-[#2175D9] text-white font-medium"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <span className="truncate">{cat.label}</span>
            {count > 0 && (
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
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
      <mark key={i} className="bg-yellow-100 text-yellow-800 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function PromptList({ prompts, selectedIndex, searchQuery, onSelect }: PromptListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <span className="text-3xl mb-3">👆</span>
        <p className="text-[13px] font-medium text-gray-500">No prompts found</p>
        <p className="text-[11px] text-gray-400 mt-1">
          {searchQuery ? "Try a different search term." : "Prompts will appear here once added."}
        </p>
      </div>
    );
  }

  return (
    <ul ref={listRef} className="divide-y divide-gray-100 overflow-y-auto h-full" role="listbox">
      {prompts.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <li
            key={idx}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(idx)}
            className={`px-4 py-3.5 cursor-pointer transition-colors ${
              isSelected
                ? "bg-blue-50 border-l-2 border-blue-500"
                : "hover:bg-gray-50 border-l-2 border-transparent"
            }`}
          >
            <p
              className={`text-[13px] font-medium leading-snug ${
                isSelected ? "text-blue-700" : "text-gray-800"
              }`}
            >
              {highlight(item.title, searchQuery)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
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
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
        <span className="text-4xl mb-4">👆</span>
        <p className="text-[13px] font-medium text-gray-500">Select a prompt to preview</p>
        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
          Click any prompt in the list to see its full text here before applying.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
          Preview
        </p>
        <h4 className="text-[14px] font-semibold text-gray-900 leading-snug">{prompt.title}</h4>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{prompt.prompt}</p>
      </div>
    </div>
  );
}


// Main modal

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

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Reset selection when category or search changes
  useEffect(() => {
    setSelectedIndex(null);
  }, [activeCategoryId, searchQuery]);

  /** Prompts for the active category that match the current search */
  const filteredPrompts = useMemo(() => {
    const q = normalise(searchQuery);
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (!cat) return [];
    if (!q) return cat.prompts;
    return cat.prompts.filter(
      (p) => normalise(p.title).includes(q) || normalise(p.prompt).includes(q)
    );
  }, [categories, activeCategoryId, searchQuery]);

  /** Per-category match counts for the sidebar badges */
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

  /** Auto-select the first category that has results when searching */
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
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Prompt Library"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal shell */}
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl"
        style={{ height: "min(80vh, 680px)" }}
      >
        {/* -- Header -- */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-semibold text-gray-900 tracking-tight">Prompt library</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Browse and apply pre-built legal analysis prompts
            </p>
          </div>

          {/* Search */}
          <div className="relative w-72">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts·"
              className="w-full pl-9 pr-4 py-2 text-[13px] border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-300 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                ·
              </button>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* -- Body (3-panel) -- */}
        <div className="flex flex-1 min-h-0">
          {/* Left rail · categories */}
          <aside className="w-52 shrink-0 border-r border-gray-100 bg-gray-50/60 p-3 overflow-y-auto">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">
              Categories
            </p>
            <CategoryRail
              categories={categories}
              activeCategoryId={activeCategoryId}
              onSelect={setActiveCategoryId}
              matchCounts={matchCounts}
            />
          </aside>

          {/* Centre · prompt list */}
          <main className="flex-1 min-w-0 border-r border-gray-100 flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <p className="text-[11px] text-gray-400">
                {filteredPrompts.length}{" "}
                {filteredPrompts.length === 1 ? "prompt" : "prompts"}
                {searchQuery && ` for "${searchQuery}"`}
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <PromptList
                prompts={filteredPrompts}
                selectedIndex={selectedIndex}
                searchQuery={searchQuery}
                onSelect={setSelectedIndex}
              />
            </div>
          </main>

          {/* Right · preview */}
          <aside className="w-72 shrink-0 bg-gray-50/40">
            <PreviewPane prompt={selectedPrompt} />
          </aside>
        </div>

        {/* -- Footer -- */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50/50 rounded-b-2xl">
          <p className="text-[12px] text-gray-400">
            {selectedPrompt ? `Selected: ${selectedPrompt.title}` : "No prompt selected"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedPrompt}
              className="px-5 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" style={{ background: "#2175D9" }}
            >
              Apply prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



