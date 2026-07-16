import React from "react";
import { Globe, ArrowRight, AlertCircle } from "lucide-react";

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
      {/* OR divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[11px] font-bold text-gray-400 tracking-widest uppercase select-none px-1">
          OR
        </span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* URL input row */}
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          {/* Input wrapper */}
          <div
            className={`relative flex items-center bg-white border rounded-[14px] shadow-xs transition-all duration-200 overflow-hidden
              ${error
                ? "border-red-300 ring-1 ring-red-200"
                : "border-gray-200 hover:border-gray-300 focus-within:border-gray-400 focus-within:shadow-sm focus-within:ring-1 focus-within:ring-gray-200"
              }`}
          >
            {/* Globe icon */}
            <div className="pl-3.5 pr-2 shrink-0 flex items-center">
              <Globe
                className={`w-[15px] h-[15px] transition-colors duration-150 ${
                  error ? "text-red-400" : "text-gray-400"
                }`}
              />
            </div>

            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://company.com"
              spellCheck={false}
              autoComplete="off"
              className="flex-1 py-3 pr-3.5 text-[13.5px] font-medium text-gray-900 placeholder:text-gray-400 bg-transparent border-none outline-none focus:ring-0 min-w-0"
            />
          </div>

          {/* Inline error */}
          {error && (
            <div className="flex items-center gap-1.5 mt-2 px-0.5">
              <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
              <p className="text-[11.5px] text-red-500 font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Analyze Website button */}
        <button
          onClick={onAnalyze}
          disabled={!value.trim()}
          className={`shrink-0 flex items-center gap-2 px-4 py-3 rounded-[14px] text-[13px] font-semibold transition-all duration-200 whitespace-nowrap
            ${value.trim()
              ? "bg-gray-900 text-white hover:bg-gray-800 shadow-sm hover:shadow-md active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Analyze Website
          {value.trim() && (
            <ArrowRight className="w-3.5 h-3.5 -ml-0.5" />
          )}
        </button>
      </div>

      {/* Helper text */}
      <p className="mt-3 text-[12px] text-gray-400 leading-relaxed">
        Upload documents, provide a website URL, or use both for a more comprehensive AI assessment.
      </p>
    </div>
  );
}
