import type { ElementType } from "react";

export type SkillStatus = "ready" | "beta" | "coming-soon";

export interface SkillCheck {
  label: string;
}

export interface Skill {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedTime: string;
  status: SkillStatus;
  icon: ElementType;
  checks: SkillCheck[];
  actionLabel: string;
}
