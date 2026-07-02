Lexify Legal Drafting System - Comprehensive Implementation Plan
1. Core Engineering Guardrails
Platform = Legal Brain; LLM = Writer: The platform handles all data mapping, filtering, verification, memory tracking, and routing. The LLM performs text rendering and parsing operations based exclusively on the structured input context blocks it receives.

No Autonomous Agents: The drafting execution path is strictly linear and deterministic. Do not implement reactive loops or autonomous tool calling.

Hybrid Architecture Patterns: Use standard Object-Oriented Programming (OOP) classes exclusively to handle state-isolated structures, infrastructure connectors, repositories, external API clients, and retrieval layers. Use lightweight pure functions to execute linear pipeline steps, schema transformations, and prompt compilation.

2. Comprehensive Directory Structure Map
Plaintext
drafting/
├── api/
│   ├── controller.ts           # Route entrypoint; basic validation
│   └── schemas/
│       └── request-schema.ts   # Zod validation schemas for incoming payloads
├── infra/
│   └── clients.ts              # Connectors for Postgres, Vector DBs, OpenRouter
├── models/
│   ├── draft-state.ts          # Central state interface types
│   └── types.ts                # Common domain types
├── providers/
│   └── openrouter-provider.ts  # Isolated openrouter completion class wrapper
├── services/
│   └── retrievers/
│       ├── clause-retriever.ts # Hybrid Search vector extractor (Vector + BM25 + Rerank)
│       └── playbook-retriever.ts # Deterministic metadata database filter
├── steps/
│   ├── requirement-extraction.ts
│   ├── retrieval.ts
│   ├── context-assembly.ts
│   ├── generation.ts
│   ├── validation.ts
│   ├── risk-review.ts
│   ├── refinement-assembly.ts  # NEW: Assembles context for editing existing drafts
│   └── save.ts
├── workflows/
│   └── draft-workflow.ts       # Orchestrator handling both Initial and Refinement workflows
└── prompts/
    └── system-templates.ts     # String constants containing deterministic prompt structures
3. Core State Definition (models/draft-state.ts)
TypeScript
export interface RequirementContext {
  contractType: string;
  jurisdiction: string;
  industry: string;
  parties: string[];
  requiredClauses: string[];
  optionalClauses: string[];
  language: string;
  instructions: string;
}

export interface Clause {
  id: string;
  text: string;
  clauseType: string;
  jurisdiction: string;
  riskLevel: 'Low' | 'Medium' | 'High';
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
  type: 'omission' | 'reference_broken' | 'playbook_violation' | 'formatting' | 'jurisdiction';
  severity: 'warning' | 'critical';
  description: string;
  targetSection?: string;
}

export interface RiskItem {
  severity: 'Low' | 'Medium' | 'High';
  explanation: string;
  suggestedReplacementClause?: string;
}

export interface DraftState {
  request: {
    mode: 'Basic' | 'Advanced Proactive' | 'Advanced Reactive';
    rawInstructions: string;
    templateId?: string;
    sourceText?: string;          // Used in Advanced Reactive mode
    formFields?: Record<string, any>;
    highlightedText?: string;     // Only present during Refinement requests
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
    draftSummary?: string;        // Populated for refinement memory tracking
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
    generationParameters: Record<string, any>;
    playbookVersion: string;
    timestamp: string;
    [key: string]: any;
  };
}
4. The Dual-Path Workflow Orchestrator (workflows/draft-workflow.ts)
The orchestrator manages two distinct linear pipelines depending on whether the request is a brand-new generation or a targeted revision of highlighted text.

TypeScript
import { DraftState } from '../models/draft-state';
import { requirementExtractionStep } from '../steps/requirement-extraction';
import { retrievalStep } from '../steps/retrieval';
import { contextAssemblyStep } from '../steps/context-assembly';
import { generationStep } from '../steps/generation';
import { validationStep } from '../steps/validation';
import { riskReviewStep } from '../steps/risk-review';
import { refinementAssemblyStep } from '../steps/refinement-assembly';
import { saveStep } from '../steps/save';

