export type DraftMode = "BASIC" | "PROACTIVE" | "REACTIVE" | "REFINEMENT"

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
  // belove field only for reactive mode
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

/**
 * Structured representation of one section of the generated document.
 * `body` holds the full markdown block for that section INCLUDING its heading line,
 * so the ordered list of section bodies round-trips back to the original document.
 * `heading` is the parsed heading text, used for targeting/matching (e.g. surgical refine).
 */
export interface DraftSection {
  id: string;
  heading: string;
  body: string;
  clauseType?: string;
}

/**
 * Append-only memory of what happened to the document across versions.
 * This is the seed of agentic episodic memory: persisted per-document so a refine
 * turn can see what changed and why.
 */
export interface DraftHistoryEntry {
  version: number;
  actor: "user" | "model" | "validator";
  action: string;
  instruction?: string;
  changedSectionIds?: string[];
  timestamp: string;
}

export interface DraftState {
  // Optional progress callback — injected by the job handler so each pipeline
  // step can broadcast live status without importing the job queue directly.
  onProgress?: (percent: number, message: string) => Promise<void>;
  // Optional token callback — injected by the job handler to stream generation
  // tokens to the client as they are produced (real streaming). Ephemeral: never persisted.
  onToken?: (delta: string) => void;
  request: {
    intent: DraftMode;
    // idk why i added this there no use of it, we are using intent as mode everwhere that why making it optional
    mode?: 'Basic' | 'Standard Template' | 'Advanced Proactive' | null;
    uploadedDocumentText?:string; // This is for REACTIVE MODE ONLY
    rawInstructions: string; 
    // Output draft file id (ledger / files row). Distinct from vaultDocumentId.
    payloadFields?: {documentId:string}
    // Proactive vault selection: library / contract_templates / files id used as retrieval source.
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
    // Observability for empty vs DB vs hardcoded paths (generation unchanged).
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
    // Structured section list (derived from formattedDocument). Optional so existing
    // state literals stay valid; generation.ts populates it going forward.
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
  // Append-only memory log across versions (Gap 2). Optional to keep literals valid.
  history?: DraftHistoryEntry[];
  metadata: {
    generationParameters: Record<string, unknown>;
    playbookVersion: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

