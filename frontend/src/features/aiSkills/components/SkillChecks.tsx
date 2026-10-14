import React from "react";
import { Check } from "lucide-react";
import type { SkillCheck } from "../types/skill";

interface SkillChecksProps {
  checks: SkillCheck[];
}

export function SkillChecks({ checks }: SkillChecksProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA] mb-2">
        What this skill checks
      </p>
      <ul className="grid grid-cols-1 gap-1.5">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#F4F4F5] border border-[#E4E4E7] flex items-center justify-center shrink-0">
              <Check className="w-2.5 h-2.5 text-[#71717A]" />
            </span>
            <span className="text-[12px] text-[#52525B]">{check.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
