import type {
  IntentClassification,
  ReportSpec,
} from "./intent.js";
import type { AnalysisSkillConfig } from "../skills/types.js";

export type AnalysisToolName =
  | "list_documents"
  | "classify_document"
  | "search_document"
  | "get_span"
  | "extract_clauses"
  | "check_expected_clauses"
  | "extract_entities"
  | "flag_risk"
  | "check_against_rule"
  | "compare_clauses"
  | "diff_documents"
  | "map_document_relationships"
  | "get_applicable_rules"
  | "get_playbook_rule"
  | "request_clarification"
  | "create_draft_task"
  | "evaluate_matrix_row"
  | "extract_playbook_positions"
  | "web_assisted_reference"
  | "extract_shared_evidence"
  | "evaluate_package"
  | "derive_risk"
  | "aggregate_requirements"
  | "render_output";

export type AnalysisOutputSchema =
  | "ClauseObject[]"
  | "Finding[]"
  | "DiffResult"
  | "string";

export type WorkUnitStatus = "pending" | "done" | "flagged" | "skipped" | "failed";

export interface AnalysisWorkUnit {
  workUnitId: string;
  tool: AnalysisToolName;
  input: Record<string, unknown>;
  dependsOn: string[];
  outputSchema: AnalysisOutputSchema;
  status: WorkUnitStatus;
  /** Can be 0 for classify / expected-clause hits. */
  findingsEmitted?: number;
  /** Required when findingsEmitted is 0 and status is done. */
  completionNote?: string;
}

export type ResolutionSource = "explicit_number" | "phrase_map" | "catalog_llm";

export interface ResolutionProvenance {
  id: string;
  kind: "rule" | "matrix_row" | "risk_category";
  source: ResolutionSource;
  required: boolean;
  reason?: string;
}

/** Semantic requirement extracted from the user's instruction (not just keywords). */
export interface InstructionRequirement {
  id: string;
  label: string;
  sourceText?: string;
}

/** Maps a user requirement to catalog capabilities selected to satisfy it. */
export interface RequirementCapabilityMapping {
  requirementId: string;
  capabilityIds: string[];
  source: ResolutionSource;
}

export type RequirementCoverageStatus = "covered" | "partial" | "missing";

/** PLAN completeness check — did we cover every part of the instruction? */
export interface CompletenessCheckItem {
  requirementId: string;
  label: string;
  status: RequirementCoverageStatus;
  mappedCapabilityIds: string[];
  reason?: string;
}

/** Structured unresolved need with diagnostic reason. */
export interface UnresolvedNeedDetail {
  requirement: string;
  reason: string;
}

/** PLAN focus: closed-catalog resolution with provenance. */
export interface InstructionFocus {
  ruleIds: string[];
  matrixRowIds: string[];
  riskCategoryIds: string[];
  instructionText: string;
  /** Semantic requirements the user asked to establish. */
  requirements?: InstructionRequirement[];
  /** Catalog ids directly required to satisfy the instruction. */
  requiredCapabilities?: string[];
  /** Contextual / supporting catalog ids (not strictly required). */
  supportingCapabilities?: string[];
  /** requirement → capability trace for audit. */
  requirementMappings?: RequirementCapabilityMapping[];
  /** Per-requirement coverage before ACT. */
  completenessCheck?: CompletenessCheckItem[];
  requiredIds?: string[];
  supportingIds?: string[];
  /** @deprecated Prefer unresolvedNeedDetails — kept for backward-compatible logs. */
  unresolvedNeeds?: string[];
  unresolvedNeedDetails?: UnresolvedNeedDetail[];
  droppedCandidateIds?: string[];
  provenance?: ResolutionProvenance[];
}

export interface MissingClarification {
  field: string;
  question: string;
  severity: "critical" | "optional";
  options?: string[];
}

export interface PlanAuditRecord {
  resolvedSkillIds: string[];
  resolvedRuleIds: string[];
  resolvedMatrixRowIds: string[];
  resolvedRiskCategoryIds: string[];
  reportSpec: ReportSpec;
  resolutionSources: ResolutionSource[];
  droppedCandidateIds: string[];
  /** Structured requirements extracted from the instruction. */
  requirements: InstructionRequirement[];
  requiredCapabilities: string[];
  supportingCapabilities: string[];
  requirementMappings: RequirementCapabilityMapping[];
  completenessCheck: CompletenessCheckItem[];
  unresolvedNeeds: UnresolvedNeedDetail[];
  provenance?: ResolutionProvenance[];
}

export interface AnalysisPlan {
  intent: IntentClassification;
  workUnits: AnalysisWorkUnit[];
  missingClarifications: MissingClarification[];
  outputForm: IntentClassification["outputForm"];
  reportSpec?: ReportSpec;
  rendererSchemaId:
    | "table"
    | "checklist"
    | "redline_diff"
    | "memo"
    | "qa_thread"
    | "brief_summary"
    | "rights_matrix_memo"
    | "playbook_comparison_memo";
  activeSkillIds?: string[];
  focus?: InstructionFocus;
  auditRecord?: PlanAuditRecord;
  /** Pack / taxonomy versions pinned for audit reproducibility. */
  pinnedVersions: {
    clauseTaxonomyVersion: string;
    riskTaxonomyVersion: string;
    modelTask?: string;
  };
}

export interface PlanOutput {
  activeSkills: AnalysisSkillConfig[];
  focus: InstructionFocus;
  reportSpec: ReportSpec;
  workUnitGraph: AnalysisWorkUnit[];
  auditRecord: PlanAuditRecord;
}
