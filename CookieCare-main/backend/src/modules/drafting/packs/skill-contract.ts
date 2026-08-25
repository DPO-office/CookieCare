import type { WorkUnit } from "../models/draft-plan.js";
import type { StructuredFacts } from "../models/structured-facts.js";
import type { RequirementPriority } from "../models/draft-requirements.js";
import type { ExhibitSpec } from "../models/draft-exhibits.js";

/** Executable drafting skill — law + document shape (not company playbook policy). */
export type DraftingSkillAxis = "documentType" | "regime" | "jurisdiction";

export interface DraftingRequiredFact {
  id: string;
  priority: RequirementPriority;
  blocking: boolean;
  question: string;
  reasonRequired: string;
  options?: string[];
  aliases?: string[];
  safeDefault?: unknown;
  coveredByEffectiveDate?: boolean;
}

export interface SectionBrief {
  workUnitId: string;
  title: string;
  purpose: string;
  requiredContent: string[];
  requiredFacts?: string[];
  requiredLegalElements?: string[];
  prohibitedContent?: string[];
  relatedExhibits?: string[];
  validationChecks?: string[];
}

export interface ExhibitBrief {
  workUnitId: string;
  title: string;
  purpose: string;
  requiredContent: string[];
  requiredFacts?: string[];
  relatedSections?: string[];
}

export interface ConditionalWorkUnitSpec {
  /** Human-readable reason for logs. */
  id: string;
  when: (facts: StructuredFacts) => boolean;
  workUnit: WorkUnit;
}

export type ValidationCheckKind =
  | "section_present"
  | "exhibit_present"
  | "required_phrase"
  | "fact_reflected"
  | "conditional_exhibit";

export interface SkillValidationRule {
  id: string;
  requirement: string;
  severity: "critical" | "warning";
  checkKind: ValidationCheckKind;
  /** Target work unit (section / exhibit). */
  sectionTarget?: string;
  /** Substring that must appear when checkKind is required_phrase. */
  requiredPhrase?: string;
  /** Fact id that must appear in draft when checkKind is fact_reflected. */
  factId?: string;
  /** Only apply when this predicate is true (defaults to always). */
  when?: (facts: StructuredFacts) => boolean;
}

export interface DraftingSkillConfig {
  skillId: string;
  axis: DraftingSkillAxis;
  label: string;
  version?: string;
  appliesToDocTypes?: string[];
  requiredFacts?: DraftingRequiredFact[];
  optionalFacts?: DraftingRequiredFact[];
  safeDefaults?: Record<string, unknown>;
  sectionBriefs?: SectionBrief[];
  exhibitBriefs?: ExhibitBrief[];
  /** First-class exhibit specs (SCC/IDTA/schedules) — preferred over deriving from briefs. */
  exhibitSpecs?: ExhibitSpec[];
  requiredExhibits?: string[];
  conditionalWorkUnits?: ConditionalWorkUnitSpec[];
  draftingRules?: string[];
  validationRules?: SkillValidationRule[];
}

/** Format a section brief for ACT prompt injection. */
export function formatSectionBrief(brief: SectionBrief): string {
  const lines = [
    `# SECTION BRIEF — ${brief.title}`,
    `Purpose: ${brief.purpose}`,
    brief.requiredContent.length
      ? `Required content:\n${brief.requiredContent.map((c) => `- ${c}`).join("\n")}`
      : "",
    brief.requiredLegalElements?.length
      ? `Required legal elements:\n${brief.requiredLegalElements.map((c) => `- ${c}`).join("\n")}`
      : "",
    brief.requiredFacts?.length
      ? `Required facts for this section: ${brief.requiredFacts.join(", ")}`
      : "",
    brief.prohibitedContent?.length
      ? `Prohibited:\n${brief.prohibitedContent.map((c) => `- ${c}`).join("\n")}`
      : "",
    brief.relatedExhibits?.length
      ? `Related exhibits: ${brief.relatedExhibits.join(", ")}`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatExhibitBrief(brief: ExhibitBrief): string {
  const lines = [
    `# EXHIBIT BRIEF — ${brief.title}`,
    `Purpose: ${brief.purpose}`,
    brief.requiredContent.length
      ? `Required content:\n${brief.requiredContent.map((c) => `- ${c}`).join("\n")}`
      : "",
    brief.requiredFacts?.length
      ? `Required facts: ${brief.requiredFacts.join(", ")}`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}
