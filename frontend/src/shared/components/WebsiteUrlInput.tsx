import React from "react";

interface WebsiteUrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  error?: string;
}

function validateUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "URL must start with http:// or https://";
    }
    if (!url.hostname || url.hostname.length < 3) {
      return "Please enter a valid domain (e.g. https://company.com)";
    }
    return null;
  } catch {
    return "Please enter a valid URL (e.g. https://company.com)";
  }
}

export { validateUrl };

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

export function WebsiteUrlInput({
  value,
  onChange,
  onAnalyze,
  error,
}: WebsiteUrlInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) onAnalyze();
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E4E7EC]" />
        <span className="select-none px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
          Or
        </span>
        <div className="h-px flex-1 bg-[#E4E7EC]" />
      </div>

      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div
            className={`flex items-center rounded-full bg-white px-4 transition-shadow ${
              error ? "ring-1 ring-[#B54A45]" : ""
            }`}
            style={{ boxShadow: CARD_SHADOW }}
          >
            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://company.com"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 border-none bg-transparent py-3 text-[13.5px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3] focus:ring-0"
            />
          </div>
          {error && (
            <p className="mt-2 px-1 text-[12px] text-badge-red-text">{error}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={!value.trim()}
          className={`shrink-0 rounded-full px-4 py-3 text-[13px] font-semibold whitespace-nowrap transition-opacity ${
            value.trim()
              ? "primary-gradient cursor-pointer text-white hover:opacity-90"
              : "cursor-not-allowed bg-[#F2F4F7] text-[#98A2B3]"
          }`}
        >
          Analyze website
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-dark-200">
        Upload documents, provide a website URL, or use both for a more complete assessment.
      </p>
    </div>
  );
}
