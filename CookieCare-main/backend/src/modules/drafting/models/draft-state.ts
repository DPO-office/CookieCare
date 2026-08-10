export type DraftMode = "BASIC" | "PROACTIVE" | "REACTIVE" | "REFINEMENT";

import type { AgentRunState, EntryMode } from "../pac/types.js";
import type { DraftPlan } from "./draft-plan.js";
import type { CritiqueReport } from "./critique-report.js";
import type { StructuredFacts, StructuredIntakeOverlay } from "./structured-facts.js";
import type { DraftConversation } from "./conversation.js";
import type { FixPlan } from "./fix-plan.js";

export interface RequirementContext {
  contractType: string;
  jurisdiction: string;
  industry: string;
  parties: string[];
  requiredClauses: string[];
  optionalClauses: string[];
  language: string;
  instructions: string;
  uploadDocSummary?: string;
  agreementTitle?: string;
  partyA?: string;
  partyB?: string;
  effectiveDate?: string;
}

export interface Clause {
  id: string;
  text: string;
  clauseType: string;
  jurisdiction: string;
  riskLevel: "Low" | "Medium" | "High";
  isApproved: boolean;
}

export interface PlaybookRule {
  id: string;
  topic: string;
  standardPosition: string;
  fallbackPositions: string[];
  walkAwayCondition: string;
}

export interface ReferenceSnippet {
  id: string;
  documentName: string;
  extractedText: string;
  score: number;
}

export interface ValidationIssue {
  type:
    | "omission"
    | "reference_broken"
    | "playbook_violation"
    | "formatting"
    | "jurisdiction";
  severity: "warning" | "critical";
  description: string;
  targetSection?: string;
}

export interface RiskItem {
  severity: "Low" | "Medium" | "High";
  explanation: string;
  suggestedReplacementClause?: string;
}

export interface ClauseProvenanceSpan {
  spanStart: number;
  spanEnd: number;
  source: "approved-clause" | "generated";
  clauseId?: string;
}

export interface DraftSection {
  id: string;
  heading: string;
  body: string;
  clauseType?: string;
  workUnitId?: string;
  clauseProvenance?: ClauseProvenanceSpan[];
}

export interface DraftedExhibit {
  workUnitId: string;
  title: string;
  body: string;
  clauseProvenance?: ClauseProvenanceSpan[];
}

/**
 * Append-only agent audit trail — distinct from user-facing DraftConversation.
 */
export interface DraftHistoryEntry {
  version: number;
  actor: "user" | "model" | "validator" | "controller";
  action: string;
  instruction?: string;
  changedSectionIds?: string[];
  timestamp: string;
  phase?: string;
  detail?: Record<string, unknown>;
}

export interface DraftState {
  onProgress?: (percent: number, message: string) => Promise<void>;
  onToken?: (delta: string) => void;

  entryMode?: EntryMode;
  agent?: AgentRunState;
  plan?: DraftPlan | null;
  critique?: CritiqueReport | null;
  structuredFacts?: StructuredFacts;
  intakeOverlay?: StructuredIntakeOverlay;
  conversation?: DraftConversation;
  fixPlan?: FixPlan | null;
  exhibits?: DraftedExhibit[];
  organizationId?: string;

  request: {
    intent: DraftMode;
    mode?: "Basic" | "Standard Template" | "Advanced Proactive" | null;
    uploadedDocumentText?: string;
    rawInstructions: string;
    payloadFields?: { documentId: string };
    vaultDocumentId?: string | null;
    templateId?: string;
    sourceText?: string;
    highlightedText?: string;
  };
  requirements: RequirementContext | null;
  retrieval: {
    matchedTemplate: string | null;
    applicablePlaybookRules: PlaybookRule[];
    fallbackClauses: Clause[];
    historicalReferences: ReferenceSnippet[];
    templateSource?: "vault" | "default_type" | "reactive_upload" | "none";
    clauseSource?: "library_items" | "clause_catalog" | "hardcoded_fallback" | "none";
  };
  context: {
    systemPrompt: string;
    assembledPrompt: string;
    documentSkeleton?: string[];
    draftSummary?: string;
  } | null;
  draft: {
    rawOutput: string;
    formattedDocument: string;
    sections?: DraftSection[];
    version: number;
    parentVersionId?: string;
  } | null;
  validation: {
    isValid: boolean;
    issues: ValidationIssue[];
  } | null;
  riskReview: {
    analyzed: boolean;
    risks: RiskItem[];
  } | null;
  history?: DraftHistoryEntry[];
  metadata: {
    generationParameters: Record<string, unknown>;
    playbookVersion: string;
    timestamp: string;
    [key: string]: unknown;
  };
}
