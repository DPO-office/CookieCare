import type { ChecklistItem, WorkUnit } from "../../models/draft-plan.js";
import type { StructuredFacts } from "../../models/structured-facts.js";

export interface PlanContext {
  facts: StructuredFacts;
  instructions: string;
}

export interface ActContext {
  unit: WorkUnit;
  facts: StructuredFacts;
  glossary: Record<string, string>;
}

export interface CritiqueContext {
  checklist: ChecklistItem[];
  document: string;
}

export interface DocumentTypePack {
  id: string;
  aliases: string[];
  skeleton: WorkUnit[];
  skillPaths: string[];
  prompts: {
    plan: (ctx: PlanContext) => string;
    actSection: (ctx: ActContext) => string;
    critique: (ctx: CritiqueContext) => string;
  };
  retrievalHints: { clauseTags: string[]; playbookTopics: string[] };
}
