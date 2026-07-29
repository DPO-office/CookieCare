import React from "react";
import type { SkillStatus } from "./types/skill";

interface StatusBadgeProps {
  status: SkillStatus;
}

interface CategoryBadgeProps {
  label: string;
}

const STATUS_CONFIG: Record<
  SkillStatus,
  { label: string; className: string }
> = {
  ready: {
    label: "Ready",
    className: "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]",
  },
  beta: {
    label: "Beta",
    className: "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]",
  },
  "coming-soon": {
    label: "Coming Soon",
    className: "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide ${cfg.className}`}
    >
      {status === "ready" && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#059669] inline-block" />
      )}
      {cfg.label}
    </span>
  );
}

export function CategoryBadge({ label }: CategoryBadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#F5F3FF] text-[#6D28D9] border border-[#EDE9FE]">
      {label}
    </span>
  );
}
