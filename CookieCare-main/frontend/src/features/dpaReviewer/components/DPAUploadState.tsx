import React, { useState, useRef, useEffect, useCallback } from "react";
import { FEATURE_CARDS } from "../constants";

interface DPAUploadStateProps {
  onFileSelected: (file: File) => void;
  uploadError?: string;
}

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

export function DPAUploadState({ onFileSelected, uploadError }: DPAUploadStateProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="dpa-results-bg flex-1 overflow-y-auto">
      <div
        className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "none" : "translateY(8px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
      >
        <div className="mb-8 max-w-2xl">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
            Data processing agreement reviewer
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-dark-200">
            Upload your DPA for a structured review covering GDPR compliance, processor
            obligations, security requirements, contractual risks, and missing clauses —
            with a comprehensive compliance report on completion.
          </p>
        </div>

        {uploadError && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-badge-red px-4 py-3">
            <img src="/icons/warning.svg" alt="" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[13px] text-badge-red-text">{uploadError}</p>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`mb-10 cursor-pointer rounded-[24px] bg-white px-8 py-12 text-center transition-all duration-200 ${
            dragging ? "inset-shadow" : ""
          }`}
          style={{
            boxShadow: dragging
              ? "0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08)"
              : CARD_SHADOW,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt"
            onChange={handleFile}
          />
          <img
            src="/icons/info.svg"
            alt=""
            className="mx-auto mb-4 h-12 w-12 object-contain"
          />
          <h3 className="mb-1.5 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            {dragging ? "Drop your DPA to start analysis" : "Drag & drop your DPA here"}
          </h3>
          <p className="mb-6 text-[13px] text-dark-200">
            or{" "}
            <span className="font-medium text-[#4F5BD9] underline underline-offset-2">
              browse files
            </span>{" "}
            from your computer
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["PDF", "DOCX", "TXT"].map((fmt) => (
              <span
                key={fmt}
                className="score-badge bg-[#F7F8FB] text-[11px] font-medium text-dark-200"
              >
                {fmt}
              </span>
            ))}
            <span className="pl-1 text-[11px] text-[#98A2B3]">
              Max 25 MB · Up to 200 pages
            </span>
          </div>
        </div>

        <div className="mb-5">
          <h2 className="text-[22px] font-semibold tracking-tight text-[#1a1a1a]">
            What we&apos;ll analyze
          </h2>
          <p className="mt-1 text-[13px] text-dark-200">
            Six compliance dimensions, scored after review.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="flex min-h-[168px] flex-col rounded-[22px] bg-white p-5"
                style={{
                  boxShadow: CARD_SHADOW,
                  transitionDelay: `${i * 12}ms`,
                }}
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  {card.title}
                </h3>
                <p className="text-[13px] leading-[1.55] text-dark-200">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
