import React from "react";
import { ArrowRight } from "lucide-react";
import type { Skill } from "./types/skill";
import { SkillMetadata } from "./SkillMetadata";
import { SkillChecks } from "./SkillChecks";

interface SkillCardProps {
  skill: Skill;
}

export function SkillCard({ skill }: SkillCardProps) {
  const Icon = skill.icon;
  const isAvailable = skill.status !== "coming-soon";

  return (
    <div
      className={`
        group relative bg-white border border-[#E4E4E7] rounded-[18px] p-5 flex flex-col gap-4
        shadow-[0_1px_2px_rgba(0,0,0,0.04)]
        transition-all duration-200 ease-out
        ${isAvailable
          ? "cursor-pointer hover:border-[#D4D4D8] hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] hover:-translate-y-0.5"
          : "opacity-60 cursor-default"
        }
      `}
    >
      {/* Top row: icon + metadata */}
      <div className="flex items-start justify-between gap-3">
        {/* Icon */}
        <div
          className={`
            w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            border border-[#E4E4E7] bg-[#FAFAFA]
            transition-all duration-200
            ${isAvailable ? "group-hover:bg-[#09090B] group-hover:border-[#09090B] group-hover:shadow-sm" : ""}
          `}
        >
          <Icon
            className={`
              w-5 h-5 transition-colors duration-200
              ${isAvailable ? "text-[#52525B] group-hover:text-white" : "text-[#C4C4C7]"}
            `}
          />
        </div>

        {/* Metadata: badges + time */}
        <div className="flex-1 min-w-0 pt-0.5">
          <SkillMetadata
            category={skill.category}
            estimatedTime={skill.estimatedTime}
            status={skill.status}
          />
        </div>
      </div>

      {/* Title + description */}
      <div className="space-y-1.5">
        <h3 className="text-[14px] font-bold text-[#09090B] tracking-tight leading-snug">
          {skill.title}
        </h3>
        <p className="text-[12.5px] text-[#71717A] leading-relaxed">
          {skill.description}
        </p>
      </div>

      {/* Check items */}
      <div className="border-t border-[#F4F4F5] pt-3">
        <SkillChecks checks={skill.checks} />
      </div>

      {/* CTA */}
      <div className="pt-1">
        <button
          disabled={!isAvailable}
          className={`
            w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4
            text-[13px] font-semibold
            transition-all duration-200
            ${isAvailable
              ? "bg-[#09090B] text-white hover:bg-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.12)] cursor-pointer"
              : "bg-[#F4F4F5] text-[#A1A1AA] cursor-default"
            }
          `}
        >
          <span>{skill.actionLabel}</span>
          {isAvailable && (
            <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
          )}
        </button>
      </div>
    </div>
  );
}
