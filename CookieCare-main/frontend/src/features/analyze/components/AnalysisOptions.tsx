import React from "react";
import { Play } from "lucide-react";
import { DocumentMode, AnswerStyle } from "../types";

interface AnalysisOptionsProps {
  documentMode: DocumentMode;
  answerStyle: AnswerStyle;
  onSetDocumentMode: (mode: DocumentMode) => void;
  onSetAnswerStyle: (style: AnswerStyle) => void;
  onRunAnalysis: () => void;
}

function RadioCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className={`border rounded-xl px-4 py-3.5 transition-all cursor-pointer flex items-start gap-3 ${
        selected
          ? "border-gray-900 bg-gray-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/40"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? "border-gray-900 bg-gray-900" : "border-gray-300"}`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function AnalysisOptions({ documentMode, answerStyle, onSetDocumentMode, onSetAnswerStyle, onRunAnalysis }: AnalysisOptionsProps) {
  return (
    <>
      {/* Document mode */}
      <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
        <div className="mb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">3</span>
            <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Document mode</h3>
          </div>
          <p className="text-xs text-gray-400 ml-7 leading-relaxed">Run the prompt across all documents together, or individually per file</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <RadioCard selected={documentMode === "unified"} onClick={() => onSetDocumentMode("unified")}>
            <div>
              <h4 className="text-[13px] font-semibold text-gray-800">Unified</h4>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">All selected files as a single knowledge context</p>
            </div>
          </RadioCard>
          <RadioCard selected={documentMode === "individual"} onClick={() => onSetDocumentMode("individual")}>
            <div>
              <h4 className="text-[13px] font-semibold text-gray-800">Individual</h4>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">Prompt runs on each file separately</p>
            </div>
          </RadioCard>
        </div>
      </div>

      {/* Answer style */}
      <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
        <div className="mb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold shrink-0">4</span>
            <h3 className="text-[13px] font-semibold text-gray-800 tracking-tight">Output format</h3>
          </div>
          <p className="text-xs text-gray-400 ml-7 leading-relaxed">Choose how the AI structures its response</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <RadioCard selected={answerStyle === "narrative"} onClick={() => onSetAnswerStyle("narrative")}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-9 border border-gray-200 bg-gray-50 p-1.5 flex flex-col justify-between shrink-0 rounded-lg select-none">
                <div className="h-0.5 bg-gray-300 w-full rounded" />
                <div className="h-0.5 bg-gray-300 w-3/4 rounded" />
                <div className="h-0.5 bg-gray-300 w-5/6 rounded" />
                <div className="h-0.5 bg-gray-300 w-1/2 rounded" />
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-gray-800">Narrative</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Consolidated prose response</p>
              </div>
            </div>
          </RadioCard>
          <RadioCard selected={answerStyle === "tabular"} onClick={() => onSetAnswerStyle("tabular")}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-9 border border-gray-200 bg-gray-50 p-1 flex flex-col justify-between shrink-0 rounded-lg select-none">
                <div className="grid grid-cols-3 gap-0.5 h-1.5"><div className="bg-gray-400 rounded" /><div className="bg-gray-300 rounded" /><div className="bg-gray-300 rounded" /></div>
                <div className="grid grid-cols-3 gap-0.5 h-1.5"><div className="bg-gray-400 rounded" /><div className="bg-gray-200 rounded" /><div className="bg-gray-200 rounded" /></div>
                <div className="grid grid-cols-3 gap-0.5 h-1.5"><div className="bg-gray-400 rounded" /><div className="bg-gray-200 rounded" /><div className="bg-gray-200 rounded" /></div>
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-gray-800">Tabular</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Structured rows per document</p>
              </div>
            </div>
          </RadioCard>
        </div>
      </div>

      <div className="flex justify-end pt-2 pb-8">
        <button
          onClick={onRunAnalysis}
          className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-[13px] font-semibold py-2.5 px-7 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
        >
          <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
          <span>Run Analysis</span>
        </button>
      </div>
    </>
  );
}
