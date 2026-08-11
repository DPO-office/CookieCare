/**
 * SourcesPanel — Verified citations side panel.
 *
 * Slides in from the right when the user reveals sources.
 * Follows the RandTrust Design System: clean surfaces, enterprise typography,
 * no decorative color — only semantic signals.
 */
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, ExternalLink, X, FileText } from "lucide-react";
import { Source } from "../types";

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
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="shrink-0 overflow-hidden flex flex-col"
          style={{
            minWidth: 0,
            background: "#FFFFFF",
            borderLeft: "1px solid #E4E4E7",
          }}
        >
          {/* ── Panel header ── */}
          <div
            className="px-4 py-4 flex items-center justify-between shrink-0"
            style={{ borderBottom: "1px solid #F0F0F2" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "#F4F4F5" }}
                aria-hidden="true"
              >
                <FileText className="w-3.5 h-3.5" style={{ color: "#18181B" }} strokeWidth={1.5} />
              </div>
              <div>
                <p
                  className="text-[13px] font-semibold"
                  style={{ color: "#111827", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
                >
                  Sources
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: "#9CA3AF", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
                >
                  {sources.length} citation{sources.length !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close sources panel"
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
              style={{ color: "#9CA3AF" }}
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

          {/* ── Source list ── */}
          <div className="flex-1 overflow-y-auto p-3">
            {sources.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "#F3F4F6" }}
                  aria-hidden="true"
                >
                  <BookOpen className="w-5 h-5" style={{ color: "#D1D5DB" }} strokeWidth={1.5} />
                </div>
                <p
                  className="text-[13px] font-medium mb-1"
                  style={{ color: "#374151", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
                >
                  No sources yet
                </p>
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: "#9CA3AF", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
                >
                  Verified citations will appear here after a query completes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((source, idx) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onSourceClick(source)}
                    aria-label={`View citation: ${source.title}`}
                    className="w-full text-left rounded-lg p-3.5 transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]"
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E4E4E7",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "#D4D4D8";
                      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "#E4E4E7";
                      el.style.boxShadow = "none";
                    }}
                  >
                    {/* Citation header: number + type badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 text-white"
                          style={{ background: "#18181B" }}
                          aria-hidden="true"
                        >
                          {idx + 1}
                        </span>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                          style={{ background: "#F3F4F6", color: "#6B7280" }}
                        >
                          {source.documentType}
                        </span>
                      </div>
                      <ExternalLink
                        className="w-3 h-3 transition-colors duration-150"
                        style={{ color: "#D1D5DB" }}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </div>

                    {/* Title */}
                    <h4
                      className="text-[12px] font-semibold leading-snug line-clamp-2 mb-1.5"
                      style={{ color: "#111827", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
                    >
                      {source.title}
                    </h4>

                    {/* Jurisdiction */}
                    <p
                      className="text-[11px] mb-2"
                      style={{ color: "#9CA3AF", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
                    >
                      {source.jurisdiction}
                    </p>

                    {/* Citation monospace */}
                    <p
                      className="text-[10px] font-mono truncate pt-2"
                      style={{
                        borderTop: "1px solid #F0F0F2",
                        color: "#6B7280",
                        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {source.citation}
                    </p>
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
