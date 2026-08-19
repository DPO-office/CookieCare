import crypto from "crypto";
import { pool } from "../../../config/database.js";
import { decryptData } from "../../../utils/crypto.js";
import { withTransaction } from "../../../utils/dbUtils.js";
import { jobRegistry, updateJobProgress } from "../../jobQueue.js";
import type { AnalysisState } from "../../../modules/analysis/models/analysis-state.js";
import { analysisEntry } from "../../../modules/analysis/entry/analysis-workflow.js";
import { applyUserAnswers } from "../../../modules/analysis/memory/conversation-store.js";
import { toPersistedState } from "../../../modules/analysis/utils/persisted-state.js";
import {
  CLAUSE_TAXONOMY_VERSION,
} from "../../../modules/analysis/taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../modules/analysis/taxonomies/index.js";
import { initAgentRunState } from "../../../modules/analysis/pac/types.js";
import { sanitizeFindingsForApi, sanitizeRenderedAnalysisOutput } from "../../../modules/analysis/utils/response-safety.js";

/**
 * Async job handler for Analysis PAC (coexists with legacy document_analysis).
 */
export async function executeAnalysisPac(
  jobId: string,
  userId: string,
  payload: any
): Promise<any> {
  if (payload.intent === "RESUME_ASK") {
    return handleResumeAsk(jobId, userId, payload);
  }
  return handleCreate(jobId, userId, payload);
}

async function handleCreate(jobId: string, userId: string, payload: any): Promise<any> {
  const requestedSessionId = payload.sessionId ? String(payload.sessionId) : "";
  const prior = requestedSessionId
    ? await loadLatestSession(requestedSessionId)
    : null;
  const sessionId = prior?.request.sessionId || requestedSessionId || `an_${crypto.randomUUID()}`;
  const documentIds: string[] = payload.documentIds ?? prior?.request.documentIds ?? [];
  const documentRoles =
    payload.documentRoles && typeof payload.documentRoles === "object"
      ? (payload.documentRoles as Record<string, "target" | "reference">)
      : prior?.request.documentRoles;
  const documentPresentation =
    payload.documentMode === "individual" || payload.documentMode === "unified"
      ? payload.documentMode
      : prior?.request.documentPresentation;
  const answerStyle =
    payload.answerStyle === "tabular" || payload.answerStyle === "narrative"
      ? payload.answerStyle
      : prior?.request.answerStyle;
  console.log(
    `[Analysis PAC] job create jobId=${jobId} session=${sessionId} docs=${documentIds.length} library=${payload.promptLibraryId || "-"} followUp=${Boolean(prior)}`
  );

  await updateJobProgress(jobId, userId, 15, "Reading documents…");

  const documentTexts: Record<string, string> = {};
  const documentTitles: Record<string, string> = {};

  for (const docId of documentIds) {
    const { rows } = await pool.query(
      `SELECT id, title, content, is_encrypted FROM files WHERE id = $1 LIMIT 1`,
      [docId]
    );
    if (!rows.length) {
      throw new Error(`Document not found: ${docId}`);
    }
    const row = rows[0];
    documentTitles[docId] = row.title || docId;
    documentTexts[docId] = row.is_encrypted ? decryptData(row.content) : row.content;
  }

  await updateJobProgress(jobId, userId, 30, "Thinking…");

  const onToken = (delta: string) => {
    jobRegistry.broadcastToken(userId, jobId, delta);
  };

  const initial: AnalysisState = {
    onProgress: async (percent, message) => {
      await updateJobProgress(jobId, userId, percent, message);
    },
    onToken,
    entryMode: "CREATE",
    organizationId: payload.organizationId
      ? String(payload.organizationId)
      : prior?.organizationId,
    agent: initAgentRunState("CREATE", { docCount: documentIds.length }),
    request: {
      sessionId,
      instruction: String(payload.instruction || ""),
      promptLibraryId: payload.promptLibraryId
        ? String(payload.promptLibraryId)
        : prior?.request.promptLibraryId,
      documentIds,
      documentRoles,
      documentPresentation,
      answerStyle,
      documentTexts,
      documentTitles,
    },
    conversation: prior?.conversation,
    priorAnalysis: prior
      ? {
          instruction: prior.request.instruction,
          intent: prior.intent,
          findings: prior.findings ?? [],
          requirementAssessments: prior.requirementAssessments,
          analysisArtifacts: prior.analysisArtifacts,
          renderedOutput: prior.renderedOutput,
          activeSkillIds: prior.activeSkillIds,
        }
      : undefined,
    activeSkillIds: prior?.activeSkillIds,
    history: prior?.history,
    workspace: {
      sessionId,
      documents: documentIds.map((docId) => ({
        docId,
        title: documentTitles[docId],
        role:
          documentRoles?.[docId] === "reference"
            ? ("reference" as const)
            : documentRoles?.[docId] === "target"
              ? ("target" as const)
              : ("unknown" as const),
        fullText: documentTexts[docId] ?? "",
        segments: [],
        clauses: [],
      })),
    },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
      generationParameters: { jobId },
    },
  };

  const result = await analysisEntry.run(initial);
  console.log(
    `[Analysis PAC] job done jobId=${jobId} reason=${result.agent?.stoppedReason ?? "completed"} findings=${result.findings.length} phase=${result.agent?.phase}`
  );
  await persistLedger(sessionId, result, userId);

  if (result.agent?.stoppedReason === "awaiting_user") {
    return {
      status: "needs_input",
      sessionId,
      openQuestions: result.agent.openQuestions,
      conversation: result.conversation,
    };
  }

  if (result.agent?.stoppedReason === "out_of_scope") {
    return {
      status: "out_of_scope",
      sessionId,
      declineMessage: result.declineMessage,
      conversation: result.conversation,
    };
  }

  return {
    status: result.agent?.stoppedReason ?? "completed",
    sessionId,
    findings: sanitizeFindingsForApi(result.findings),
    renderedOutput: sanitizeRenderedAnalysisOutput(result.renderedOutput),
    critique: result.critique,
    conversation: result.conversation,
    pinnedVersions: {
      clauseTaxonomyVersion: result.metadata.clauseTaxonomyVersion,
      riskTaxonomyVersion: result.metadata.riskTaxonomyVersion,
    },
  };
}

