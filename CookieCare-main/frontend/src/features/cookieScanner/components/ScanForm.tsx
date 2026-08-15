import React from "react";
import { Globe, Layers, Sparkles, RefreshCw, Play, ChevronDown } from "lucide-react";
import { ScanDepth } from "../types";
import { CARD_SHADOW, SCAN_DEPTHS } from "../constants";

interface ScanFormProps {
  url: string;
  scanDepth: ScanDepth;
  scanning: boolean;
  onUrlChange: (url: string) => void;
  onDepthChange: (depth: ScanDepth) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const fieldClass =
  "w-full rounded-[16px] border-none bg-[#F7F8FB] py-2.5 pl-10 pr-4 text-[13px] text-[#1a1a1a] outline-none transition focus:bg-white focus:shadow-[0_0_0_1.5px_#8e98ff,0_8px_24px_rgba(96,107,235,0.08)] disabled:opacity-50";

export default function ScanForm({
  url,
  scanDepth,
  scanning,
  onUrlChange,
  onDepthChange,
  onSubmit,
}: ScanFormProps) {
  return (
    <div className="mb-8 rounded-[24px] bg-white p-7" style={{ boxShadow: CARD_SHADOW }}>
      <h2 className="mb-5 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
        Audit settings
      </h2>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label
              htmlFor="scan-url"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]"
            >
              Website URL
            </label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5BD9]" />
              <input
                id="scan-url"
                type="text"
                required
                disabled={scanning}
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="e.g. www.example.com"
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="scan-depth"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]"
            >
              Scan depth
            </label>
            <div className="relative">
              <Layers className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5BD9]" />
              <select
                id="scan-depth"
                className={`${fieldClass} cursor-pointer appearance-none pr-9`}
                value={scanDepth}
                disabled={scanning}
                onChange={(e) => onDepthChange(e.target.value as ScanDepth)}
              >
                {SCAN_DEPTHS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#98A2B3]" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[12px] text-[#667085]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <span>Includes consent bypass checking and dynamic policy matching.</span>
          </div>
          <button
            id="start-scanning-btn"
            type="submit"
            disabled={scanning}
            className="primary-gradient inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-none px-6 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                Run audit
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
