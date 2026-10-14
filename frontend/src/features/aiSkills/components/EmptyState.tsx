import React from "react";
import { Sparkles } from "lucide-react";
import type { SkillCategory } from "../types/skill";

interface EmptyStateProps {
  category: SkillCategory;
}

export function EmptyState({ category }: EmptyStateProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Icon */}
      <div className="w-12 h-12 rounded-2xl bg-[#F4F4F5] border border-[#E4E4E7] flex items-center justify-center mb-4">
        <Sparkles className="w-5 h-5 text-[#C4C4C7]" />
      </div>

      {/* Text */}
      <p className="text-[14px] font-semibold text-[#09090B] mb-1.5">
        {category} Skills Coming Soon
      </p>
      <p className="text-[12.5px] text-[#A1A1AA] max-w-xs leading-relaxed">
        We're building specialized AI workflows for {category.toLowerCase()}.
        Check back soon.
      </p>

      {/* Pill */}
      <span className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#E4E4E7] bg-[#FAFAFA] text-[11px] font-semibold text-[#A1A1AA]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#D4D4D8]" />
        In development
      </span>
    </div>
  );
}
