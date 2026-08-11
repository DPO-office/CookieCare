import type { IntentClassification } from "./intent.js";

export type AnalysisToolName =
  | "list_documents"
  | "classify_document"
  | "search_document"
  | "get_span"
  | "extract_clauses"
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
  | "render_output";

export type AnalysisOutputSchema =
  | "ClauseObject[]"
  | "Finding[]"
  | "DiffResult"
  | "string";

export type WorkUnitStatus = "pending" | "done" | "flagged" | "skipped";

export interface AnalysisWorkUnit {
  workUnitId: string;
  tool: AnalysisToolName;
  input: Record<string, unknown>;
  dependsOn: string[];
  outputSchema: AnalysisOutputSchema;
  status: WorkUnitStatus;
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
  rendererSchemaId: "table" | "checklist" | "redline_diff" | "memo" | "qa_thread";
  /** Pack / taxonomy versions pinned for audit reproducibility. */
  pinnedVersions: {
    clauseTaxonomyVersion: string;
    riskTaxonomyVersion: string;
    modelTask?: string;
  };
}
