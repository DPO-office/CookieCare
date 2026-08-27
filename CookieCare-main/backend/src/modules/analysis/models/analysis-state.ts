import type { AgentRunState, EntryMode } from "../pac/types.js";
import type { AnalysisProfile, ThinkingMode } from "../pac/analysis-profile.js";
import type { AnalysisPlan, MissingClarification, PlanAuditRecord } from "./analysis-plan.js";
import type { CritiqueReport, FixItem } from "./critique-report.js";
import type { AuditReport } from "./audit-report.js";
import type { AnalysisConversation } from "./conversation.js";
import type { AnalysisWorkspace } from "./document-workspace.js";
import type { Finding } from "./finding.js";
import type { RequirementAssessment } from "./requirement-assessment.js";
import type { AnalyticalSynthesis } from "./analytical-synthesis.js";
import type { AnalysisArtifact, SharedEvidenceBundle } from "./evidence-package.js";
import type { DraftTask } from "./draft-task.js";
import type {
  AnswerStyle,
  ClarificationRequest,
  DocumentPresentation,
  IntentClassification,
  ReportSpec,
} from "./intent.js";
import type { OrgMemoryProfile } from "../memory/org-memory.js";
import type { AnalysisSkillConfig, SkillRegimeRule } from "../skills/runtime/catalog/types.js";
import type { ExpectedClauseCheck } from "../skills/runtime/catalog/types.js";
import type { TierCCacheEntry, WorkUnitOutcome } from "./work-unit-outcome.js";

/** Local repair payload — CRITIQUE → ACT without full PLAN. */
export interface RepairContext {
  analysisId: string;
  kind: "synthesis" | "evaluation" | "package_shape" | "evidence";
  affectedRequirementIds: string[];
  affectedPackageIds: string[];
  critiqueIssueDetails: string[];
  preserveFindingsOutsideAffected: true;
}

/** Last synthesis call metadata for truncation-aware render retry. */
export interface SynthesisMeta {
  truncated: boolean;
  maxOutputTokens: number;
  depth: ReportSpec["depth"];
}

/** One generated report section, stored for assemble and targeted regen. */
export interface ReportSectionBlock {
  id: string;
  heading: string;
  markdown: string;
}

export interface AnalysisHistoryEntry {
  version: number;
  actor: "user" | "model" | "controller" | "validator";
  action: string;
  phase?: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

/** Prior completed analysis reused for follow-up turns. */
export interface PriorAnalysisSnapshot {
  instruction: string;
  intent?: IntentClassification | null;
  findings: Finding[];
  requirementAssessments?: RequirementAssessment[];
  analysisArtifacts?: Record<string, AnalysisArtifact>;
  renderedOutput?: string;
  activeSkillIds?: string[];
  analyticalSynthesis?: AnalyticalSynthesis;
}

export interface AnalysisFixPlan {
  items: FixItem[];
  targetedOnly: boolean;
}

export interface AnalysisState {
  onProgress?: (percent: number, message: string) => Promise<void>;
  onToken?: (delta: string) => void;
  /** When true, renderer tokens may reach the UI during ACT/AUDIT. */
  streamRenderOutput?: boolean;
  /** Chars already sent via onToken — persist skips a duplicate dump. */
  userFacingCharsEmitted?: number;

  entryMode?: EntryMode;
  agent?: AgentRunState;
  /** Resolved once from request.thinkingMode — budgets + Gemini thinking overlays. */
  analysisProfile?: AnalysisProfile;
  plan?: AnalysisPlan | null;
  critique?: CritiqueReport | null;
  auditReport?: AuditReport | null;
  conversation?: AnalysisConversation;
  fixPlan?: AnalysisFixPlan | null;
  /** Set by CRITIQUE for ACT targeted repair (cleared after ACT). */
  repairContext?: RepairContext | null;
  /** Last synthesizeReport outcome — critique uses truncation for render-only redo. */
  synthesisMeta?: SynthesisMeta | null;
  /** Per-section synthesis blocks for assemble and targeted regen. */
  reportSections?: ReportSectionBlock[];
  organizationId?: string;

  request: {
    sessionId: string;
    instruction: string;
    /** Path A — library category or prompt id (e.g. "privacy", "commercial"). */
    promptLibraryId?: string;
    documentIds: string[];
    /**
     * Optional upload-time roles. Primary mechanism for playbook vs target.
     * Values: "target" | "reference".
     */
    documentRoles?: Record<string, "target" | "reference">;
    /** Combined vs per-document presentation when more than one target is uploaded. */
    documentPresentation?: DocumentPresentation;
    /** Narrative prose vs tabular tables. */
    answerStyle?: AnswerStyle;
    /** Compute / verification budget (lite | deep). Orthogonal to ReportDepth. */
    thinkingMode?: ThinkingMode;
    /** Pre-loaded texts keyed by docId (handler resolves from files table). */
    documentTexts: Record<string, string>;
    documentTitles?: Record<string, string>;
  };

  /** Set when this CREATE run continues an existing analysis session. */
  priorAnalysis?: PriorAnalysisSnapshot;

  workspace: AnalysisWorkspace;
  intent?: IntentClassification | null;
  /** Resolved in PLAN from promptLibraryId or free-text selection. */
  activeSkills?: AnalysisSkillConfig[];
  activeSkillIds?: string[];
  mergedClauseTypes?: string[];
  mergedRiskCategories?: string[];
  mergedExpectedClauses?: ExpectedClauseCheck[];
  mergedRegimeRules?: SkillRegimeRule[];
  skillMarkdown?: Record<string, string>;
  skillSelectionPath?: "library" | "free_text" | "fallback";
  pendingSkillClarification?: MissingClarification;
  clarificationRequest?: ClarificationRequest;
  orgMemory?: OrgMemoryProfile;
  /** One-line notes when memory biased routing/defaults — never finding substance. */
  memoryAttributions?: string[];
  /** Draft-status skills selected for a real request — must appear in render output. */
  partialCoverageWarning?: string[];
  findings: Finding[];
  /**
   * Reporting/aggregation view over `findings`, keyed by PLAN requirement.
   * Never an authoritative verdict store — derived from findings in ACT.
   */
  requirementAssessments?: RequirementAssessment[];
  /**
   * Interpretive layer over locked assessments. Must not mutate statuses.
   */
  analyticalSynthesis?: AnalyticalSynthesis | null;
  /** Shared evidence extracted once per package and reused by evaluations. */
  sharedEvidence?: Record<string, SharedEvidenceBundle>;
  /** Structured package outputs (inventories, comparisons). Keyed by artifact id. */
  analysisArtifacts?: Record<string, AnalysisArtifact>;
  draftTasks: DraftTask[];
  renderedOutput?: string;
  declineMessage?: string;

  /** Per-unit terminal resolution across CRITIQUE iterations. */
  workUnitOutcomes?: Record<string, WorkUnitOutcome>;
  /** Session-scoped Tier C lookup cache keyed by ruleId / matrixRowId / category. */
  tierCCache?: Record<string, TierCCacheEntry>;
  replanAttemptedThisRun?: boolean;
  auditRecord?: PlanAuditRecord;

  history?: AnalysisHistoryEntry[];
  metadata: {
    timestamp: string;
    clauseTaxonomyVersion: string;
    riskTaxonomyVersion: string;
    modelVersions?: Record<string, string>;
    generationParameters?: Record<string, unknown>;
    [key: string]: unknown;
  };
}
