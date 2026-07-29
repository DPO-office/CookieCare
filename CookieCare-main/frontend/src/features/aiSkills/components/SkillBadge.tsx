import React from "react";
import type { SkillStatus, SkillCategory } from "../types/skill";

/* ── Status badge ───────────────────────────────────────────────────────── */

interface StatusBadgeProps {
  status: SkillStatus;
}

const STATUS_CONFIG: Record<SkillStatus, { label: string; className: string; dot?: string }> = {
  ready: {
    label: "Ready",
    className: "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]",
    dot: "bg-[#059669]",
  },
  beta: {
    label: "Beta",
    className: "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]",
  },
  "coming-soon": {
    label: "Coming Soon",
    className: "bg-[#F4F4F5] text-[#A1A1AA] border border-[#E4E4E7]",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${cfg.className}`}
    >
      {cfg.dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
      )}
      {cfg.label}
    </span>
  );
}

/* ── Category badge ─────────────────────────────────────────────────────── */

interface CategoryBadgeProps {
  category: SkillCategory;
}

const CATEGORY_CONFIG: Record<SkillCategory, string> = {
  "Privacy & Compliance": "bg-[#F5F3FF] text-[#6D28D9] border border-[#EDE9FE]",
  Legal:                  "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]",
  Security:               "bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]",
  Governance:             "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]",
};

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${CATEGORY_CONFIG[category]}`}
    >
      {category}
    </span>
  );
}