export class DraftWorkflowOrchestrator {
  /**
   * Pipeline 1: Generation from Scratch / Template
   */
  async executeInitialWorkflow(initialState: DraftState): Promise<DraftState> {
    let state = { ...initialState };
    try {
      state = await requirementExtractionStep(state);
      state = await retrievalStep(state);
      state = await contextAssemblyStep(state);
      state = await generationStep(state);
      state = await validationStep(state);
      state = await riskReviewStep(state);
      state = await saveStep(state);
      return state;
    } catch (error) {
      throw new Error(`Initial drafting orchestrator failed: ${(error as Error).message}`);
    }
  }

  /**
   * Pipeline 2: Targeted Document Refinement Cycle
   */
  async executeRefinementWorkflow(initialState: DraftState): Promise<DraftState> {
    let state = { ...initialState };
    try {
      // 1. Skip extraction; load historical Generation Context + Playbook directly from past state
      state = await retrievalStep(state); 
      // 2. Specialized assembly combining Context + Summary + Highlights + Instructions
      state = await refinementAssemblyStep(state); 
      // 3. Execution, validation, and saving as an incremented version
      state = await generationStep(state);
      state = await validationStep(state);
      state = await riskReviewStep(state);
      state = await saveStep(state);
      return state;
    } catch (error) {
      throw new Error(`Refinement cycle orchestrator failed: ${(error as Error).message}`);
    }
  }
}
5. Precise Technical Steps Specification
Step 1: Requirement Extraction (steps/requirement-extraction.ts)
Evaluates state.request.rawInstructions along with formFields and sourceText if provided.

Calls OpenRouter with a strict JSON format schema to emit a validated RequirementContext containing structured intent parameters.

Step 2: Production Hybrid Knowledge Retrieval (steps/retrieval.ts)
Must follow your structured search pattern explicitly to achieve maximum context quality:

Metadata Pre-Filtering: Apply rigid constraints matching companyId, jurisdiction, and contractType.

Parallel Sub-Search Engines: * Execute Dense Vector Search via the vector database embeddings matching semantic intents.

Execute Sparse Vector Search (BM25 Keyword Search) matching explicit terms (e.g., "indemnify").

Reciprocal Rank Fusion (RRF): Programmatically merge the keyword results and vector hits to generate a balanced candidate set.

Cross-Encoder Reranking: Run candidates through a reranker module, discarding any items below a strict confidence threshold (e.g., < 0.7).

Output Mutation: Append the structured data cleanly into state.retrieval.

Step 3: Context Assembly & Document Skeletonization (steps/context-assembly.ts)
Constructs the strict layout backbone skeleton: Definitions ➔ Parties ➔ Confidentiality ➔ Liability ➔ Termination ➔ IP ➔ Governing Law ➔ Signatures.

Aggregates the retrieved rules, matching clause variants, skeleton parameters, and user constraints into one comprehensive prompt string saved under state.context.assembledPrompt.

Step 4: Refinement Assembly (steps/refinement-assembly.ts)
Executes specifically during the edit loop.

Combines: state.request.highlightedText + state.context.draftSummary + Original Generation Context + Playbook Rules + User's adjustment feedback.

Instructs the LLM to rewrite only the chosen text block while fully maintaining surrounding context variables and business rules.

Step 5: Draft Generation (steps/generation.ts)
Dispatches a single execution pass to OpenRouter using assembledPrompt.

The model serves purely as a text-rendering machine inside the platform's skeleton constraints.

Step 6: Validation Layer (steps/validation.ts)
Uses a hybrid approach: programmatic validation routines (for missing fields or layout errors) combined with targeted LLM assertion calls.

Verifies missing mandatory sections, identifies broken internal references, and catches structural formatting changes or playbook threshold violations.

Step 7: Risk Review (steps/risk-review.ts)
Evaluates substantive legal exposure of the output text block.

Populates state.riskReview.risks with a structured payload detailing: Severity, Explanation, and Suggested Replacement Clause.

Step 8: Memory & Full-Trace Persistence (steps/save.ts)
Encrypts the final draft copy.

Serializes the un-truncated DraftState object as an append-only historic log, preserving complete version parameters, playbook IDs, summaries, and parameters used