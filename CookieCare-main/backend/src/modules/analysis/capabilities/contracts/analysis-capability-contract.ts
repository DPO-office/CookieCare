import type { OperationAxis, ReportType } from "../../models/intent.js";

export type EvidenceCardinality =
  | "single_or_multi_passage"
  | "requirement_isolated"
  | "ranked_findings"
  | "paired_sides"
  | "document_rollup"
  | "structured_rows";

export type OutlineDesigner = "none" | "risk" | "comparison";

/**
 * Stable contract between intent routing, PLAN, ACT and RENDER.
 * Operations share parsing, provenance and verification primitives, but do
 * not all need the same graph or report shape.
 */
export interface AnalysisCapabilityContract {
  operation: OperationAxis;
  defaultReportType: ReportType;
  supportsOpenPropositions: boolean;
  /** Preserve the user's proposition even when a legal regime was recognized. */
  bypassRegimeCatalog: boolean;
  /** Open planning needs a broad inventory before propositions can be authored. */
  needsOpenInventory: boolean;
  /** Eligible for classify -> shared evidence -> verify -> render. */
  leanVerifiedGraph: boolean;
  evidenceCardinality: EvidenceCardinality;
  allowRelatedChecks: boolean;
  allowComparativeChecks: boolean;
  outlineDesigner: OutlineDesigner;
  allowBluf: boolean;
}

const CONTRACTS: Record<OperationAxis, AnalysisCapabilityContract> = {
  extract: {
    operation: "extract",
    defaultReportType: "extraction_table",
    supportsOpenPropositions: true,
    bypassRegimeCatalog: true,
    needsOpenInventory: false,
    // The report type is the second gate: extraction tables still use their
    // structured path, while a focused extraction rendered as Q&A stays lean.
    leanVerifiedGraph: true,
    evidenceCardinality: "structured_rows",
    allowRelatedChecks: false,
    allowComparativeChecks: false,
    outlineDesigner: "none",
    allowBluf: false,
  },
  explain_qa: {
    operation: "explain_qa",
    defaultReportType: "qa_answer",
    supportsOpenPropositions: true,
    bypassRegimeCatalog: true,
    needsOpenInventory: false,
    leanVerifiedGraph: true,
    evidenceCardinality: "single_or_multi_passage",
    allowRelatedChecks: false,
    allowComparativeChecks: false,
    outlineDesigner: "none",
    allowBluf: false,
  },
  compliance_check: {
    operation: "compliance_check",
    defaultReportType: "regime_compliance_memo",
    supportsOpenPropositions: true,
    bypassRegimeCatalog: false,
    needsOpenInventory: true,
    leanVerifiedGraph: false,
    evidenceCardinality: "requirement_isolated",
    allowRelatedChecks: true,
    allowComparativeChecks: true,
    outlineDesigner: "none",
    allowBluf: true,
  },
  risk_flag: {
    operation: "risk_flag",
    defaultReportType: "risk_audit",
    supportsOpenPropositions: true,
    bypassRegimeCatalog: true,
    needsOpenInventory: true,
    leanVerifiedGraph: false,
    evidenceCardinality: "ranked_findings",
    allowRelatedChecks: true,
    allowComparativeChecks: true,
    outlineDesigner: "risk",
    allowBluf: false,
  },
  compare: {
    operation: "compare",
    defaultReportType: "risk_audit",
    supportsOpenPropositions: true,
    bypassRegimeCatalog: true,
    needsOpenInventory: true,
    leanVerifiedGraph: false,
    evidenceCardinality: "paired_sides",
    allowRelatedChecks: false,
    allowComparativeChecks: true,
    outlineDesigner: "comparison",
    allowBluf: false,
  },
  summarize: {
    operation: "summarize",
    defaultReportType: "qa_answer",
    supportsOpenPropositions: false,
    bypassRegimeCatalog: false,
    needsOpenInventory: false,
    leanVerifiedGraph: false,
    evidenceCardinality: "document_rollup",
    allowRelatedChecks: false,
    allowComparativeChecks: false,
    outlineDesigner: "none",
    allowBluf: false,
  },
  draft_suggestion: {
    operation: "draft_suggestion",
    defaultReportType: "qa_answer",
    supportsOpenPropositions: false,
    bypassRegimeCatalog: false,
    needsOpenInventory: false,
    leanVerifiedGraph: false,
    evidenceCardinality: "document_rollup",
    allowRelatedChecks: false,
    allowComparativeChecks: false,
    outlineDesigner: "none",
    allowBluf: false,
  },
  out_of_scope: {
    operation: "out_of_scope",
    defaultReportType: "qa_answer",
    supportsOpenPropositions: false,
    bypassRegimeCatalog: false,
    needsOpenInventory: false,
    leanVerifiedGraph: false,
    evidenceCardinality: "document_rollup",
    allowRelatedChecks: false,
    allowComparativeChecks: false,
    outlineDesigner: "none",
    allowBluf: false,
  },
};

export function capabilityContractFor(
  operation: OperationAxis | string | undefined
): AnalysisCapabilityContract {
  if (operation && operation in CONTRACTS) {
    return CONTRACTS[operation as OperationAxis];
  }
  return CONTRACTS.out_of_scope;
}

export function allCapabilityContracts(): AnalysisCapabilityContract[] {
  return Object.values(CONTRACTS);
}
