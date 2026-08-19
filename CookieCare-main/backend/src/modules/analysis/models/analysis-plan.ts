import type {
  IntentClassification,
  IntentRequirementType,
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
  | "inventory_provisions"
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
  kind: "rule" | "matrix_row" | "risk_category" | "package";
  source: ResolutionSource;
  required: boolean;
  reason?: string;
}

export type RequirementExecutionStatus =
  | "supported"
  | "supported_via_dependency"
  | "direct_rule"
  | "not_supported"
  | "needs_replan";

export interface RequirementExecutionPath {
  requirementId: string;
  status: RequirementExecutionStatus;
  packageId?: string;
  ruleIds?: string[];
  reason?: string;
  requirementType?: IntentRequirementType;
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

/** Narrows an in-scope article to a paragraph and optional lettered sub-clauses. */
export interface ExplicitSubsectionScope {
  article: number;
  /** Statute paragraph, e.g. 3 for Article 28(3). */
  paragraph?: number;
  /** Lettered sub-clauses under the paragraph, e.g. ["a", "b"]. Undefined = all letters. */
  letters?: string[];
}

/**
 * Hard scope boundary extracted from the user's instruction before catalog resolution.
 * Referenced law (context) must not become independent ACT work unless listed in `articles`.
 */
export interface ExplicitScope {
  /** Article numbers the user explicitly asked to review. */
  articles: number[];
  /** When set, narrows in-scope articles to specific paragraphs / letters. */
  subsections?: ExplicitSubsectionScope[];
  /** Articles mentioned only as cross-reference context — not scheduled as separate checks. */
  contextArticles: number[];
  /** Cross-referenced articles may inform parent-rule evaluation (e.g. 28(3)(f)). */
  allowCrossReferencedContext: boolean;
  /** When false, catalog and phrase-map additions outside scope are rejected. */
  allowOutOfScopeRules: boolean;
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
  /** Catalog package ids selected for this instruction (not rule ids). */
  selectedPackageIds?: string[];
  /** Explicit article/subsection boundary applied during capability selection. */
  explicitScope?: ExplicitScope;
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
  resolvedPackageIds?: string[];
  requirementToPackageId?: Record<string, string>;
  requirementExecutionPaths?: RequirementExecutionPath[];
}

export interface AnalysisPlan {
  intent: IntentClassification;
  workUnits: AnalysisWorkUnit[];
  missingClarifications: MissingClarification[];
  outputForm: IntentClassification["outputForm"];
  documentPresentation?: IntentClassification["documentPresentation"];
  /** Follow-up re-render / Q&A — skip CRITIQUE and go DONE after ACT. */
  skipCritique?: boolean;
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
  /** PLAN-time package execution paths (audit + aggregation of unsupported reqs). */
  requirementExecutionPaths?: RequirementExecutionPath[];
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
