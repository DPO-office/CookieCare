import { CompareDropZone } from "./CompareDropZone";
import { COMPARE_PAGE_STYLES } from "../styles/comparePageStyles";
import type { CompareFile, AgreementSlot } from "../types";
import { GitCompare } from "lucide-react";

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

interface CompareLandingPageProps {
  original: CompareFile | null;
  revised: CompareFile | null;
  canCompare: boolean;
  onFileSelect: (slot: AgreementSlot, file: File) => void;
  onRemove: (slot: AgreementSlot) => void;
  onReplace: (slot: AgreementSlot, file: File) => void;
  onCompare: () => void;
}

export function CompareLandingPage({
  original,
  revised,
  canCompare,
  onFileSelect,
  onRemove,
  onReplace,
  onCompare,
}: CompareLandingPageProps) {
  return (
    <>
      <style>{COMPARE_PAGE_STYLES}</style>
      <div className="compare-page dpa-results-bg flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-10 sm:px-10">
          <div className="mb-8 max-w-2xl">
            <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
              Legal Space · Compare
            </p>
            <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
              Compare agreements
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-[#667085]">
              Upload two versions of an agreement to highlight legal, commercial, and
              compliance differences — then review them side by side.
            </p>
          </div>

          <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2">
            <CompareDropZone
              slot="original"
              file={original}
              onFileSelect={onFileSelect}
              onRemove={onRemove}
              onReplace={onReplace}
            />
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:flex">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4F5BD9]"
                style={{ boxShadow: CARD_SHADOW }}
              >
                vs
              </span>
            </div>
            <CompareDropZone
              slot="revised"
              file={revised}
              onFileSelect={onFileSelect}
              onRemove={onRemove}
              onReplace={onReplace}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {["PDF", "DOC", "DOCX", "TXT"].map((fmt) => (
              <span
                key={fmt}
                className="score-badge bg-[#F7F8FB] text-[11px] font-medium text-[#667085]"
              >
                {fmt}
              </span>
            ))}
            <span className="pl-1 text-[11px] text-[#98A2B3]">Max 50 MB per file</span>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-[13px] text-[#667085]">
              {canCompare
                ? "Both agreements are ready to compare."
                : !original && !revised
                  ? "Add an original and a revised agreement to continue."
                  : `Add the ${!original ? "original" : "revised"} agreement to continue.`}
            </p>
            <button
              type="button"
              disabled={!canCompare}
              onClick={onCompare}
              className={`compare-btn inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border-none px-7 text-[14px] font-semibold ${
                canCompare
                  ? "primary-gradient text-white"
                  : "bg-[#F7F8FB] text-[#98A2B3]"
              } disabled:cursor-not-allowed`}
            >
              <GitCompare className="h-4 w-4" strokeWidth={1.75} />
              Compare
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
