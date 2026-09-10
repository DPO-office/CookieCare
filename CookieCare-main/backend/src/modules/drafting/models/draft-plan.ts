export interface WorkUnit {
  id: string;
  kind: "section" | "exhibit";
  heading: string;
  dependsOn: string[];
  clauseTypes: string[];
  status: "pending" | "drafted" | "flagged";
}

export interface MissingFact {
  field: string;
  question: string;
  severity: "critical" | "optional";
  /** Why this fact changes what must be drafted (from LLM detect-gaps). */
  reasonRequired?: string;
  options?: string[];
}

export interface ChecklistItem {
  id: string;
  source: "documentType" | "regime" | "jurisdiction";
  /** Pack id this requirement was grounded in (e.g. GDPR_ART28). */
  sourcePackId?: string;
  /** @deprecated Prefer sourcePackId; kept for older fixtures. */
  regime?: string;
  requirement: string;
  severity: "critical" | "warning";
  /** Exact skill.md excerpt grounding this requirement. */
  sourceExcerpt?: string;
  sectionTarget?: string;
}

export interface DraftPlan {
  documentType: string;
  packId: string;
  title: string;
  workUnits: WorkUnit[];
  structuredFacts: import("./structured-facts.js").StructuredFacts;
  missingFacts: MissingFact[];
  applicableRegimes: string[];
  jurisdictionId?: string;
  mandatoryChecklist: ChecklistItem[];
  loadedSkillPaths: string[];
  selectedTemplateId?: string;
  selectedClauseIds: string[];
  negotiationPositions: import("./draft-state.js").PlaybookRule[];
  glossary: Record<string, string>;
}
