import type { ElementType } from "react";

export type SkillStatus = "ready" | "beta" | "coming-soon";

export type SkillCategory =
  | "Privacy & Compliance"
  | "Legal"
  | "Security"
  | "Governance";

export interface SkillCheck {
  label: string;
}

export interface Skill {
  id: string;
  title: string;
  description: string;
  category: SkillCategory;
  estimatedTime: string;
  status: SkillStatus;
  icon: ElementType;
  checks: SkillCheck[];
  actionLabel: string;
  /** The sidebar tab id to navigate to when "Launch Skill" is clicked. */
  actionTab?: string;
  /**
   * Optional review profile identifier sent to the backend.
   * Maps to a prompt file in backend/prompts/skills/<reviewProfile>.md.
   * When absent the backend uses the standard DPA Review SYSTEM_PROMPT unchanged.
   */
  reviewProfile?: string;
}
