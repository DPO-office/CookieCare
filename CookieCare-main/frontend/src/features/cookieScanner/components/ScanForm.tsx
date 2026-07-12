import React from "react";
import { Globe, Layers, Sparkles, RefreshCw, Play } from "lucide-react";
import { ScanDepth } from "../types";
import { SCAN_DEPTHS } from "../constants";

interface ScanFormProps {
  url: string;
  scanDepth: ScanDepth;
  scanning: boolean;
  onUrlChange: (url: string) => void;
  onDepthChange: (depth: ScanDepth) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ScanForm({ url, scanDepth, scanning, onUrlChange, onDepthChange, onSubmit }: ScanFormProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-7 mb-8">
      <h2 className="font-bold text-[14px] text-gray-900 mb-5">Audit settings</h2>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Website URL</label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                id="scan-url"
                type="text"
                required
                disabled={scanning}
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="e.g. www.example.com"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-[13px] text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Scan depth</label>
            <div className="relative">
              <Layers className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                id="scan-depth"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-[13px] text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition appearance-none cursor-pointer"
                value={scanDepth}
                onChange={(e) => onDepthChange(e.target.value as ScanDepth)}
              >
                {SCAN_DEPTHS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-[12px] text-gray-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Includes consent bypass checking and dynamic policy matching.</span>
          </div>
          <button
            id="start-scanning-btn"
            type="submit"
            disabled={scanning}
            className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl py-2.5 px-6 text-[13px] font-semibold transition shadow-xs hover:shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {scanning ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /><span>Scanning…</span></>
            ) : (
              <><Play className="w-3.5 h-3.5 fill-current" /><span>Run audit</span></>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
