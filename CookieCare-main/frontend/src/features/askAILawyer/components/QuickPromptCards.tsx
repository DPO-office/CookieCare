import React from "react";
import { ChevronRight } from "lucide-react";
import { QUICK_PROMPTS } from "../constants";

interface QuickPromptCardsProps {
  onSelect: (prompt: string) => void;
}

export default function QuickPromptCards({ onSelect }: QuickPromptCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
      {QUICK_PROMPTS.map((qp) => (
        <button
          key={qp.label}
          type="button"
          onClick={() => onSelect(qp.prompt)}
          className="group flex items-center gap-3 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-left cursor-pointer transition-all duration-150 hover:border-gray-300 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]/30"
        >
          <span className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 transition-colors duration-150 group-hover:bg-[#2175D9]/[0.07] group-hover:border-[#2175D9]/25">
            <qp.icon className="w-4 h-4 text-gray-500 transition-colors duration-150 group-hover:text-[#2175D9]" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-gray-900 leading-snug truncate">{qp.label}</span>
            <span className="block text-[11px] text-gray-500 leading-snug line-clamp-2">{qp.description}</span>
          </span>

          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0 transition-colors duration-150 group-hover:text-[#2175D9]" />
        </button>
      ))}
    </div>
  );
}
