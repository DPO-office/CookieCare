import React from "react";
import { Upload, Play } from "lucide-react";
import { AdvancedStep } from "../types";

interface GeneratorAdvancedReactiveProps {
  isDragging: boolean;
  uploadFileName: string;
  advancedFields: any[];
  advancedFieldValues: Record<string, string>;
  instructions: string;
  onSetAdvancedStep: (step: AdvancedStep) => void;
  onSetInstructions: (inst: string) => void;
  onSetAdvancedFieldValues: (vals: Record<string, string>) => void;
  onHandleDragOver: (e: React.DragEvent) => void;
  onHandleDragLeave: () => void;
  onHandleDrop: (e: React.DragEvent) => void;
  onHandleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExecuteDraftStream: () => void;
}

export default function GeneratorAdvancedReactive({
  isDragging,
  uploadFileName,
  advancedFields,
  advancedFieldValues,
  instructions,
  onSetAdvancedStep,
  onSetInstructions,
  onSetAdvancedFieldValues,
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
            <label className="inline-block bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 text-[12px] font-semibold rounded-xl transition cursor-pointer shadow-xs">
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

        {/* Extracted variables */}
        {advancedFields.length > 0 && (
          <div className="space-y-4">
            <div className="border-b border-gray-100 pb-2.5">
              <span className="text-[10px] bg-emerald-500 text-white font-mono uppercase px-2 py-0.5 rounded font-bold tracking-wide">Shield Extractor Vetted</span>
              <h4 className="font-bold text-[13px] text-gray-900 mt-2.5">Extracted blueprints checklist</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {advancedFields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider">{field.name}</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-[12px] text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300"
                    value={advancedFieldValues[field.id] || ""}
                    onChange={(e) => onSetAdvancedFieldValues({ ...advancedFieldValues, [field.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
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
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold text-[13px] px-6 py-2.5 rounded-xl shadow-xs hover:shadow-sm transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Stream Response</span>
          </button>
        </div>
      </div>
    </div>
  );
}
