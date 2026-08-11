import React, { useState, useMemo } from "react";
import { Search, FileText, ChevronRight, FolderOpen, Check } from "lucide-react";
import { LegalDocument } from "../../../shared/types";
import { isPlaceholderVaultDocument } from "../../analyze/utils/vaultDocumentFilters";

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

  const hasUpdatedDates = useMemo(
    () => available.some((d) => !!d.updatedAt && relativeDate(d.updatedAt) !== ""),
    [available],
  );

  if (available.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-[#FAFAFA]">
        <div className="bg-white border border-[#EBEBEB] rounded-[22px] shadow-sm p-12 text-center max-w-md w-full">
          <div className="w-14 h-14 rounded-2xl bg-[#F4F4F5] flex items-center justify-center mx-auto mb-5">
            <FolderOpen className="w-6 h-6 text-[#A1A1AA]" />
          </div>
          <h3 className="text-[16px] font-semibold text-[#18181B]">No documents yet</h3>
          <p className="text-[13px] text-[#A1A1AA] mt-2 leading-relaxed">
            Upload or create a draft in{" "}
            <span className="font-medium text-[#52525B]">Draft Agreements</span>, then return
            here to start negotiating.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFA]">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl w-full mx-auto">
          <header className="mb-8">
            <h1 className="text-[28px] font-semibold tracking-tight text-[#18181B] m-0">
              Negotiate redlines
            </h1>
            <p className="text-[14px] text-[#A1A1AA] mt-2 m-0 leading-relaxed">
              Review, redline, and resolve contract positions.
            </p>
          </header>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4] pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 pl-11 pr-4 rounded-full border border-[#E4E4E7] bg-white text-[14px] text-[#18181B] placeholder-[#C4C4C4] outline-none focus:border-[#D4D4D8] focus:ring-2 focus:ring-[#18181B]/5 transition"
              />
            </div>
            <button
              type="button"
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-full text-[13px] font-semibold shrink-0 transition-all border-none cursor-pointer disabled:cursor-not-allowed"
              style={{
                background: selected ? "#18181B" : "#F4F4F5",
                color: selected ? "#FFFFFF" : "#A1A1AA",
              }}
            >
              Open negotiation
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[12px] text-[#A1A1AA] mb-4 m-0">
            {search.trim()
              ? `${filtered.length} of ${available.length} document${available.length !== 1 ? "s" : ""} match`
              : `${available.length} document${available.length !== 1 ? "s" : ""} available`}
          </p>

          <div className="bg-white border border-[#EBEBEB] rounded-[22px] shadow-sm overflow-hidden">
            <div
              className={`grid ${
                hasUpdatedDates ? "grid-cols-[1fr_88px_100px_32px]" : "grid-cols-[1fr_88px_32px]"
              } px-5 py-3 border-b border-[#F4F4F5] bg-[#FAFAFA]/80`}
            >
              <span className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider">
                Document
              </span>
              <span className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider">
                Type
              </span>
              {hasUpdatedDates && (
                <span className="text-[10px] font-semibold text-[#C4C4C4] uppercase tracking-wider">
                  Updated
                </span>
              )}
              <span />
            </div>

            <div className="max-h-[min(56vh,520px)] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-5 py-14 text-center text-[13px] text-[#A1A1AA]">
                  No documents match your search.
                </div>
              ) : (
                <ul className="p-2">
                  {filtered.map((doc) => {
                    const isSelected = selected?.id === doc.id;
                    const dateLabel = relativeDate(doc.updatedAt);
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(doc)}
                          className={[
                            `w-full grid ${
                              hasUpdatedDates
                                ? "grid-cols-[1fr_88px_100px_32px]"
                                : "grid-cols-[1fr_88px_32px]"
                            } items-center px-3 py-3.5 rounded-xl text-left transition-all duration-150 outline-none`,
                            isSelected
                              ? "bg-[#F4F4F5] ring-1 ring-[#E4E4E7]"
                              : "hover:bg-[#FAFAFA]",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                background: isSelected ? "#FFFFFF" : "#F4F4F5",
                              }}
                            >
                              <FileText
                                className="w-4 h-4"
                                style={{ color: isSelected ? "#18181B" : "#A1A1AA" }}
                              />
                            </div>
                            <span
                              className="text-[14px] font-medium truncate"
                              style={{ color: "#18181B" }}
                            >
                              {doc.title}
                            </span>
                          </div>

                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium w-fit"
                            style={{
                              background: "#F4F4F5",
                              color: "#71717A",
                            }}
                          >
                            {doc.type}
                          </span>

                          {hasUpdatedDates && (
                            <span className="text-[12px] text-[#A1A1AA]">{dateLabel}</span>
                          )}

                          <div className="flex justify-end">
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-[#18181B] flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
