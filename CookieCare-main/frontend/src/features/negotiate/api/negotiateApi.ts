import { apiUrl } from "../../../config";
import { AgentMarkup } from "../types";

export async function evaluateDocument(
  authToken: string,
  content: string,
  documentTitle: string,
  documentType: string
): Promise<{ markups: AgentMarkup[] }> {
  const res = await fetch(apiUrl("/api/negotiate/evaluate"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ content, documentTitle, documentType }),
  });
  const parsed = await res.json();
  if (!res.ok) throw new Error(parsed.error || "Evaluation failed.");
  return { markups: parsed.data?.markups || [] };
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
  playbookPreferred: boolean
): Promise<string> {
  const res = await fetch(apiUrl("/api/negotiate/compromise"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ originalText, riskExplanation, userPrompt: "", playbookPreferred }),
  });
  const parsed = await res.json();
  if (!res.ok) throw new Error(parsed.error || "Failed to generate compromise");
  return parsed.result;
}

export async function fetchDocumentDetails(authToken: string, docId: string): Promise<any> {
  const res = await fetch(apiUrl(`/api/documents/${docId}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error("Failed to load document");
  return res.json();
}
