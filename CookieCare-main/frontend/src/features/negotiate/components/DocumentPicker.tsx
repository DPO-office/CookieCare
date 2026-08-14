import React, { useState, useMemo } from "react";
import { Search, FileText, ChevronRight, FolderOpen, Check } from "lucide-react";
import { LegalDocument } from "../../../shared/types";
import { isPlaceholderVaultDocument } from "../../analyze/utils/vaultDocumentFilters";

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";
const CARD_SHADOW_SELECTED = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.14)";

interface DocumentPickerProps {
  documents: LegalDocument[];
  onConfirm: (doc: LegalDocument) => void;
}

function relativeDate(iso: string | undefined | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 60) return "1 month ago";
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return "";
  }
}

function displayTitle(title: string) {
  const cleaned = title.replace(/[_-]+/g, " ").replace(/\.(pdf|docx?)$/i, "").trim();
  if (cleaned === cleaned.toUpperCase()) {
    return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return cleaned;
}

function filterNegotiableDocuments(documents: LegalDocument[]): LegalDocument[] {
  return documents.filter((doc) => !isPlaceholderVaultDocument(doc));
}

export default function DocumentPicker({ documents, onConfirm }: DocumentPickerProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LegalDocument | null>(null);

  const available = useMemo(() => filterNegotiableDocuments(documents), [documents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (d) => d.title.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
    );
  }, [available, search]);

  if (available.length === 0) {
    return (
      <div className="dpa-results-bg flex flex-1 items-center justify-center px-6 py-12 font-sans">
        <div
          className="w-full max-w-md rounded-[24px] bg-white px-8 py-12 text-center"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
            <FolderOpen className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h3 className="m-0 text-[18px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            No documents yet
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#667085]">
            Upload or create a draft in{" "}
            <span className="font-medium text-[#1a1a1a]">Draft</span>, then return here to start negotiating.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dpa-results-bg flex min-h-0 flex-1 flex-col overflow-hidden font-sans">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="mb-8">
            <p className="m-0 mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
              Legal Space · Negotiate
            </p>
            <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
              Negotiate redlines
            </h1>
            <p className="m-0 mt-2 max-w-xl text-[14px] leading-relaxed text-[#667085]">
              Review, redline, and resolve contract positions with AI-assisted markup.
            </p>
          </header>

          <div className="mb-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                placeholder="Search by name or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-full border-none bg-white pl-11 pr-4 text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3] focus:shadow-[0_0_0_3px_rgba(79,91,217,0.14)]"
                style={{ boxShadow: CARD_SHADOW }}
              />
            </div>
            <button
              type="button"
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className={`inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border-none px-6 text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed ${
                selected ? "primary-gradient text-white hover:opacity-90" : "bg-[#EEF2FF] text-[#98A2B3]"
              }`}
            >
              Open negotiation
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-5 mt-0 text-[12px] text-[#98A2B3]">
            {search.trim()
              ? `${filtered.length} of ${available.length} document${available.length !== 1 ? "s" : ""} match`
              : `${available.length} document${available.length !== 1 ? "s" : ""} available`}
          </p>

          {filtered.length === 0 ? (
            <div
              className="rounded-[22px] bg-white px-5 py-14 text-center text-[13px] text-[#667085]"
              style={{ boxShadow: CARD_SHADOW }}
            >
              No documents match your search.
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {filtered.map((doc) => {
                const isSelected = selected?.id === doc.id;
                const dateLabel = relativeDate(doc.updatedAt);
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(doc)}
                      className="group flex w-full cursor-pointer items-center gap-3.5 rounded-[22px] bg-white px-4 py-3.5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-px"
                      style={{ boxShadow: isSelected ? CARD_SHADOW_SELECTED : CARD_SHADOW }}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                        {isSelected ? (
                          <Check className="h-4 w-4" strokeWidth={2.25} />
                        ) : (
                          <FileText className="h-4 w-4" strokeWidth={1.75} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-[14px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                          {displayTitle(doc.title)}
                        </p>
                        {dateLabel && (
                          <p className="m-0 mt-0.5 text-[12px] text-[#98A2B3]">{dateLabel}</p>
                        )}
                      </div>

                      <span
                        className={`score-badge shrink-0 text-[10px] font-medium ${
                          doc.type === "draft"
                            ? "bg-[#EEF2FF] text-[#4F5BD9]"
                            : "bg-[#F7F8FB] text-[#667085]"
                        }`}
                      >
                        {doc.type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
