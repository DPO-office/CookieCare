import { apiUrl } from "../../../config";
import { AgentMarkup, NegotiationContext, NegotiationStrategy, StrategyDraftResult, StrategyPosition, SessionResolveResponse } from "../types";

export async function evaluateDocument(
  authToken: string,
  content: string,
  documentTitle: string,
  documentType: string,
  playbookId?: string | null
): Promise<{ markups: AgentMarkup[]; info?: string }> {
  const res = await fetch(apiUrl("/api/negotiate/evaluate"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      content,
      documentTitle,
      documentType,
      ...(playbookId ? { playbookId } : {}),
    }),
  });

  const parsed = await res.json();

  // Surface any server-side error — this was previously masked by the old
  // endpoint returning HTTP 200 { markups: [], warning: "..." } on failure,
  // which caused the UI to silently show "All clear" instead of an error.
  if (!res.ok) {
    throw new Error(parsed.error || parsed.detail || "Clause evaluation failed.");
  }

  // Pass through the optional info message (e.g. large document notice) so
  // the hook layer can display it if desired.
  return {
    markups: parsed.data?.markups || [],
    ...(parsed.info ? { info: parsed.info } : {}),
  };
}

// ─── Phase 2: Negotiation session persistence ────────────────────────────────

/**
 * The single initialization call for opening a negotiation. Resumes an
 * existing active session (no LLM call) when one exists, or creates one via
 * a fresh evaluation when it doesn't (or when forceNew is set — used by the
 * "Re-run evaluation" action).
 */
export async function resolveNegotiationSession(
  authToken: string,
  params: { documentId: string; playbookId?: string | null; forceNew?: boolean }
): Promise<SessionResolveResponse> {
  const res = await fetch(apiUrl("/api/negotiate/session/resolve"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      documentId: params.documentId,
      ...(params.playbookId ? { playbookId: params.playbookId } : {}),
      ...(params.forceNew ? { forceNew: true } : {}),
    }),
  });
  const parsed = await res.json();
  if (!res.ok) throw new Error(parsed.error || "Failed to resolve negotiation session.");
  return parsed as SessionResolveResponse;
}

/** Durably rejects a finding (previously: purely client-side array filtering). */
export async function rejectFinding(
  authToken: string,
  documentId: string,
  clauseId: string
): Promise<{ success: boolean; alreadyRejected?: boolean }> {
  const res = await fetch(apiUrl(`/api/negotiate/finding/${encodeURIComponent(clauseId)}/reject`), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ documentId }),
  });
  const parsed = await res.json();
  if (!res.ok) {
    const err: any = new Error(parsed.error || "Failed to reject finding.");
    err.status = res.status;
    throw err;
  }
  return parsed;
}

export async function submitRedline(
  authToken: string,
  docId: string,
  originalText: string,
  proposedText: string,
  comment: string
): Promise<{ id: string }> {
  const res = await fetch(apiUrl(`/api/documents/${docId}/redline`), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ originalText, proposedText, comment }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit redline");
  return data;
}

export async function acceptRedline(authToken: string, docId: string, redlineId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/documents/${docId}/redline/${redlineId}/accept`), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to accept redline");
  }
}

export async function rejectRedline(authToken: string, docId: string, redlineId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/documents/${docId}/redline/${redlineId}/reject`), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to reject redline");
  }
}

