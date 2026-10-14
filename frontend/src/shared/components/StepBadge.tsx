import React from "react";
import { PRIMARY_BRAND } from "../theme/colors";

// ·· Size config ···············////////////////////////////////////////////////
// The line height always equals the circle height. That leaves zero free space
// for the browser to halve and round, which is what makes a number visibly
// drift off-centre between zoom levels. Pick the size that matches the heading
// it sits next to rather than inventing a new circle.
const SIZE_CONFIG = {
  sm: {
    circle: "w-4 h-4",
    text: "text-[10px] leading-[16px]",
    /** Left indent that lines sub-text up with the heading (circle + gap-2.5). */
    indent: "ml-[26px]",
  },
  md: {
    circle: "w-[18px] h-[18px]",
    text: "text-[11px] leading-[18px]",
    /** Left indent that lines sub-text up with the heading (circle + gap-3.5). */
    indent: "ml-8",
  },
} as const;

export type StepBadgeSize = keyof typeof SIZE_CONFIG;

/** Sub-text indent that aligns with the heading beside a badge of this size. */
export const stepBadgeIndent = (size: StepBadgeSize) => SIZE_CONFIG[size].indent;

interface StepBadgeProps {
  /** Step number shown inside the circle. */
  children: React.ReactNode;
  /** "sm" pairs with 13px headings, "md" with 16px headings. Defaults to "sm". */
  size?: StepBadgeSize;
  className?: string;
}

/**
 * StepBadge — the numbered circle used by step headings in the drafting and
 * analysis flows.
 *
 * Always place it in a `flex items-center` row. Do NOT add a top margin to nudge
 * it against the heading: those offsets are what break the alignment when the
 * page is zoomed or the font size changes.
 *
 * @example
 *   <div className="flex items-center gap-2.5">
 *     <StepBadge>1</StepBadge>
 *     <h3 className="text-[13px] font-semibold text-gray-800">Select folders</h3>
 *   </div>
 */
export function StepBadge({ children, size = "sm", className = "" }: StepBadgeProps) {
  const cfg = SIZE_CONFIG[size];

  return (
    <span
      className={`${cfg.circle} ${cfg.text} inline-flex shrink-0 items-center justify-center rounded-full text-center font-semibold text-white tabular-nums select-none ${className}`}
      style={{ background: PRIMARY_BRAND }}
    >
      {children}
    </span>
  );
}
