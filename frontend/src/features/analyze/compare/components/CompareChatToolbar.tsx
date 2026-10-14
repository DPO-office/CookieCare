import { useState, useRef, useEffect } from "react";
import { History, Trash2 } from "lucide-react";
import type { CompareHistoryEntry } from "../utils/compareHistory";
import { formatHistoryDate } from "../utils/compareHistory";

interface CompareHistoryPanelProps {
  open: boolean;
  entries: CompareHistoryEntry[];
  activeId?: string | null;
  onSelect: (entry: CompareHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function CompareHistoryPanel({
  open,
  entries,
  activeId,
  onSelect,
  onDelete,
  onClose,
}: CompareHistoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-[320px] max-h-[360px] overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.10)] z-50"
    >
      <div className="px-4 py-3 border-b border-[#F0F0F0]">
        <p className="text-[13px] font-semibold text-[#18181B]">Comparison history</p>
        <p className="text-[11px] text-[#A1A1AA] mt-0.5">Your recent agreement comparisons</p>
      </div>

      <div className="overflow-y-auto max-h-[300px] p-2">
        {entries.length === 0 ? (
          <p className="text-[12px] text-[#A1A1AA] text-center py-8 px-4">
            No previous comparisons yet. Run a compare to see it here.
          </p>
        ) : (
          entries.map((entry) => {
            const isActive = entry.id === activeId;
            return (
              <div
                key={entry.id}
                className={`group flex items-start gap-2 rounded-xl px-3 py-2.5 transition-colors ${
                  isActive ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry);
                    onClose();
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-[12.5px] font-medium text-[#18181B] truncate leading-snug">
                    {entry.title}
                  </p>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                    {formatHistoryDate(entry.createdAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry.id);
                  }}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#D4D4D8] opacity-0 group-hover:opacity-100 hover:text-[#EF4444] hover:bg-[#FEF2F2] transition-all"
                  aria-label="Delete from history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface CompareChatToolbarProps {
  onNew: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  historyEntries: CompareHistoryEntry[];
  activeHistoryId?: string | null;
  onSelectHistory: (entry: CompareHistoryEntry) => void;
  onDeleteHistory: (id: string) => void;
  onCloseHistory: () => void;
}

export function CompareChatToolbar({
  onNew,
  historyOpen,
  onToggleHistory,
  historyEntries,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
  onCloseHistory,
}: CompareChatToolbarProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onNew}
        className="inline-flex h-8 cursor-pointer items-center rounded-full border border-gray-200 bg-white px-4 text-[13px] font-medium text-dark-200 transition-colors hover:bg-light-blue-100"
      >
        New comparison
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={onToggleHistory}
          className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all ${
            historyOpen
              ? "bg-[#F4F4F5] border-[#D4D4D8] text-[#18181B]"
              : "bg-white border-[#E4E4E7] text-[#71717A] hover:border-[#D4D4D8] hover:text-[#52525B]"
          }`}
          aria-label="Comparison history"
          title="History"
        >
          <History className="w-4 h-4" />
        </button>

        <CompareHistoryPanel
          open={historyOpen}
          entries={historyEntries}
          activeId={activeHistoryId}
          onSelect={onSelectHistory}
          onDelete={onDeleteHistory}
          onClose={onCloseHistory}
        />
      </div>
    </div>
  );
}
