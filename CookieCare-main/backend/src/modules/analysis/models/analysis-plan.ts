import type { IntentClassification } from "./intent.js";

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

/** Deterministic PLAN focus resolved from skill.instructionFocusMap. */
export interface InstructionFocus {
  ruleIds: string[];
  matrixRowIds: string[];
  riskCategoryIds: string[];
  instructionText: string;
}

export interface MissingClarification {
  field: string;
  question: string;
  severity: "critical" | "optional";
  options?: string[];
}

export interface AnalysisPlan {
  intent: IntentClassification;
  workUnits: AnalysisWorkUnit[];
  missingClarifications: MissingClarification[];
  outputForm: IntentClassification["outputForm"];
  rendererSchemaId:
    | "table"
    | "checklist"
    | "redline_diff"
    | "memo"
    | "qa_thread"
    | "rights_matrix_memo";
  activeSkillIds?: string[];
  focus?: InstructionFocus;
  /** Pack / taxonomy versions pinned for audit reproducibility. */
  pinnedVersions: {
    clauseTaxonomyVersion: string;
    riskTaxonomyVersion: string;
    modelTask?: string;
  };
}
