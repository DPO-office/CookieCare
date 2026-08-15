import type { AgentRunState, EntryMode } from "../pac/types.js";
import type { AnalysisPlan } from "./analysis-plan.js";
import type { CritiqueReport } from "./critique-report.js";
import type { AnalysisConversation } from "./conversation.js";
import type { AnalysisWorkspace } from "./document-workspace.js";
import type { Finding } from "./finding.js";
import type { DraftTask } from "./draft-task.js";
import type { ClarificationRequest, IntentClassification } from "./intent.js";
import type { OrgMemoryProfile } from "../memory/org-memory.js";
import type { AnalysisSkillConfig, SkillRegimeRule } from "../skills/types.js";
import type { ExpectedClauseCheck } from "../skills/types.js";
import type { MissingClarification } from "./analysis-plan.js";

export interface AnalysisHistoryEntry {
  version: number;
  actor: "user" | "model" | "controller" | "validator";
  action: string;
  phase?: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface AnalysisFixPlan {
  items: Array<{
    workUnitId: string;
    instruction: string;
    sourceItemId: string;
  }>;
  targetedOnly: boolean;
}

export interface AnalysisState {
  onProgress?: (percent: number, message: string) => Promise<void>;
  onToken?: (delta: string) => void;

  entryMode?: EntryMode;
  agent?: AgentRunState;
  plan?: AnalysisPlan | null;
  critique?: CritiqueReport | null;
  conversation?: AnalysisConversation;
  fixPlan?: AnalysisFixPlan | null;
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
    /** Pre-loaded texts keyed by docId (handler resolves from files table). */
    documentTexts: Record<string, string>;
    documentTitles?: Record<string, string>;
  };

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
  draftTasks: DraftTask[];
  renderedOutput?: string;
  declineMessage?: string;

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
