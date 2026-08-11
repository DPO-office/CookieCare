import React from "react";
import { X, FileCode, Globe, Trash2 } from "lucide-react";
import { LibraryItem, LibraryTabId } from "../types";
import { TagChips } from "./TagChips";

interface ItemDetailViewProps {
  item: LibraryItem;
  onClose: () => void;
  onDelete: (id: string, type: LibraryTabId, e: React.MouseEvent) => void;
}

export function ItemDetailView({ item, onClose, onDelete }: ItemDetailViewProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-lg bg-white border border-gray-100 shadow-2xl rounded-2xl relative overflow-hidden">
        {/* Top accent */}
        <div className="h-1 w-full" style={{ background: "var(--brand-primary)" }} />

        <div className="p-6">
          <button
            onClick={onClose}
            className="absolute right-4 top-5 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="mb-5 pb-4 border-b border-gray-100 flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--brand-primary-light)" }}
            >
              <FileCode className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-gray-900 leading-tight tracking-tight">
                {item.name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                {item.id} · {item.type}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Description
              </span>
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3 leading-relaxed">
                {item.description}
              </p>
            </div>

            {item.details && (
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  {item.type === "websites" ? "URL" : "Content"}
                </span>
                {item.type === "websites" ? (
                  <a
                    href={String(item.details)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-blue-600 hover:underline flex items-center gap-1.5 bg-blue-50 p-3 border border-blue-100 rounded-xl"
                  >
                    <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{String(item.details)}</span>
                  </a>
                ) : (
                  <pre className="text-xs font-mono p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {typeof item.details === "string"
                      ? item.details
                      : JSON.stringify(item.details, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Tags</span>
                <div className="flex flex-wrap gap-1">
                  <TagChips tags={item.tags} maxVisible={6} />
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Created by</span>
                <span className="text-sm font-semibold text-gray-800">{item.createdBy}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-5">
            <button
              onClick={(e) => {
                onDelete(item.id, item.type as LibraryTabId, e);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 rounded-xl text-sm font-semibold transition cursor-pointer text-gray-700 shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