async function handleResumeAsk(jobId: string, userId: string, payload: any): Promise<any> {
  const sessionId = String(payload.sessionId || "");
  console.log(`[Analysis PAC] job resume-ask jobId=${jobId} session=${sessionId}`);
  await updateJobProgress(jobId, userId, 20, "Continuing…");

  const { rows } = await pool.query(
    `SELECT state_snapshot_json FROM analysis_state_ledger
     WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
    [sessionId]
  );
  if (!rows.length) {
    throw new Error(`No analysis session found: ${sessionId}`);
  }

  let state = rows[0].state_snapshot_json as AnalysisState;
  // Re-hydrate document texts if dropped from ledger
  if (!state.request.documentTexts || !Object.keys(state.request.documentTexts).length) {
    const texts: Record<string, string> = {};
    for (const docId of state.request.documentIds) {
      const file = await pool.query(
        `SELECT content, is_encrypted FROM files WHERE id = $1 LIMIT 1`,
        [docId]
      );
      if (file.rows.length) {
        const row = file.rows[0];
        texts[docId] = row.is_encrypted ? decryptData(row.content) : row.content;
      }
    }
    state = {
      ...state,
      request: { ...state.request, documentTexts: texts },
    };
  }

  state = await applyUserAnswers(state, payload.answers ?? {});
  state.onProgress = async (percent, message) => {
    await updateJobProgress(jobId, userId, percent, message);
  };
  state.onToken = (delta) => {
    jobRegistry.broadcastToken(userId, jobId, delta);
  };

  const result = await analysisEntry.resumeAfterAsk(state);
  await persistLedger(sessionId, result, userId);

  if (result.agent?.stoppedReason === "awaiting_user") {
    return {
      status: "needs_input",
      sessionId,
      openQuestions: result.agent.openQuestions,
      conversation: result.conversation,
    };
  }

  return {
    status: result.agent?.stoppedReason ?? "completed",
    sessionId,
    findings: sanitizeFindingsForApi(result.findings),
    renderedOutput: sanitizeRenderedAnalysisOutput(result.renderedOutput),
    critique: result.critique,
    conversation: result.conversation,
  };
}

async function loadLatestSession(sessionId: string): Promise<AnalysisState | null> {
  const { rows } = await pool.query(
    `SELECT state_snapshot_json FROM analysis_state_ledger
     WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
    [sessionId]
  );
  if (!rows.length) return null;
  return rows[0].state_snapshot_json as AnalysisState;
}

async function persistLedger(
  sessionId: string,
  state: AnalysisState,
  userId: string
): Promise<void> {
  const snapshot = toPersistedState(state);
  const version = (state.history?.length ?? 0) + 1;
  try {
    await withTransaction(userId, "USER", async (client) => {
      await client.query(
        `INSERT INTO analysis_state_ledger (session_id, version, state_snapshot_json, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (session_id, version) DO UPDATE
         SET state_snapshot_json = EXCLUDED.state_snapshot_json`,
        [sessionId, version, JSON.stringify(snapshot)]
      );
    });
  } catch (err: any) {
    // Soft-fail if migration not applied yet — still return job result
    console.warn("[analysis-handler] ledger persist failed:", err?.message ?? err);
  }
}
