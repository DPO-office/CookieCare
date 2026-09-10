import { createHash } from "node:crypto";
import type { AnalysisState, AnalysisHistoryEntry } from "../models/analysis-state.js";
import type { ComplianceReportSnapshot } from "../models/compliance-report.js";
import type { AnalysisPlan, MissingClarification, PlanAuditRecord } from "../models/analysis-plan.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { AnalysisConversation } from "../models/conversation.js";
import type { Finding } from "../models/finding.js";
import type { AgentRunState, EntryMode } from "../pac/types.js";
import type { AnalysisWorkspace } from "../models/document-workspace.js";
import type { ClarificationRequest, IntentClassification } from "../models/intent.js";
import type { OrgMemoryProfile } from "../memory/org-memory.js";

export interface PersistedAnalysisState {
  request: AnalysisState["request"];
  workspace: AnalysisWorkspace;
  intent?: IntentClassification | null;
  activeSkillIds?: string[];
  mergedExpectedClauses?: AnalysisState["mergedExpectedClauses"];
  mergedRegimeRules?: AnalysisState["mergedRegimeRules"];
  skillSelectionPath?: AnalysisState["skillSelectionPath"];
  pendingSkillClarification?: MissingClarification;
  clarificationRequest?: ClarificationRequest;
  orgMemory?: OrgMemoryProfile;
  memoryAttributions?: string[];
  findings: Finding[];
  requirementAssessments?: AnalysisState["requirementAssessments"];
  analysisArtifacts?: AnalysisState["analysisArtifacts"];
  complianceReportSnapshot?: AnalysisState["complianceReportSnapshot"];
  compliancePresentationPlan?: AnalysisState["compliancePresentationPlan"];
  complianceReportValidation?: AnalysisState["complianceReportValidation"];
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
  auditRecord?: PlanAuditRecord;
}

export function toPersistedState(state: AnalysisState): PersistedAnalysisState {
  return {
    request: {
      sessionId: state.request.sessionId,
      instruction: state.request.instruction,
      promptLibraryId: state.request.promptLibraryId,
      documentIds: state.request.documentIds,
      documentRoles: state.request.documentRoles,
      answerStyle: state.request.answerStyle,
      thinkingMode: state.request.thinkingMode,
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
    activeSkillIds: state.activeSkillIds,
    mergedExpectedClauses: state.mergedExpectedClauses,
    mergedRegimeRules: state.mergedRegimeRules,
    skillSelectionPath: state.skillSelectionPath,
    pendingSkillClarification: state.pendingSkillClarification,
    clarificationRequest: state.clarificationRequest,
    orgMemory: state.orgMemory,
    memoryAttributions: state.memoryAttributions,
    findings: state.findings,
    requirementAssessments: state.requirementAssessments,
    analysisArtifacts: state.analysisArtifacts,
    complianceReportSnapshot: state.complianceReportSnapshot,
    compliancePresentationPlan: state.compliancePresentationPlan,
    complianceReportValidation: state.complianceReportValidation,
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
    auditRecord: state.plan?.auditRecord ?? state.auditRecord,
  };
}

/** Compare source text, document membership, and recorded roles, independent of order or title. */
export function complianceSnapshotMatchesSources(
  snapshot: ComplianceReportSnapshot,
  state: Pick<AnalysisState, "request" | "workspace">
): boolean {
  const requestedIds = new Set(state.request.documentIds);
  const snapshotIds = new Set(snapshot.documents.map((document) => document.documentId));
  if (
    requestedIds.size !== state.request.documentIds.length ||
    snapshotIds.size !== snapshot.documents.length ||
    requestedIds.size !== snapshotIds.size ||
    [...requestedIds].some((id) => !snapshotIds.has(id))
  ) return false;

  const documents = new Map(state.workspace.documents.map((document) => [document.docId, document]));
  // An unpopulated workspace may use request texts; a populated one must describe the same set.
  if (documents.size > 0 && (
    documents.size !== state.workspace.documents.length ||
    documents.size !== requestedIds.size ||
    [...documents.keys()].some((id) => !requestedIds.has(id))
  )) return false;

  return snapshot.documents.every((document) => {
    const workspaceDocument = documents.get(document.documentId);
    // Explicit request roles win, as in resolveDocumentRoles; otherwise use the resolved workspace.
    const currentRole = state.request.documentRoles?.[document.documentId] ?? workspaceDocument?.role;
    // Legacy snapshots lack roles. A recorded role requires a matching current role, even if unknown.
    if (document.role !== undefined && document.role !== currentRole) return false;
    const texts = [
      state.request.documentTexts?.[document.documentId],
      workspaceDocument?.fullText,
    ].filter((text): text is string => typeof text === "string");
    // When both sources exist, disagreement must also force fresh analysis.
    return texts.length > 0 && texts.every((text) =>
      createHash("sha256").update(text).digest("hex") === document.contentHash
    );
  });
}

export function appendHistory(
  state: AnalysisState,
  entry: AnalysisHistoryEntry
): AnalysisState {
  return { ...state, history: [...(state.history ?? []), entry] };
}
