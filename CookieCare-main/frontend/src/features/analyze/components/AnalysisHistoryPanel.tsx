import { useEffect } from "react";
import { X, Clock, ChevronRight, AlertCircle, FileSearch } from "lucide-react";
import { ANALYZE_STYLES } from "../styles/analyzeStyles";
import { LibraryModalOverlay } from "./LibraryModalColumns";
import type { AnalysisHistoryItem } from "../hooks/useAnalysisHistory";

interface AnalysisHistoryPanelProps {
  history: AnalysisHistoryItem[];
  loading: boolean;
  loadingSession: boolean;
  error: string | null;
  onClose: () => void;
  onSelectSession: (item: AnalysisHistoryItem) => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "completed") {
    return (
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
        title="Completed"
      />
    );
  }
  if (s === "failed") {
    return (
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"
        title="Failed"
      />
    );
  }
  return null;
}

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-b border-[rgba(16,24,40,0.05)]">
      <div className="h-8 w-8 shrink-0 rounded-full bg-[#F0F0F2] animate-pulse" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3 w-3/4 rounded-full bg-[#F0F0F2] animate-pulse" />
        <div className="h-2.5 w-1/3 rounded-full bg-[#F0F0F2] animate-pulse" />
      </div>
    </div>
  );
}

export function AnalysisHistoryPanel({
  history,
  loading,
  loadingSession,
  error,
  onClose,
  onSelectSession,
}: AnalysisHistoryPanelProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <style>{ANALYZE_STYLES}</style>
      <LibraryModalOverlay label="Analysis History" onClose={onClose} placement="right">
        <div
          className="flex h-full w-full max-w-[400px] flex-col overflow-hidden rounded-[24px] bg-white font-sans"
          style={{
            boxShadow:
              "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 24px 48px rgba(16,24,40,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-5 border-b border-[rgba(16,24,40,0.06)]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                <Clock className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="m-0 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  Analysis History
                </h2>
                <p className="m-0 mt-0.5 text-[12px] text-[#98A2B3]">
                  Your previous analysis sessions
                </p>
              </div>
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

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Loading skeleton */}
            {loading && (
              <div className="pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                </div>
                <p className="text-[13px] font-medium text-[#1a1a1a]">
                  Couldn't load history
                </p>
                <p className="mt-1 text-[12px] text-[#98A2B3]">{error}</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && history.length === 0 && (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF]">
                  <FileSearch className="h-4 w-4 text-[#4F5BD9]" />
                </div>
                <p className="text-[13px] font-medium text-[#1a1a1a]">No analyses yet</p>
                <p className="mt-1 text-[12px] text-[#98A2B3]">
                  Your completed analyses will appear here.
                </p>
              </div>
            )}

            {/* History list */}
            {!loading && !error && history.length > 0 && (
              <ul className="m-0 list-none p-0 pt-1 pb-3">
                {history.map((item) => (
                  <li key={item.jobId}>
                    <button
                      type="button"
                      disabled={loadingSession}
                      onClick={() => onSelectSession(item)}
                      className="group flex w-full cursor-pointer items-start gap-3 border-none bg-transparent px-5 py-3.5 text-left transition-colors hover:bg-[#F7F8FB] disabled:opacity-60 disabled:cursor-wait"
                    >
                      {/* Icon */}
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F4F5] text-[#98A2B3] transition-colors group-hover:bg-[#EEF2FF] group-hover:text-[#4F5BD9]">
                        <FileSearch className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[13px] font-semibold leading-snug tracking-[-0.01em] text-[#1a1a1a] line-clamp-2 text-left">
                          {item.title}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <StatusDot status={item.status} />
                          <span className="text-[11px] text-[#98A2B3]">
                            {formatRelativeDate(item.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-[#D0D5DD] transition-colors group-hover:text-[#4F5BD9]" strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer count */}
          {!loading && history.length > 0 && (
            <div className="shrink-0 border-t border-[rgba(16,24,40,0.06)] px-6 py-3.5">
              <p className="m-0 text-[11px] text-[#98A2B3]">
                {history.length} session{history.length === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      </LibraryModalOverlay>
    </>
  );
}
