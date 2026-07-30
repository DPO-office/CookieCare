import React, { useState, useMemo } from "react";
import { Search, FileText, ChevronRight, FolderOpen, CheckCircle2 } from "lucide-react";
import { LegalDocument } from "../../../shared/types";

interface DocumentPickerProps {
  documents: LegalDocument[];
  onConfirm: (doc: LegalDocument) => void;
}

const TYPE_BADGE: Record<string, string> = {
  NDA:    "bg-purple-50 text-purple-700 border-purple-200",
  DPA:    "bg-blue-50   text-blue-700   border-blue-200",
  SLA:    "bg-teal-50   text-teal-700   border-teal-200",
  Custom: "bg-gray-50   text-gray-600   border-gray-200",
};

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

export default function DocumentPicker({ documents, onConfirm }: DocumentPickerProps) {
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<LegalDocument | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) => d.title.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
    );
  }, [documents, search]);

  // Only show the Updated column if at least one document has a real date
  const hasUpdatedDates = useMemo(
    () => documents.some((d) => !!d.updatedAt && relativeDate(d.updatedAt) !== ""),
    [documents],
  );

  /* ·· Empty state ························································ */
  if (documents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-8 bg-[#FAFAFB]">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-14 text-center max-w-md w-full">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto mb-5">
            <FolderOpen className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-[16px] font-semibold text-gray-900">No documents yet</h3>
          <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">
            Upload or create a draft in the{" "}
            <span className="font-medium text-gray-700">Draft Agreements</span> section,
            then return here to start negotiating.
          </p>
        </div>
      </div>
    );
  }

  /* ·· Single-screen picker ··············································· */
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFB]">
      <div className="flex-1 overflow-hidden px-10 pt-0 pb-8 flex flex-col min-h-0">
        <div className="max-w-5xl w-full mx-auto flex flex-col min-h-0 flex-1">

          {/* Search + Open button row */}
          <div className="flex items-center gap-3 mb-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition"
              />
            </div>
            <button
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className={[
                "inline-flex items-center gap-2 px-5 h-10 rounded-xl text-[13px] font-semibold shrink-0 transition-all",
                selected
                  ? "text-white shadow-sm hover:opacity-90"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed",
              ].join(" ")}
              style={selected ? { background: "#2175D9" } : {}}
            >
              Open negotiation
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Count line */}
          <p className="text-[12px] text-gray-400 mb-3 shrink-0">
            {search.trim()
              ? `${filtered.length} of ${documents.length} document${documents.length !== 1 ? "s" : ""} match`
              : `${documents.length} document${documents.length !== 1 ? "s" : ""} available`}
          </p>

          {/* ·· Scrollable list ·········································· */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">

            {/* Column headers */}
            <div className={`grid ${hasUpdatedDates ? "grid-cols-[1fr_100px_110px_28px]" : "grid-cols-[1fr_100px_28px]"} px-5 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0`}>
              <span className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider">Document</span>
              <span className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider">Type</span>
              {hasUpdatedDates && (
                <span className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider">Updated</span>
              )}
              <span />
            </div>

            {/* Rows */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="px-5 py-12 text-center text-[13px] text-gray-400">
                  No documents match your search.
                </div>
              ) : (
                <ul>
                  {filtered.map((doc) => {
                    const isSelected = selected?.id === doc.id;
                    const dateLabel = relativeDate(doc.updatedAt);
                    return (
                      <li key={doc.id}>
                        <button
                          onClick={() => setSelected(doc)}
                          className={[
                            `w-full grid ${hasUpdatedDates ? "grid-cols-[1fr_100px_110px_28px]" : "grid-cols-[1fr_100px_28px]"} items-center px-5 py-3.5`,
                            "text-left transition-colors duration-100 outline-none",
                            "border-b border-gray-50 last:border-b-0",
                            isSelected ? "text-white" : "hover:bg-gray-50",
                          ].join(" ")}
                          style={isSelected ? { background: "#2175D9" } : {}}
                        >
                          {/* Name */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={[
                              "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                              isSelected ? "bg-white/10" : "bg-gray-100",
                            ].join(" ")}>
                              <FileText className={["w-3.5 h-3.5", isSelected ? "text-white" : "text-gray-500"].join(" ")} />
                            </div>
                            <span className={[
                              "text-[13px] font-medium truncate",
                              isSelected ? "text-white" : "text-gray-900",
                            ].join(" ")}>
                              {doc.title}
                            </span>
                          </div>

                          {/* Type */}
                          <span className={[
                            "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border w-fit",
                            isSelected
                              ? "bg-white/10 text-white border-white/20"
                              : (TYPE_BADGE[doc.type] ?? TYPE_BADGE.Custom),
                          ].join(" ")}>
                            {doc.type}
                          </span>

                          {/* Updated date — only rendered when column is visible */}
                          {hasUpdatedDates && (
                            <span className={["text-[12px]", isSelected ? "text-white/60" : "text-gray-400"].join(" ")}>
                              {dateLabel}
                            </span>
                          )}

                          {/* Check icon */}
                          <div className="flex justify-end">
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
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
