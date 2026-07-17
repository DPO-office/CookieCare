import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, X } from "lucide-react";
import { Source } from "../types";

interface CitationModalProps {
  source: Source | null;
  onClose: () => void;
}

export default function CitationModal({ source, onClose }: CitationModalProps) {
  return (
    <AnimatePresence>
      {source && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase tracking-wide">
                    {source.documentType}
                  </span>
                  <span className="text-[10px] text-gray-400">{source.jurisdiction}</span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-snug">{source.title}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition cursor-pointer ml-4 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] text-gray-500">
                <strong className="text-gray-700">Citation: </strong>
                {source.citation}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-mono">
                {source.officialCopy}
              </pre>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-white">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(source.officialCopy);
                  alert("Copied to clipboard.");
                }}
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-gray-800 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy transcript</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
