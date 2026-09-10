import { apiUrl } from "../../../config";
import { AgentMarkup, NegotiationContext, NegotiationStrategy, StrategyDraftResult, StrategyPosition } from "../types";

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
  }
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
  }
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
  context: NegotiationContext
): Promise<NegotiationStrategy> {
  const res = await fetch(apiUrl("/api/negotiate/strategy"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ context }),
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
  version: number
): Promise<any> {
  const res = await fetch(apiUrl("/api/negotiate/save-step"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ documentId, content, version }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save negotiation step.");
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
