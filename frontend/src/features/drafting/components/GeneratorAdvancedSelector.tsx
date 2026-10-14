import React from "react";
import { AdvancedStep } from "../types";

interface GeneratorAdvancedSelectorProps {
  onSetAdvancedStep: (step: AdvancedStep) => void;
}

export default function GeneratorAdvancedSelector({ onSetAdvancedStep }: GeneratorAdvancedSelectorProps) {
  return (
    <div className="text-center pt-8 max-w-2xl mx-auto">
      <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">Are you drafting in response to something?</h2>
      <p className="text-[13px] text-gray-500 mt-2 mb-8">Select a mode to proceed.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          onClick={() => onSetAdvancedStep("reactive")}
          className="border border-gray-200 bg-white p-7 rounded-[18px] hover:border-gray-400 hover:shadow-md text-left cursor-pointer transition flex items-start gap-4 group"
        >
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-gray-900 transition-colors">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-100" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-[14px]">Reactive drafting</h4>
            <p className="text-[12px] text-gray-500 leading-relaxed mt-2">
              Draft a response to a notice, petition, or other legal document. Upload the document you're responding to, along with any reference files.
            </p>
          </div>
        </div>

        <div
          onClick={() => onSetAdvancedStep("proactive")}
          className="border border-gray-200 bg-white p-7 rounded-[18px] hover:border-gray-400 hover:shadow-md text-left cursor-pointer transition flex items-start gap-4 group"
        >
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-gray-900 transition-colors">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-100" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-[14px]">Proactive drafting</h4>
            <p className="text-[12px] text-gray-500 leading-relaxed mt-2">
              Creating a first-instance draft like a contract or agreement, petition, or any other legal document.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