export async function generateCompromise(
  authToken: string,
  originalText: string,
  riskExplanation: string,
  playbookPreferred: boolean,
  userInstruction?: string
): Promise<string>;
export async function generateCompromise(
  authToken: string,
  originalText: string,
  riskExplanation: string,
  playbookPreferred: boolean,
  userInstruction: string | undefined,
  strategyOptions: {
    strategyPosition: StrategyPosition & { tier: "preferred" | "balanced" | "fallback"; confidence?: number };
    analysisFinding?: NegotiationContext["analysisFinding"];
    compareFinding?: NegotiationContext["compareFinding"];
    playbookRule?: NegotiationContext["playbookRule"];
  },
  /** Phase 2 (optional): when both are supplied, the server caches the draft on the finding. */
  persistTo?: { documentId: string; clauseId: string }
): Promise<StrategyDraftResult>;
export async function generateCompromise(
  authToken: string,
  originalText: string,
  riskExplanation: string,
  playbookPreferred: boolean,
  userInstruction?: string,
  strategyOptions?: {
    strategyPosition: StrategyPosition & { tier: "preferred" | "balanced" | "fallback"; confidence?: number };
    analysisFinding?: NegotiationContext["analysisFinding"];
    compareFinding?: NegotiationContext["compareFinding"];
    playbookRule?: NegotiationContext["playbookRule"];
  },
  persistTo?: { documentId: string; clauseId: string }
): Promise<string | StrategyDraftResult> {
  const body: Record<string, unknown> = {
    originalText,
    riskExplanation,
    userPrompt: userInstruction ?? "",
    playbookPreferred,
  };

  if (strategyOptions) {
    body.strategyPosition = strategyOptions.strategyPosition;
    if (strategyOptions.analysisFinding) body.analysisFinding = strategyOptions.analysisFinding;
    if (strategyOptions.compareFinding)  body.compareFinding  = strategyOptions.compareFinding;
    if (strategyOptions.playbookRule)    body.playbookRule    = strategyOptions.playbookRule;
  }
  if (persistTo) {
    body.documentId = persistTo.documentId;
    body.clauseId = persistTo.clauseId;
  }

  const res = await fetch(apiUrl("/api/negotiate/compromise"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });
  const parsed = await res.json();
  if (!res.ok) throw new Error(parsed.error || "Failed to generate compromise");

  // Strategy path: server returns { result, draftMeta }
  if (strategyOptions && parsed.draftMeta) {
    // Guard: ensure result is present to avoid silent undefined replacement
    if (!parsed.result) throw new Error("Strategy draft returned empty result.");
    return parsed as StrategyDraftResult;
  }
  // Legacy path: server returns { result: string }
  return parsed.result as string;
}

export async function fetchNegotiationContext(
  authToken: string,
  params: {
    documentId: string;
    original: string;
    clauseId: string;
    clauseType?: string;
    charOffset?: number;
    userInstruction?: string;
    /** ID of the Vault AI Rulebook selected by the user, if any */
    playbookId?: string;
  }
): Promise<NegotiationContext> {
  const res = await fetch(apiUrl("/api/negotiate/context"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
  const parsed = await res.json();
  if (!res.ok) throw new Error(parsed.error || "Failed to fetch negotiation context");
  return parsed.context as NegotiationContext;
}

export async function fetchNegotiationStrategy(
  authToken: string,
  context: NegotiationContext,
  documentId?: string
): Promise<NegotiationStrategy> {
  const res = await fetch(apiUrl("/api/negotiate/strategy"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ context, ...(documentId ? { documentId } : {}) }),
  });
  const parsed = await res.json();
  if (!res.ok) throw new Error(parsed.error || "Failed to generate negotiation strategy");
  return parsed.strategy as NegotiationStrategy;
}

export async function fetchDocumentDetails(authToken: string, docId: string): Promise<any> {
  const res = await fetch(apiUrl(`/api/documents/${docId}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error("Failed to load document");
  return res.json();
}

export async function saveNegotiationStep(
  authToken: string,
  documentId: string,
  content: string,
  version: number,
  baseVersion?: number,
  /** Phase 2 (optional): when this save is Accepting a specific finding, its clauseId. */
  clauseId?: string
): Promise<any> {
  const res = await fetch(apiUrl("/api/negotiate/save-step"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ documentId, content, version, baseVersion, ...(clauseId ? { clauseId } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 409) {
      const err: any = new Error(
        data.error || "This document changed since you last loaded it. Reload and retry."
      );
      err.status = 409;
      throw err;
    }
    throw new Error(data.error || "Failed to save negotiation step.");
  }
  return data;
}

export async function exportDocument(
  authToken: string,
  docId: string,
  title: string,
  content: string,
  format: "pdf" | "docx"
): Promise<Blob> {
  const res = await fetch(apiUrl("/api/documents/export"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      documentId: docId,
      title,
      content,
      format,
      contentType: "legal_document",
    }),
  });
  if (!res.ok) throw new Error("Failed to export document");
  return res.blob();
}
