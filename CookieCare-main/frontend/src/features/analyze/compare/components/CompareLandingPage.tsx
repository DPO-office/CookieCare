import { CompareDropZone } from "./CompareDropZone";
import { COMPARE_PAGE_STYLES } from "../styles/comparePageStyles";
import type { CompareFile, AgreementSlot } from "../types";

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
      <div className="compare-page flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6">
          <div className="w-full max-w-[640px] flex flex-col items-center">
            <h1 className="text-[22px] font-semibold text-[#18181B] tracking-[-0.02em] text-center mb-2">
              Compare agreements
            </h1>
            <p className="text-[14px] text-[#A1A1AA] text-center mb-8">
              Upload two documents to compare their content
            </p>

            <div className="compare-drop-container w-full flex flex-row">
              <CompareDropZone
                slot="original"
                file={original}
                onFileSelect={onFileSelect}
                onRemove={onRemove}
                onReplace={onReplace}
              />
              <div className="compare-divider" aria-hidden="true" />
              <CompareDropZone
                slot="revised"
                file={revised}
                onFileSelect={onFileSelect}
                onRemove={onRemove}
                onReplace={onReplace}
              />
            </div>

            <p className="mt-4 text-[12px] text-[#C4C4C4] text-center leading-relaxed">
              Supported formats: PDF, DOC, DOCX, XLS, XLSX, TXT, CSV (max 50MB per file)
            </p>

            <button
              type="button"
              disabled={!canCompare}
              onClick={onCompare}
              className="compare-btn w-full mt-8 h-11 rounded-full text-[14px] font-medium disabled:cursor-not-allowed"
              style={{
                background: canCompare ? "#18181B" : "#F4F4F5",
                color: canCompare ? "#FFFFFF" : "#A1A1AA",
              }}
            >
              Compare
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
