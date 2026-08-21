/**
 * Analyze feature — API layer.
 *
 * All network calls for the Analyze feature live here.
 * Components and hooks must not call fetch() directly.
 */

import { apiUrl } from "../../../config";

/**
 * Create a new folder in the document vault.
 * Returns true on success, false on failure.
 */
export async function createAnalyzeFolder(
  authToken: string,
  name: string,
): Promise<boolean> {
  const res = await fetch(apiUrl("/api/folders"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ name }),
  });
  return res.ok;
}

export interface AnalysisHistoryItem {
  jobId: string;
  sessionId: string | null;
  title: string;
  status: string;
  createdAt: string;
  renderedOutput?: string | null;
}

/** Fetch the user's past analysis runs, newest first. */
export async function fetchAnalysisHistory(
  authToken: string,
  limit = 50,
): Promise<AnalysisHistoryItem[]> {
  const res = await fetch(apiUrl(`/api/analysis/history?limit=${limit}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.history ?? [];
}

export interface AnalysisSessionSnapshot {
  sessionId: string;
  renderedOutput?: string;
  declineMessage?: string;
  conversation?: {
    turns?: Array<{
      role: "user" | "model";
      text: string;
    }>;
  };
}

/** Fetch the full snapshot of one analysis session. */
export async function fetchAnalysisSession(
  authToken: string,
  sessionId: string,
): Promise<AnalysisSessionSnapshot | null> {
  const res = await fetch(apiUrl(`/api/analysis/session/${encodeURIComponent(sessionId)}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}
