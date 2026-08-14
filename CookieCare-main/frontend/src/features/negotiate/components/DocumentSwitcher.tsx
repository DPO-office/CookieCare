import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText } from "lucide-react";
import { LegalDocument } from "../../../shared/types";

interface DocumentSwitcherProps {
  documents: LegalDocument[];
  selectedId: string;
  onSelect: (docId: string) => void;
}

function splitTitle(title: string) {
  const match = title.match(/^(.*?)(?:\s[-–—]\s)(.+)$/);
  if (match) {
    return { name: match[1].trim(), meta: match[2].trim() };
  }
  return { name: title, meta: "" };
}

export default function DocumentSwitcher({
  documents,
  selectedId,
  onSelect,
}: DocumentSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = documents.find((d) => d.id === selectedId) ?? documents[0];
  const selectedParts = splitTitle(selected?.title ?? "Select document");

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 max-w-[280px] cursor-pointer items-center gap-2 rounded-full border-none bg-white px-3 font-sans text-left"
        style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-[#4F5BD9]" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#1a1a1a]">
          {selectedParts.name}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#98A2B3] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="negotiate-scroll scrollbar-hide absolute right-0 z-50 mt-2 max-h-[320px] w-[min(360px,calc(100vw-48px))] overflow-y-auto bg-white p-2 font-sans"
          style={{
            borderRadius: 22,
            boxShadow:
              "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 16px 40px rgba(16,24,40,0.10)",
          }}
        >
          {documents.map((doc) => {
            const isActive = doc.id === selectedId;
            const parts = splitTitle(doc.title);
            return (
              <button
                key={doc.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onSelect(doc.id);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-start gap-2.5 rounded-[16px] border-none px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-[#111827] text-white"
                    : "bg-transparent text-[#1a1a1a] hover:bg-[#EEF2FF]"
                }`}
              >
                <FileText
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isActive ? "text-white/80" : "text-[#4F5BD9]"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-snug">
                    {parts.name}
                  </span>
                  {parts.meta && (
                    <span
                      className={`mt-0.5 block truncate text-[11px] ${
                        isActive ? "text-white/65" : "text-[#98A2B3]"
                      }`}
                    >
                      {parts.meta}
                    </span>
                  )}
                </span>
                {isActive && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
