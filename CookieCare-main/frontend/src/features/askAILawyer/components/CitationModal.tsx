/**
 * CitationModal — Full citation detail dialog.
 *
 * Shows the complete official copy of a legal source with jurisdiction,
 * citation reference, and a copy-to-clipboard action.
 * Follows the RandTrust Design System: modal at --radius-xl, shadow-lg.
 */
import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, X, BookOpen, Check } from "lucide-react";
import { Source } from "../types";

interface CitationModalProps {
  source: Source | null;
  onClose: () => void;
}

export default function CitationModal({ source, onClose }: CitationModalProps) {
  const [copied, setCopied] = React.useState(false);

  /* Close on Escape */
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
        /* Backdrop */
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
          onClick={onClose}
          role="presentation"
        >
          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="citation-modal-title"
            initial={{ scale: 0.97, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-[640px] max-h-[82vh] flex flex-col overflow-hidden"
            style={{
              borderRadius: "16px",
              border: "1px solid #E4E4E7",
              boxShadow: "0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {/* ── Header ── */}
            <div
              className="px-5 py-4 flex items-start justify-between shrink-0"
              style={{ borderBottom: "1px solid #F0F0F2" }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "#EBF2FD", border: "1px solid #BFDBFE" }}
                  aria-hidden="true"
                >
                  <BookOpen className="w-3.5 h-3.5" style={{ color: "#2175D9" }} strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  {/* Type + jurisdiction badges */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ background: "#F3F4F6", color: "#6B7280" }}
                    >
                      {source.documentType}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: "#9CA3AF" }}
                    >
                      {source.jurisdiction}
                    </span>
                  </div>
                  <h3
                    id="citation-modal-title"
                    className="text-[15px] font-semibold leading-snug"
                    style={{ color: "#111827" }}
                  >
                    {source.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close citation dialog"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-100 cursor-pointer ml-3 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                style={{ border: "1px solid #E4E4E7", color: "#9CA3AF" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#F3F4F6";
                  (e.currentTarget as HTMLElement).style.color = "#374151";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "#9CA3AF";
                }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* ── Citation reference ── */}
            <div
              className="px-5 py-3 shrink-0"
              style={{ background: "#F9FAFB", borderBottom: "1px solid #F0F0F2" }}
            >
              <p
                className="text-[12px]"
                style={{ color: "#6B7280" }}
              >
                <span
                  className="font-semibold"
                  style={{ color: "#374151" }}
                >
                  Citation:{" "}
                </span>
                <span
                  style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {source.citation}
                </span>
              </p>
            </div>

            {/* ── Content body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <pre
                className="text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{
                  color: "#374151",
                  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {source.officialCopy}
              </pre>
            </div>

            {/* ── Footer ── */}
            <div
              className="px-5 py-4 flex justify-end shrink-0"
              style={{ borderTop: "1px solid #F0F0F2", background: "#F9FAFB" }}
            >
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Copied to clipboard" : "Copy full transcript"}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9] focus-visible:ring-offset-1"
                style={{ background: copied ? "#059669" : "#2175D9" }}
                onMouseEnter={(e) => {
                  if (!copied)
                    (e.currentTarget as HTMLElement).style.background = "#1D66C2";
                }}
                onMouseLeave={(e) => {
                  if (!copied)
                    (e.currentTarget as HTMLElement).style.background = "#2175D9";
                }}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                    <span>Copy transcript</span>
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
