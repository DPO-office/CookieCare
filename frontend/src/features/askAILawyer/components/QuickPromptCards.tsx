import React from "react";
import { ChevronRight } from "lucide-react";
import { QUICK_PROMPTS } from "../constants";

interface QuickPromptCardsProps {
  onSelect: (prompt: string) => void;
}

export default function QuickPromptCards({ onSelect }: QuickPromptCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
      {QUICK_PROMPTS.map((qp) => (
        <button
          key={qp.label}
          type="button"
          onClick={() => onSelect(qp.prompt)}
          className="group relative flex items-start gap-3.5 p-4 bg-white text-left cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9]/30 rounded-2xl"
          style={{
            border: "1px solid #E4E4E7",
            boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "#BFDBFE";
            el.style.boxShadow = "0 4px 14px rgba(33,117,217,0.10), 0 1px 3px rgba(15,23,42,0.06)";
            el.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "#E4E4E7";
            el.style.boxShadow = "0 1px 3px rgba(15,23,42,0.05)";
            el.style.transform = "translateY(0)";
          }}
        >
          {/* Icon container */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-105"
            style={{
              background: "#EBF2FD",
              border: "1px solid #BFDBFE",
            }}
          >
            <qp.icon className="w-4 h-4" style={{ color: "#2175D9" }} />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1 pt-0.5">
            <span className="block text-[13px] font-semibold leading-snug mb-1" style={{ color: "#0F172A" }}>
              {qp.label}
            </span>
            <span className="block text-[12px] leading-relaxed" style={{ color: "#71717A" }}>
              {qp.description}
            </span>
          </div>

          {/* Arrow */}
          <ChevronRight
            className="w-3.5 h-3.5 shrink-0 mt-1 transition-all duration-200 group-hover:translate-x-0.5"
            style={{ color: "#D4D4D8" }}
          />
        </button>
      ))}
    </div>
  );
}
