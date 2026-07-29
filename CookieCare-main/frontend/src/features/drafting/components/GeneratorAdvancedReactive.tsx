import React from "react";
import { Upload, Play } from "lucide-react";
import { AdvancedStep } from "../types";

interface GeneratorAdvancedReactiveProps {
  isDragging: boolean;
  uploadFileName: string;
  instructions: string;
  onSetAdvancedStep: (step: AdvancedStep) => void;
  onSetInstructions: (inst: string) => void;
  onHandleDragOver: (e: React.DragEvent) => void;
  onHandleDragLeave: () => void;
  onHandleDrop: (e: React.DragEvent) => void;
  onHandleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExecuteDraftStream: () => void;
}

export default function GeneratorAdvancedReactive({
  isDragging,
  uploadFileName,
  instructions,
  onSetAdvancedStep,
  onSetInstructions,
  onHandleDragOver,
  onHandleDragLeave,
  onHandleDrop,
  onHandleFileChange,
  onExecuteDraftStream,
}: GeneratorAdvancedReactiveProps) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-gray-200 p-5 rounded-[18px] shadow-xs flex justify-between items-center">
        <div>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Intake System</span>
          <h2 className="text-[15px] font-bold text-gray-900">Reactive ingestion</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Upload external legal claims & notices to run parameter extraction plans.</p>
        </div>
        <button
          onClick={() => onSetAdvancedStep("selector")}
          className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 bg-white rounded-xl text-[12px] font-semibold text-gray-700 shadow-xs transition cursor-pointer"
        >
          Change mode
        </button>
      </div>

      <div className="bg-white border border-gray-200 p-6 rounded-[18px] shadow-xs space-y-5">
        {/* Drag & drop area */}
        <div
          onDragOver={onHandleDragOver}
          onDragLeave={onHandleDragLeave}
          onDrop={onHandleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
            isDragging ? "bg-amber-50 border-amber-400 scale-[1.01]" : "border-gray-200 bg-gray-50/50 hover:bg-gray-50"
          }`}
        >
          <Upload className="w-9 h-9 text-gray-300 mx-auto mb-3" />
          <h4 className="font-bold text-[13px] text-gray-700">Drag & drop notice XML, TXT or PDF</h4>
          <p className="text-[12px] text-gray-400 mt-1">Accepts compliance forms or court notices</p>
          <div className="mt-4">
            <label className="inline-block text-white hover:opacity-90 px-4 py-2 text-[12px] font-semibold rounded-xl transition cursor-pointer shadow-xs" style={{ background: "#2175D9" }}>
              <span>Browse local folders</span>
              <input type="file" onChange={onHandleFileChange} className="hidden" />
            </label>
          </div>
        </div>

        {uploadFileName && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-[12px] flex justify-between items-center font-medium">
            <span>Sanitized: {uploadFileName}</span>
            <span className="text-[11px] text-emerald-600 font-mono">AES Secure</span>
          </div>
        )}

        <div className="space-y-1.5 pt-1">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Custom refinement rules</label>
          <textarea
            rows={3}
            placeholder="Define direct instructions to oppose this legal document..."
            value={instructions}
            onChange={(e) => onSetInstructions(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-3.5 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100 bg-gray-50/50"
          />
        </div>

        <div className="pt-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onExecuteDraftStream}
            className="inline-flex items-center gap-2 hover:opacity-90 text-white font-bold text-[13px] px-6 py-2.5 rounded-xl shadow-xs hover:shadow-sm transition cursor-pointer" style={{ background: "#2175D9" }}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Stream Response</span>
          </button>
        </div>
      </div>
    </div>
  );
}



