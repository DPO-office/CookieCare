import React from "react";
import { Search, Sparkles } from "lucide-react";
import type { SkillCategory } from "../types/skill";

const CATEGORIES: SkillCategory[] = [
  "Privacy & Compliance",
  "Legal",
  "Security",
  "Governance",
];

interface AISkillsHeaderProps {
  search: string;
  onSearchChange: (v: string) => void;
  activeCategory: SkillCategory | "All";
  onCategoryChange: (c: SkillCategory | "All") => void;
  totalSkills: number;
  readySkills: number;
}

export function AISkillsHeader({
  search,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  totalSkills,
  readySkills,
}: AISkillsHeaderProps) {
  const tabs: (SkillCategory | "All")[] = ["All", ...CATEGORIES];

  return (
    <div className="mb-8 space-y-5">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#09090B] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[22px] font-bold text-[#09090B] tracking-tight leading-tight">
              AI Skills
            </h1>
          </div>
          <p className="text-[13px] text-[#71717A] leading-relaxed max-w-lg">
            Discover specialized AI workflows for legal, privacy, security and
            compliance operations.
          </p>
        </div>

        {/* Stat pills */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg bg-[#F4F4F5] border border-[#E4E4E7] text-[#52525B]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
            {readySkills} ready
          </span>
          <span className="inline-flex items-center text-[11.5px] font-semibold px-3 py-1.5 rounded-lg bg-[#F4F4F5] border border-[#E4E4E7] text-[#52525B]">
            {totalSkills} total
          </span>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA] pointer-events-none" />
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-9 pl-9 pr-3 bg-white border border-[#E4E4E7] rounded-lg text-[13px] text-[#09090B] placeholder:text-[#A1A1AA] outline-none transition-all duration-150 focus:border-[#D4D4D8] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)]"
        />
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeCategory === tab;
          return (
            <button
              key={tab}
              onClick={() => onCategoryChange(tab)}
              className={`
                px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium
                border transition-all duration-150 outline-none
                ${isActive
                  ? "bg-[#09090B] text-white border-[#09090B] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                  : "bg-white text-[#52525B] border-[#E4E4E7] hover:border-[#D4D4D8] hover:bg-[#FAFAFA]"
                }
              `}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </div>
  );
}
