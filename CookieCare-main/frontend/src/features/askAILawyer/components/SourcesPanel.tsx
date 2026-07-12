import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { BookmarkCheck, BookOpen, ExternalLink, X } from "lucide-react";
import { Source } from "../types";

interface SourcesPanelProps {
  visible: boolean;
  sources: Source[];
  onClose: () => void;
  onSourceClick: (source: Source) => void;
}

export default function SourcesPanel({
  visible,
  sources,
  onClose,
  onSourceClick,
}: SourcesPanelProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          key="sources-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 264, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="shrink-0 bg-white border-l border-gray-200 overflow-hidden flex flex-col"
          style={{ minWidth: 0 }}
        >
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-semibold text-gray-800">Sources</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                  {sources.length}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-3">
                <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
                  <BookOpen className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Verified citations will appear here after a query completes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onSourceClick(source)}
                    className="w-full text-left border border-gray-200 rounded-xl p-3 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        {source.documentType}
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition" />
                    </div>
                    <h4 className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2 mb-1">
                      {source.title}
                    </h4>
                    <p className="text-[10px] text-gray-400">{source.jurisdiction}</p>
                    <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1">
                      <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Ref:</span>
                      <span className="text-[10px] text-gray-500 truncate font-mono">{source.citation}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
