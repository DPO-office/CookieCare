/**
 * PromptSuggestionCard — Suggested prompt tile.
 *
 * Dense, scannable. Icon + label on one line, description on the next.
 * Hover reveals a subtle brand-left-border accent.
 * Follows the LORA Design System.
 */
import React from "react";
import { type LucideIcon, ArrowUpRight } from "lucide-react";

interface PromptSuggestionCardProps {
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
}

export function PromptSuggestionCard({
  label,
  description,
  icon: Icon,
  onClick,
  className,
}: PromptSuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex items-start gap-3 p-4 rounded-xl text-left w-full cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9] focus-visible:ring-offset-1 overflow-hidden ${className ?? ""}`}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E4E7",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        fontFamily: "var(--font-sans)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "#BFDBFE";
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "#E4E4E7";
        el.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
      }}
    >
      {/* Left accent bar — visible on hover */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ background: "#2175D9" }}
        aria-hidden="true"
      />

      {/* Icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "#F3F4F6" }}
        aria-hidden="true"
      >
        <Icon
          className="w-3.5 h-3.5 transition-colors duration-150"
          style={{ color: "#6B7280" }}
          strokeWidth={1.5}
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-semibold leading-snug mb-0.5"
          style={{ color: "#111827" }}
        >
          {label}
        </p>
        <p
          className="text-[12px] leading-relaxed line-clamp-2"
          style={{ color: "#6B7280" }}
        >
          {description}
        </p>
      </div>

      {/* Arrow — appears on hover */}
      <ArrowUpRight
        className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        style={{ color: "#2175D9" }}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}

export default PromptSuggestionCard;
