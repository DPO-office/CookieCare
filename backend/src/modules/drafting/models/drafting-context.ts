import type { Clause, PlaybookRule } from "./draft-state.js";
import type { StructuredFacts } from "./structured-facts.js";
import type {
  DraftRequirementsState,
  RequirementConflict,
} from "./draft-requirements.js";
import type { MissingFact, WorkUnit } from "./draft-plan.js";
import type {
  DraftingSkillConfig,
  ExhibitBrief,
  SectionBrief,
  SkillValidationRule,
} from "../packs/skill-contract.js";
import type { ExhibitSpec } from "./draft-exhibits.js";

export type AssetProvenanceSource =
  | "company_playbook"
  | "company_template"
  | "approved_clause_library"
  | "clause_catalog"
  | "library_items"
  | "vault"
  | "default_type"
  | "source_upload"
  | "skill_default"
  | "generic_fallback"
  | "exact_id"
  | "contract_type_default"
  | "none";

export interface ProvenanceEntry {
  id: string;
  source: AssetProvenanceSource;
  wasFallback?: boolean;
}

export interface DraftingContextUserIntent {
  rawInstructions: string;
  exclusions: string[];
  preferences: string[];
}

export interface DraftingContextProvenance {
  template?: ProvenanceEntry;
  playbook?: ProvenanceEntry;
  clauses: ProvenanceEntry[];
}

export interface DraftingContextTemplate {
  id: string;
  source: string;
  content: string;
  /** Optional heading → slice map when template can be section-scoped. */
  sectionSlices?: Record<string, string>;
}

export interface DraftingContextPlaybook {
  id?: string;
  rules: PlaybookRule[];
}

/**
 * Assembled once in PLAN after packs + retrieval resolve.
 * Single source of truth for ACT / CRITIQUE / assembly.
 */
export interface DraftingContext {
  documentType: string;
  skillIds: string[];
  facts: StructuredFacts;
  draftRequirements?: DraftRequirementsState;
  /** Alias of draftRequirements — canonical requirement map. */
  requirements?: DraftRequirementsState;
  userIntent: DraftingContextUserIntent;
  conflicts: RequirementConflict[];
  gaps: MissingFact[];
  outline: WorkUnit[];
  provenance: DraftingContextProvenance;
  template?: DraftingContextTemplate;
  playbook?: DraftingContextPlaybook;
  clauses: Clause[];
  sectionBriefs: Record<string, SectionBrief>;
  exhibitBriefs: Record<string, ExhibitBrief>;
  /** First-class exhibit specs (SCC/IDTA/schedules). */
  exhibitSpecs?: ExhibitSpec[];
  validationRules: SkillValidationRule[];
  /** Merged skill configs that drove this context (for tests / logs). */
  skills: DraftingSkillConfig[];
}

/** Per-work-unit ACT package — never dump full template/playbook. */
export interface SectionActContext {
  workUnitId: string;
  heading: string;
  kind: "section" | "exhibit";
  identityLock: string;
  relevantFacts: Record<string, unknown>;
  sectionBriefBlock: string;
  playbookBlock: string;
  templateBlock: string;
  approvedClausesBlock: string;
  fixInstructions: string[];
  skillIds: string[];
  templateId?: string | null;
  playbookId?: string | null;
}
