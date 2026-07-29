import React from "react";
import { Sparkles } from "lucide-react";
import { privacySkills } from "./data/privacySkills";
import { SkillCard } from "./SkillCard";

export function AISkillsSection() {
  return (
    <section className="mb-10">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-[#09090B] flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-[16px] font-bold text-[#09090B] tracking-tight">
              AI Skills
            </h2>
          </div>
          <p className="text-[12.5px] text-[#71717A] leading-relaxed max-w-xl ml-8">
            Choose a specialized AI skill to analyze privacy documents, identify
            risks, and generate actionable recommendations.
          </p>
        </div>

        <span className="shrink-0 text-[10.5px] font-semibold px-2 py-1 rounded-lg bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7] mt-0.5">
          {privacySkills.filter((s) => s.status === "ready").length} available
        </span>
      </div>

      {/* Skills grid — 2-col on md+, 1-col on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {privacySkills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
      </div>
    </section>
  );
}
