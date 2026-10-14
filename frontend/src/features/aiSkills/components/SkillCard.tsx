import React from "react";
import { ArrowRight, Clock, Lock } from "lucide-react";
import type { Skill } from "../types/skill";
import { StatusBadge, CategoryBadge } from "./SkillBadge";
import { SkillChecks } from "./SkillChecks";

interface SkillCardProps {
  skill: Skill;
  /**
   * Called when the user clicks "Launch Skill" on a ready skill that has an actionTab.
   * Passes both the target tab and the optional reviewProfile so the destination
   * component can request the correct AI Skill prompt from the backend.
   */
  onLaunch?: (tab: string, reviewProfile?: string) => void;
}

export function SkillCard({ skill, onLaunch }: SkillCardProps) {
  const Icon = skill.icon;

  // Actionable only when the skill has a concrete destination tab wired up.
  // A skill can be status="ready" in the catalogue but still have no tab yet
  // (e.g. Privacy Risk Audit) — those should look locked, not launchable.
  const isLaunching = skill.status !== "coming-soon" && Boolean(skill.actionTab);

  const handleLaunch = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card onClick if parent ever gets one
    if (isLaunching && skill.actionTab) onLaunch?.(skill.actionTab, skill.reviewProfile);
  };

  return (
    <article
      // Only the button is interactive; card body is purely presentational
      className={`
        group relative flex flex-col bg-white
        border border-[#E4E4E7] rounded-[18px]
        shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        transition-all duration-200 ease-out
        ${isLaunching
          ? "cursor-default hover:border-[#D4D4D8] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] hover:-translate-y-0.5"
          : "cursor-default select-none"
        }
      `}
    >
      {/* Disabled overlay — subtle wash so card reads as inactive */}
      {!isLaunching && (
        <div className="absolute inset-0 rounded-[18px] bg-white/50 pointer-events-none z-10" />
      )}

      {/* Card body */}
      <div className={`flex flex-col gap-4 p-5 flex-1 ${!isLaunching ? "opacity-60" : ""}`}>

        {/* Top: icon + status badge */}
        <div className="flex items-start justify-between gap-3">
          <div
            className={`
              w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              border border-[#E4E4E7] bg-[#FAFAFA]
              transition-all duration-200
              ${isLaunching
                ? "group-hover:bg-[#09090B] group-hover:border-[#09090B] group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
                : "bg-[#F9F9F9]"
              }
            `}
          >
            <Icon
              className={`w-5 h-5 transition-colors duration-200 ${
                isLaunching
                  ? "text-[#52525B] group-hover:text-white"
                  : "text-[#C4C4C7]"
              }`}
            />
          </div>
          <StatusBadge status={skill.status} />
        </div>

        {/* Title + description */}
        <div className="space-y-1.5">
          <h3 className={`text-[14px] font-bold tracking-tight leading-snug ${isLaunching ? "text-[#09090B]" : "text-[#A1A1AA]"}`}>
            {skill.title}
          </h3>
          <p className="text-[12.5px] text-[#71717A] leading-relaxed">
            {skill.description}
          </p>
        </div>

        {/* Category + estimated time */}
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={skill.category} />
          <span className="inline-flex items-center gap-1 text-[11px] text-[#A1A1AA] font-medium">
            <Clock className="w-3 h-3 text-[#C4C4C7]" />
            {skill.estimatedTime}
          </span>
        </div>

        {/* Checks */}
        <div className="border-t border-[#F4F4F5] pt-4">
          <SkillChecks checks={skill.checks} />
        </div>
      </div>

      {/* CTA button — always rendered, state-aware label */}
      <div className="px-5 pb-5 relative z-20">
        {isLaunching ? (
          <button
            onClick={handleLaunch}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4
              text-[13px] font-semibold cursor-pointer
              bg-[#09090B] text-white hover:bg-[#18181B]
              shadow-[0_1px_3px_rgba(0,0,0,0.12)]
              transition-all duration-200"
          >
            <span>{skill.actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
          </button>
        ) : (
          // Not yet available — disabled, clearly labelled, non-interactive
          <div
            aria-disabled="true"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4
              text-[13px] font-semibold cursor-not-allowed select-none
              bg-[#F4F4F5] text-[#C4C4C7] border border-[#EBEBEB]"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Coming Soon</span>
          </div>
        )}
      </div>
    </article>
  );
}
