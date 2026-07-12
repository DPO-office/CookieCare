import React from "react";
import { HelpCircle, ChevronDown, ArrowRight } from "lucide-react";
import { DraftDepth } from "../types";

interface GeneratorBasicModeProps {
  instructions: string;
  playbookGuidelines: string;
  depth: DraftDepth;
  isStreaming: boolean;
  onSetInstructions: (inst: string) => void;
  onSetPlaybookGuidelines: (guide: string) => void;
  onSetDepth: (depth: DraftDepth) => void;
  onExecuteDraftStream: () => void;
}

export default function GeneratorBasicMode({
  instructions,
  playbookGuidelines,
  depth,
  isStreaming,
  onSetInstructions,
  onSetPlaybookGuidelines,
  onSetDepth,
  onExecuteDraftStream,
}: GeneratorBasicModeProps) {
  return (
    <div className="w-full space-y-5 z-10">
      {/* 1. Provide draft input */}
      <div className="bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
          <h3 className="text-[13px] font-semibold text-gray-900">Provide draft input <span className="text-red-400">*</span></h3>
          <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 ml-7.5">Define what you want to create and provide the necessary context.</p>
        <textarea
          rows={4}
          value={instructions}
          onChange={(e) => onSetInstructions(e.target.value)}
          placeholder="e.g. Draft a reply to a breach notice, a shareholder agreement with vesting terms, or a legal notice based on the attached facts."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition resize-none"
        />
      </div>

      {/* 2. Set drafting instructions */}
      <div className="bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
          <h3 className="text-[13px] font-semibold text-gray-900">Set drafting instructions</h3>
          <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 ml-7.5">Set tone, structure, and any specific requirements.</p>
        <textarea
          rows={4}
          value={playbookGuidelines}
          onChange={(e) => onSetPlaybookGuidelines(e.target.value)}
          placeholder="e.g. Use formal legal tone, favour the client, include strong indemnity and limitation clauses."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition resize-none"
        />
      </div>

      {/* 3. Output detail level */}
      <div className="bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs space-y-3 max-w-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
          <h3 className="text-[13px] font-semibold text-gray-900">Output detail level</h3>
        </div>
        <div className="relative">
          <select
            value={depth}
            onChange={(e: any) => onSetDepth(e.target.value)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition cursor-pointer"
          >
            <option value="Short">Short output (~500 words)</option>
            <option value="Standard">Standard format (~1,000 words)</option>
            <option value="Deep">Detailed output (~1,500–2,000 words)</option>
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3.5 top-3 pointer-events-none" />
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2 pb-8 flex justify-start">
        <button
          onClick={onExecuteDraftStream}
          disabled={isStreaming}
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold px-6 py-2.5 rounded-xl transition shadow-xs hover:shadow-sm disabled:opacity-40 cursor-pointer"
        >
          <span>Generate draft</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
