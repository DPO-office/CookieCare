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

export interface DraftState {
  // Optional progress callback — injected by the job handler so each pipeline
  // step can broadcast live status without importing the job queue directly.
  onProgress?: (percent: number, message: string) => Promise<void>;
  request: {
    intent: DraftMode;
    // idk why i added this there no use of it, we are using intent as mode everwhere that why making it optional
    mode?: 'Basic' | 'Standard Template' | 'Advanced Proactive' | null;
    uploadedDocumentText?:string; // This is for REACTIVE MODE ONLY
    rawInstructions: string; 
    payloadFields?: {documentId:string}
    templateId?: string;
    sourceText?: string;
    formFields?: Record<string, unknown>;
    highlightedText?: string;
  };
  requirements: RequirementContext | null;
  retrieval: {
    matchedTemplate: string | null;
    applicablePlaybookRules: PlaybookRule[];
    fallbackClauses: Clause[];
    historicalReferences: ReferenceSnippet[];
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
  metadata: {
    generationParameters: Record<string, unknown>;
    playbookVersion: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

