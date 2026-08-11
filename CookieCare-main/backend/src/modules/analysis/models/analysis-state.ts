import type { AgentRunState, EntryMode } from "../pac/types.js";
import type { AnalysisPlan } from "./analysis-plan.js";
import type { CritiqueReport } from "./critique-report.js";
import type { AnalysisConversation } from "./conversation.js";
import type { AnalysisWorkspace } from "./document-workspace.js";
import type { Finding } from "./finding.js";
import type { DraftTask } from "./draft-task.js";
import type { IntentClassification } from "./intent.js";

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
    documentIds: string[];
    /** Pre-loaded texts keyed by docId (handler resolves from files table). */
    documentTexts: Record<string, string>;
    documentTitles?: Record<string, string>;
  };

  workspace: AnalysisWorkspace;
  intent?: IntentClassification | null;
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
