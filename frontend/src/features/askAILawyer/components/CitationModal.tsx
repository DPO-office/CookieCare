/**
 * CitationModal — citation detail using DPA review card language.
 */
import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, X, BookOpen, Check } from "lucide-react";
import { Source } from "../types";

const CARD_SHADOW =
  "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 24px 48px rgba(16,24,40,0.12)";

interface CitationModalProps {
  source: Source | null;
  onClose: () => void;
}

export default function CitationModal({ source, onClose }: CitationModalProps) {
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (!source) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [source, onClose]);

  const handleCopy = () => {
    if (!source) return;
    navigator.clipboard.writeText(source.officialCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {source && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(16, 24, 40, 0.28)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="citation-modal-title"
            initial={{ scale: 0.97, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[82vh] w-full max-w-[640px] flex-col overflow-hidden bg-white font-sans"
            style={{
              borderRadius: 24,
              boxShadow: CARD_SHADOW,
            }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                  <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {source.documentType && (
                      <span className="score-badge bg-[#EEF2FF] text-[10px] font-medium text-[#4F5BD9]">
                        {source.documentType}
                      </span>
                    )}
                    {source.jurisdiction && (
                      <span className="text-[11px] text-[#98A2B3]">{source.jurisdiction}</span>
                    )}
                  </div>
                  <h3
                    id="citation-modal-title"
                    className="m-0 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-[#1a1a1a]"
                  >
                    {source.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close citation dialog"
                className="ml-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {source.citation?.trim() && (
              <div className="mx-5 mb-1 rounded-2xl bg-[#F7F8FB] px-4 py-3">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                  Citation
                </p>
                <p className="m-0 mt-1 text-[13px] leading-relaxed text-[#344054]">
                  {source.citation}
                </p>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {source.officialCopy?.trim() ? (
                <div className="rounded-2xl bg-[#F7F8FB] p-4">
                  <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                    Official copy
                  </p>
                  <pre className="m-0 whitespace-pre-wrap font-sans text-[13px] leading-[1.7] text-[#344054]">
                    {source.officialCopy}
                  </pre>
                </div>
              ) : (
                <p className="m-0 text-[13px] leading-relaxed text-[#667085]">
                  No transcript is available for this source.
                </p>
              )}
            </div>

            <div className="flex shrink-0 justify-end px-5 py-4">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!source.officialCopy?.trim()}
                aria-label={copied ? "Copied to clipboard" : "Copy full transcript"}
                className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
                  copied ? "bg-[#111827]" : "primary-gradient"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Copy transcript
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
