import { useState, useRef, useEffect } from "react";
import { FEATURE_CARDS } from "../constants";
import { WebsiteUrlInput, validateUrl } from "../../../shared/components/WebsiteUrlInput";
import { useFileUpload } from "../../vendorReview/hooks/useFileUpload";

interface EthicsUploadStateProps {
  onFilesSelected: (files: File[], websiteUrl?: string) => void;
  error?: string;
}

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

const DOCUMENT_TYPES = [
  "AI policy",
  "Model documentation",
  "Risk assessment",
  "System architecture",
  "Data governance policy",
  "AI impact assessment",
];

export function EthicsUploadState({ onFilesSelected, error }: EthicsUploadStateProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [urlError, setUrlError] = useState<string | undefined>();
  const { uploadedFiles, dragging, addFiles, removeFile, setDragging } = useFileUpload();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleUrlChange = (val: string) => {
    setWebsiteUrl(val);
    if (urlError) setUrlError(undefined);
  };

  const handleAnalyze = () => {
    if (uploadedFiles.length > 0) {
      onFilesSelected(uploadedFiles.map((entry) => entry.file), websiteUrl.trim() || undefined);
    }
  };

  const handleAnalyzeWebsite = () => {
    const err = validateUrl(websiteUrl);
    if (err) {
      setUrlError(err);
      return;
    }
    setUrlError(undefined);
    onFilesSelected(uploadedFiles.map((entry) => entry.file), websiteUrl.trim());
  };

  const hasFiles = uploadedFiles.length > 0;
  const hasUrl = websiteUrl.trim() !== "" && !validateUrl(websiteUrl);
  const analyzeLabel = (() => {
    if (hasFiles && hasUrl) {
      return `Analyze ${uploadedFiles.length} document${uploadedFiles.length !== 1 ? "s" : ""} + website`;
    }
    if (hasFiles) return `Analyze ${uploadedFiles.length} document${uploadedFiles.length !== 1 ? "s" : ""}`;
    if (hasUrl) return "Analyze website";
    return null;
  })();

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
            AI ethics score
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-dark-200">
            Upload AI documentation for a structured evaluation covering fairness, transparency,
            accountability, governance, privacy, and responsible AI practices.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-badge-red px-4 py-3">
            <img src="/icons/warning.svg" alt="" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[13px] text-badge-red-text">{error}</p>
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
          className={`mb-6 cursor-pointer rounded-[24px] bg-white px-8 py-12 text-center transition-all duration-200 ${
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
            multiple
            onChange={handleFile}
          />
          <img src="/icons/info.svg" alt="" className="mx-auto mb-4 h-12 w-12 object-contain" />
          <h3 className="mb-1.5 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            {dragging ? "Drop your AI documentation to begin" : "Drag & drop your AI documentation here"}
          </h3>
          <p className="mb-6 text-[13px] text-dark-200">
            or{" "}
            <span className="font-medium text-[#4F5BD9] underline underline-offset-2">browse files</span>{" "}
            from your computer
          </p>
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            {DOCUMENT_TYPES.map((dt) => (
              <span key={dt} className="score-badge bg-[#F7F8FB] text-[11px] font-medium text-dark-200">
                {dt}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["PDF", "DOCX", "TXT"].map((fmt) => (
              <span key={fmt} className="score-badge bg-[#F7F8FB] text-[11px] font-medium text-dark-200">
                {fmt}
              </span>
            ))}
            <span className="pl-1 text-[11px] text-[#98A2B3]">Max 25 MB</span>
          </div>
        </div>

        <div className="mb-6">
          <WebsiteUrlInput
            value={websiteUrl}
            onChange={handleUrlChange}
            onAnalyze={handleAnalyzeWebsite}
            error={urlError}
          />
        </div>

        {(hasFiles || hasUrl) && (
          <div className="mb-8 space-y-2">
            {hasFiles && (
              <>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                  Queued for analysis
                </p>
                {uploadedFiles.map(({ file, id }) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ boxShadow: CARD_SHADOW }}
                  >
                    <img src="/icons/info.svg" alt="" className="h-8 w-8 shrink-0 object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{file.name}</p>
                      <p className="text-[11px] text-dark-200">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(id);
                      }}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-[#F7F8FB]"
                      aria-label={`Remove ${file.name}`}
                    >
                      <img src="/icons/cross.svg" alt="" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
            {analyzeLabel && (
              <button
                type="button"
                onClick={hasFiles ? handleAnalyze : handleAnalyzeWebsite}
                className="mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-full primary-gradient px-4 py-3 text-[13px] font-semibold text-white hover:opacity-90"
              >
                {analyzeLabel}
              </button>
            )}
          </div>
        )}

        <div className="mb-5">
          <h2 className="text-[22px] font-semibold tracking-tight text-[#1a1a1a]">What we&apos;ll analyze</h2>
          <p className="mt-1 text-[13px] text-dark-200">Six responsible AI dimensions evaluated.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="flex min-h-[168px] flex-col rounded-[22px] bg-white p-5"
                style={{ boxShadow: CARD_SHADOW, transitionDelay: `${i * 12}ms` }}
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">{card.title}</h3>
                <p className="text-[13px] leading-[1.55] text-dark-200">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
