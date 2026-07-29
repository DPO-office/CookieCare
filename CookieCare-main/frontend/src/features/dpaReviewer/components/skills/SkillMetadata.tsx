import React from "react";
import { Clock } from "lucide-react";
import type { SkillStatus } from "./types/skill";
import { CategoryBadge, StatusBadge } from "./SkillBadge";

interface SkillMetadataProps {
  category: string;
  estimatedTime: string;
  status: SkillStatus;
}

export function SkillMetadata({
  category,
  estimatedTime,
  status,
}: SkillMetadataProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CategoryBadge label={category} />
      <StatusBadge status={status} />
      <span className="inline-flex items-center gap-1 text-[11px] text-[#A1A1AA] font-medium ml-auto shrink-0">
        <Clock className="w-3 h-3 text-[#C4C4C7]" />
        {estimatedTime}
      </span>
    </div>
  );
}
