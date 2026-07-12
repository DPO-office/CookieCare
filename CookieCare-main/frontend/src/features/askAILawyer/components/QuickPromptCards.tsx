import React from "react";
import { QUICK_PROMPTS } from "../constants";

interface QuickPromptCardsProps {
  onSelect: (prompt: string) => void;
}

export default function QuickPromptCards({ onSelect }: QuickPromptCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
      {QUICK_PROMPTS.map((qp) => (
        <button
          key={qp.label}
          type="button"
          onClick={() => onSelect(qp.prompt)}
          className="group flex items-start gap-3 p-3.5 bg-white border border-gray-200 rounded-2xl hover:border-gray-300 hover:shadow-sm transition-all text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-900 group-hover:border-gray-900 transition-all">
            <qp.icon className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 mb-0.5">{qp.label}</p>
            <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{qp.prompt}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
