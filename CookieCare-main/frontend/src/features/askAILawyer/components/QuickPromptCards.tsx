import React from "react";
import { QUICK_PROMPTS } from "../constants";

interface QuickPromptCardsProps {
  onSelect: (prompt: string) => void;
}

export default function QuickPromptCards({ onSelect }: QuickPromptCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl">
      {QUICK_PROMPTS.map((qp) => (
        <button
          key={qp.label}
          type="button"
          onClick={() => onSelect(qp.prompt)}
          className="group relative flex flex-col gap-2.5 p-4 bg-white border border-gray-100 rounded-2xl hover:border-gray-300 hover:shadow-md transition-all duration-200 text-left cursor-pointer overflow-hidden"
        >
          {/* Subtle hover background accent */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 group-hover:border-transparent group-hover:shadow-sm transition-all duration-200">
              <qp.icon className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors duration-200" />
            </div>
            <div className="w-5 h-5 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 mt-0.5">
              <svg className="w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          <div className="relative min-w-0">
            <p className="text-sm font-semibold text-gray-900 mb-1 leading-snug">{qp.label}</p>
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{qp.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}


