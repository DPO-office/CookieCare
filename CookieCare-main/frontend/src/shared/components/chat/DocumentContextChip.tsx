/**
 * DocumentContextChip — Reusable context indicator chip.
 *
 * Shows an active context selection (jurisdiction, document, format, etc.)
 * as a compact chip in the composer toolbar. Follows the RandTrust Design System.
 */
import React from "react";
import { X, type LucideIcon } from "lucide-react";

interface DocumentContextChipProps {
  label: string;
  icon?: LucideIcon;
  /** If true, chip renders in "active" brand-blue state */
  active?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

export function DocumentContextChip({
  label,
  icon: Icon,
  active = false,
  onRemove,
  onClick,
  className,
}: DocumentContextChipProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium transition-all duration-100 select-none ${className ?? ""}`}
      style={{
        padding: "3px 8px 3px 7px",
        background: active ? "#EBF2FD" : "#F3F4F6",
        border: `1px solid ${active ? "#BFDBFE" : "#E4E4E7"}`,
        color: active ? "#1A5BAD" : "#374151",
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      {Icon && (
        <Icon
          className="w-3 h-3 shrink-0"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${label}`}
          className="w-3.5 h-3.5 flex items-center justify-center rounded-full transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2175D9]"
          style={{ color: active ? "#1A5BAD" : "#6B7280" }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#DC2626"}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = active ? "#1A5BAD" : "#6B7280"}
        >
          <X className="w-2.5 h-2.5" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default DocumentContextChip;
