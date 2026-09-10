/**
 * SourcesPanel — citation rail matching DPA review cards.
 */
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, ExternalLink, X, FileText } from "lucide-react";
import { Source } from "../types";

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";
const CARD_SHADOW_HOVER = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.14)";

interface SourcesPanelProps {
  visible: boolean;
  sources: Source[];
  onClose: () => void;
  onSourceClick: (source: Source) => void;
}

export default function SourcesPanel({ visible, sources, onClose, onSourceClick }: SourcesPanelProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          key="sources-panel"
          role="complementary"
          aria-label="Verified citations"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="ask-lawyer-sources my-3 mr-3 flex min-w-0 shrink-0 flex-col overflow-hidden font-sans"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  Sources
                </p>
                <p className="m-0 mt-0.5 text-[11px] text-[#98A2B3]">
                  {sources.length} citation{sources.length !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close sources panel"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                  <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <p className="m-0 mb-1 text-[13px] font-semibold text-[#1a1a1a]">No sources yet</p>
                <p className="m-0 max-w-[200px] text-[12px] leading-relaxed text-[#667085]">
                  Verified citations will appear here after a query completes.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {sources.map((source, idx) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onSourceClick(source)}
                    aria-label={`View citation: ${source.title}`}
                    className="group w-full cursor-pointer rounded-[18px] bg-white p-3.5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-px"
                    style={{ boxShadow: CARD_SHADOW }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = CARD_SHADOW_HOVER;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = CARD_SHADOW;
                    }}
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[11px] font-semibold text-[#4F5BD9]">
                          {idx + 1}
                        </span>
                        {source.documentType && (
                          <span className="score-badge bg-[#EEF2FF] text-[10px] font-medium text-[#4F5BD9]">
                            {source.documentType}
                          </span>
                        )}
                      </div>
                      <ExternalLink
                        className="h-3.5 w-3.5 shrink-0 text-[#98A2B3] transition-colors group-hover:text-[#4F5BD9]"
                        strokeWidth={1.75}
                      />
                    </div>

                    <h4 className="m-0 line-clamp-2 text-[13px] font-semibold leading-snug tracking-[-0.01em] text-[#1a1a1a]">
                      {source.title}
                    </h4>

                    {source.jurisdiction && (
                      <p className="m-0 mt-1 text-[11px] text-[#667085]">{source.jurisdiction}</p>
                    )}

                    {source.citation?.trim() && (
                      <p className="m-0 mt-2.5 truncate rounded-xl bg-[#F7F8FB] px-2.5 py-1.5 text-[10px] text-[#667085]">
                        {source.citation}
                      </p>
                    )}
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
