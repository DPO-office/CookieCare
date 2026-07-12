import React from "react";
import { PromptTab } from "../types";
import { PromptLibraryItem } from "../hooks/useAnalyzeData";

interface PromptPanelProps {
  promptTab: PromptTab;
  customPromptText: string;
  promptLibrary: PromptLibraryItem[];
  questionsLibrary: string[];
  onSetPromptTab: (tab: PromptTab) => void;
  onSetCustomPromptText: (text: string) => void;
}

export default function PromptPanel({
  promptTab,
  customPromptText,
  promptLibrary,
  questionsLibrary,
  onSetPromptTab,
  onSetCustomPromptText,
}: PromptPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
      <div className="mb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">2</span>
          <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Write your prompt</h3>
        </div>
        <p className="text-xs text-gray-400 ml-7 leading-relaxed">Configure your audit parameters or apply a pre-built query</p>
      </div>

      <div className="flex gap-1 mb-5 bg-gray-50 border border-gray-200 rounded-xl p-1">
        {(["write", "library", "questions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onSetPromptTab(tab)}
            className={`flex-1 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 ${
              promptTab === tab
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab === "write" && "Custom"}
            {tab === "library" && "Prompt Library"}
            {tab === "questions" && "Questions"}
          </button>
        ))}
      </div>

      {promptTab === "write" && (
        <textarea
          rows={5}
          value={customPromptText}
          onChange={(e) => onSetCustomPromptText(e.target.value)}
          placeholder="Describe what you want the AI to analyze..."
          className="w-full text-[13px] text-gray-700 border border-gray-200 bg-gray-50/50 p-4 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 rounded-xl placeholder:text-gray-400 resize-none leading-relaxed transition-shadow"
        />
      )}

      {promptTab === "library" && (
        <div className="space-y-1.5">
          {promptLibrary.map((item, idx) => (
            <div
              key={idx}
              onClick={() => { onSetCustomPromptText(item.prompt); onSetPromptTab("write"); }}
              className="group px-4 py-3 border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 cursor-pointer transition-all rounded-xl flex justify-between items-center gap-4"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-800 truncate">{item.title}</p>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.prompt}</p>
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-gray-700 shrink-0 transition-colors">Apply →</span>
            </div>
          ))}
        </div>
      )}

      {promptTab === "questions" && (
        <div className="space-y-1.5">
          {questionsLibrary.map((q, idx) => (
            <div
              key={idx}
              onClick={() => { onSetCustomPromptText(q); onSetPromptTab("write"); }}
              className="group px-4 py-3 border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 cursor-pointer transition-all rounded-xl flex justify-between items-center gap-4"
            >
              <span className="text-[13px] text-gray-700">{q}</span>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-gray-700 shrink-0 transition-colors">Use →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
