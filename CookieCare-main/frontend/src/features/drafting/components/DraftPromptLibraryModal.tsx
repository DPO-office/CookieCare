import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Check, Plus } from "lucide-react";
import { ANALYZE_STYLES } from "../../analyze/styles/analyzeStyles";
import {
  LibraryModalColumns,
  libraryModalShellProps,
  LibraryModalOverlay,
} from "../../analyze/components/LibraryModalColumns";
import type { DraftPrompt } from "../constants";

interface DraftPromptLibraryModalProps {
  starterPrompts: DraftPrompt[];
  customPrompts: DraftPrompt[];
  onApply: (promptTexts: string[]) => void;
  onAdd: (title: string, prompt: string) => Promise<unknown>;
  onRemove: (id: string) => void;
  onClose: () => void;
}

type CategoryId = "starter" | "mine";

function itemKey(id: string) {
  return id;
}

export function DraftPromptLibraryModal({
  starterPrompts,
  customPrompts,
  onApply,
  onAdd,
  onRemove,
  onClose,
}: DraftPromptLibraryModalProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>("starter");
  const [selectedItems, setSelectedItems] = useState<Record<string, DraftPrompt>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [saving, setSaving] = useState(false);
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

  const categories = [
    { id: "starter" as const, label: "Starter prompts", prompts: starterPrompts },
    { id: "mine" as const, label: "My prompts", prompts: customPrompts },
  ];

  const q = searchQuery.toLowerCase().trim();
  const filtered = useMemo(() => {
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (!cat) return [];
    if (!q) return cat.prompts;
    return cat.prompts.filter(
      (p) => p.title.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)
    );
  }, [categories, activeCategoryId, q]);

  const selectedList = Object.values(selectedItems);
  const selectedPrompt =
    (previewKey && selectedItems[previewKey]) ||
    filtered.find((p) => p.id === previewKey) ||
    selectedList[selectedList.length - 1] ||
    null;

  const handleToggle = useCallback((item: DraftPrompt) => {
    const key = itemKey(item.id);
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = item;
      return next;
    });
    setPreviewKey(key);
    setAdding(false);
  }, []);

  const handleSave = async () => {
    if (!newTitle.trim() || !newPrompt.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(newTitle, newPrompt);
      setNewTitle("");
      setNewPrompt("");
      setAdding(false);
      setActiveCategoryId("mine");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <LibraryModalOverlay label="Draft prompt library" onClose={onClose}>
        <div {...libraryModalShellProps()} onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-center gap-5 border-b border-[rgba(16,24,40,0.06)] px-7 py-5">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                Draft prompt library
              </h2>
              <p className="mb-0 mt-1 text-[13px] text-dark-200">
                Starter briefs for drafting — or save your own for reuse
              </p>
            </div>
            <div className="relative w-64 shrink-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts…"
                className="lib-modal-search"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-[#98A2B3] hover:bg-[#F7F8FB] hover:text-[#1a1a1a]"
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
                <nav className="flex flex-col gap-1">
                  {categories.map((cat) => {
                    const isActive = cat.id === activeCategoryId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setActiveCategoryId(cat.id);
                          setAdding(false);
                        }}
                        className={`lib-modal-cat-btn ${isActive ? "is-active" : ""}`}
                      >
                        <span className="lib-modal-cat-label">{cat.label}</span>
                        <span
                          className={`score-badge shrink-0 text-[10px] font-semibold tabular-nums ${
                            isActive ? "bg-white/15 text-white" : "bg-[#EEF2FF] text-[#4F5BD9]"
                          }`}
                        >
                          {cat.prompts.length}
                        </span>
                      </button>
                    );
                  })}
                </nav>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(true);
                    setActiveCategoryId("mine");
                    setPreviewKey(null);
                  }}
                  className="mt-4 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white text-[12px] font-semibold text-dark-200 hover:bg-light-blue-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add your prompt
                </button>
              </>
            }
            listHeader={
              <div className="shrink-0 border-b border-[rgba(16,24,40,0.06)] px-6 py-3.5">
                <p className="m-0 text-[12px] text-[#98A2B3]">
                  {filtered.length} {filtered.length === 1 ? "prompt" : "prompts"}
                </p>
              </div>
            }
            listContent={
              filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
                  <p className="text-[13px] font-medium text-[#1a1a1a]">
                    {activeCategoryId === "mine" ? "No custom prompts yet" : "No prompts found"}
                  </p>
                  <p className="mt-1.5 text-[12px] text-dark-200">
                    {activeCategoryId === "mine"
                      ? "Add a prompt you reuse when starting a draft."
                      : "Try a different search term."}
                  </p>
                </div>
              ) : (
                <ul className="m-0 list-none p-0">
                  {filtered.map((item) => {
                    const key = itemKey(item.id);
                    const isSelected = Boolean(selectedItems[key]);
                    return (
                      <li
                        key={key}
                        onClick={() => handleToggle(item)}
                        className={`lib-modal-list-item ${isSelected || previewKey === key ? "is-selected" : ""}`}
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
                            <p className="lib-modal-list-title">{item.title}</p>
                            <p className="lib-modal-list-desc">{item.prompt}</p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            }
            previewContent={
              adding ? (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-[rgba(16,24,40,0.06)] px-6 pb-4 pt-6">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                      New prompt
                    </p>
                    <h4 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                      Save a drafting brief
                    </h4>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Title"
                      className="h-10 w-full rounded-xl border-none bg-white px-3 text-[13px] text-[#1a1a1a] outline-none"
                      style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
                    />
                    <textarea
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      placeholder="The instruction that should fill the composer…"
                      rows={8}
                      className="w-full resize-none rounded-xl border-none bg-white px-3 py-2.5 text-[13px] leading-relaxed text-[#1a1a1a] outline-none"
                      style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
                    />
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!newTitle.trim() || !newPrompt.trim() || saving}
                      className="h-10 w-full cursor-pointer rounded-full primary-gradient text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {saving ? "Saving…" : "Save to my prompts"}
                    </button>
                  </div>
                </div>
              ) : selectedPrompt ? (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-[rgba(16,24,40,0.06)] px-6 pb-4 pt-6">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                      Preview
                    </p>
                    <h4 className="m-0 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-[#1a1a1a]">
                      {selectedPrompt.title}
                    </h4>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <p className="lib-modal-preview-text m-0">{selectedPrompt.prompt}</p>
                  </div>
                  {!selectedPrompt.builtin && (
                    <div className="shrink-0 border-t border-[rgba(16,24,40,0.06)] px-6 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          onRemove(selectedPrompt.id);
                          setSelectedItems((prev) => {
                            const next = { ...prev };
                            delete next[selectedPrompt.id];
                            return next;
                          });
                          setPreviewKey(null);
                        }}
                        className="text-[12px] font-medium text-badge-red-text hover:underline"
                      >
                        Remove from my prompts
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
                  <p className="text-[13px] font-medium text-[#1a1a1a]">Select a prompt</p>
                  <p className="mt-2 max-w-[240px] text-[12px] leading-relaxed text-dark-200">
                    Apply a starter brief, or add one of your own for the next draft.
                  </p>
                </div>
              )
            }
          />

          <div className="flex shrink-0 items-center justify-between border-t border-[rgba(16,24,40,0.06)] bg-white px-7 py-4">
            <p className="m-0 text-[12px] text-[#98A2B3]">
              {selectedList.length === 0
                ? "No prompts selected"
                : `${selectedList.length} selected`}
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-10 cursor-pointer rounded-full border border-gray-200 bg-white px-5 text-[13px] font-medium text-dark-200 hover:bg-light-blue-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedList.length === 0) return;
                  onApply(selectedList.map((p) => p.prompt));
                }}
                disabled={selectedList.length === 0}
                className="h-10 cursor-pointer rounded-full primary-gradient px-6 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
