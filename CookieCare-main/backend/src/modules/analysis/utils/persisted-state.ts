import type { AnalysisState, AnalysisHistoryEntry } from "../models/analysis-state.js";
import type { AnalysisPlan } from "../models/analysis-plan.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { AnalysisConversation } from "../models/conversation.js";
import type { Finding } from "../models/finding.js";
import type { AgentRunState, EntryMode } from "../pac/types.js";
import type { AnalysisWorkspace } from "../models/document-workspace.js";
import type { IntentClassification } from "../models/intent.js";

export interface PersistedAnalysisState {
  request: AnalysisState["request"];
  workspace: AnalysisWorkspace;
  intent?: IntentClassification | null;
  findings: Finding[];
  renderedOutput?: string;
  declineMessage?: string;
  history: AnalysisHistoryEntry[];
  metadata: AnalysisState["metadata"];
  entryMode?: EntryMode;
  agent?: AgentRunState;
  plan?: AnalysisPlan | null;
  critique?: CritiqueReport | null;
  conversation?: AnalysisConversation;
  organizationId?: string;
}

export function toPersistedState(state: AnalysisState): PersistedAnalysisState {
  return {
    request: {
      sessionId: state.request.sessionId,
      instruction: state.request.instruction,
      documentIds: state.request.documentIds,
      // Drop large texts from ledger — workspace keeps segmented form
      documentTexts: {},
      documentTitles: state.request.documentTitles,
    },
    workspace: {
      sessionId: state.workspace.sessionId,
      documents: state.workspace.documents.map((d) => ({
        ...d,
        // Keep segments + clauses; fullText needed for get_span verification
      })),
    },
    intent: state.intent,
    findings: state.findings,
    renderedOutput: state.renderedOutput,
    declineMessage: state.declineMessage,
    history: state.history ?? [],
    metadata: state.metadata,
    entryMode: state.entryMode,
    agent: state.agent,
    plan: state.plan,
    critique: state.critique,
    conversation: state.conversation,
    organizationId: state.organizationId,
  };
}

export function appendHistory(
  state: AnalysisState,
  entry: AnalysisHistoryEntry
): AnalysisState {
  return { ...state, history: [...(state.history ?? []), entry] };
}
