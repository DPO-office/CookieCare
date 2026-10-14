import React, { useState, useEffect, useMemo } from "react";
import { AISkillsHeader } from "./components/AISkillsHeader";
import { SkillCard } from "./components/SkillCard";
import { EmptyState } from "./components/EmptyState";
import { skills } from "./data/skills";
import type { SkillCategory } from "./types/skill";

const CATEGORIES_WITH_SKILLS: SkillCategory[] = ["Privacy & Compliance"];

interface AISkillsPageProps {
  /**
   * Called when the user launches a skill that has an actionTab configured.
   * Passes both the target tab and the optional reviewProfile so the destination
   * component can activate the correct AI Skill prompt.
   */
  onSkillLaunch?: (tab: string, reviewProfile?: string) => void;
}

export default function AISkillsPage({ onSkillLaunch }: AISkillsPageProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<SkillCategory | "All">("All");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    return skills.filter((skill) => {
      const matchesCategory =
        activeCategory === "All" || skill.category === activeCategory;
      const matchesSearch =
        search.trim() === "" ||
        skill.title.toLowerCase().includes(search.toLowerCase()) ||
        skill.description.toLowerCase().includes(search.toLowerCase()) ||
        skill.category.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const readyCount = skills.filter((s) => s.status === "ready").length;

  // Show empty state when a category is selected that has no built skills yet
  const showComingSoon =
    activeCategory !== "All" &&
    !CATEGORIES_WITH_SKILLS.includes(activeCategory as SkillCategory) &&
    search.trim() === "";

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#FAFAFB] scrollbar-none"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(8px)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      <div className="max-w-5xl mx-auto px-8 py-8">

        <AISkillsHeader
          search={search}
          onSearchChange={setSearch}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          totalSkills={skills.length}
          readySkills={readyCount}
        />

        {/* Divider */}
        <div className="h-px bg-[#F0F0F1] mb-8" />

        {/* Skills grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showComingSoon ? (
            <EmptyState category={activeCategory as SkillCategory} />
          ) : filtered.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
              <p className="text-[13px] font-semibold text-[#09090B] mb-1">No skills found</p>
              <p className="text-[12.5px] text-[#A1A1AA]">
                Try adjusting your search or clearing filters.
              </p>
            </div>
          ) : (
            filtered.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onLaunch={onSkillLaunch} />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
