import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { LibraryModalOverlay } from "../../analyze/components/LibraryModalColumns";
import { ANALYZE_STYLES } from "../../analyze/styles/analyzeStyles";
import { DraftLibraryItem } from "../hooks/useDraftLibrary";

interface DraftLibraryPickerProps {
  title: string;
  description: string;
  items: DraftLibraryItem[];
  selectedIds: string[];
  multiple?: boolean;
  emptyLabel: string;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

export function DraftLibraryPicker({
  title,
  description,
  items,
  selectedIds,
  multiple = false,
  emptyLabel,
  onChange,
  onClose,
}: DraftLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const toggle = (id: string) => {
    if (multiple) {
      onChange(
        selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
      );
      return;
    }
    onChange(selected.has(id) ? [] : [id]);
  };

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <LibraryModalOverlay label={title} onClose={onClose} placement="right">
        <div
          className="flex h-full w-full max-w-[420px] flex-col overflow-hidden rounded-[24px] bg-white font-sans"
          style={{
            boxShadow:
              "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 24px 48px rgba(16,24,40,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-6 py-5">
            <div>
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                {title}
              </h2>
              <p className="mb-0 mt-1 text-[13px] leading-relaxed text-dark-200">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#F7F8FB] hover:text-[#1a1a1a]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="shrink-0 px-6 pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="lib-modal-search"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <p className="m-0 text-[13px] font-medium text-[#1a1a1a]">
                  {searchQuery ? "No matches." : emptyLabel}
                </p>
                <p className="m-0 mt-1.5 text-[12px] text-dark-200">
                  {searchQuery
                    ? "Try a different search term."
                    : "Add items in Vault, then return here."}
                </p>
              </div>
            ) : (
              <ul className="m-0 list-none p-0">
                {filtered.map((item) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border-none px-4 py-3 text-left transition-colors ${
                          isSelected ? "bg-[#F7F8FB]" : "bg-transparent hover:bg-[#F7F8FB]"
                        }`}
                      >
                        <div
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
                          style={{
                            background: isSelected ? "#111827" : "#ffffff",
                            border: `1.5px solid ${isSelected ? "#111827" : "#D0D5DD"}`,
                          }}
                        >
                          {isSelected && (
                            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                          )}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-[13px] leading-snug"
                            style={{
                              color: "#1a1a1a",
                              fontWeight: isSelected ? 600 : 500,
                            }}
                          >
                            {item.name}
                          </span>
                          {item.description && (
                            <span className="mt-0.5 block text-[12px] leading-snug text-[#667085]">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
            <span className="text-[13px] text-[#98A2B3]">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              onClick={onClose}
              className="h-10 cursor-pointer rounded-full primary-gradient px-6 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      </LibraryModalOverlay>
    </>
  );
}
