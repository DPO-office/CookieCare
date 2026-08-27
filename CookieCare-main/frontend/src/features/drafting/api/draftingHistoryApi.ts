import { apiUrl } from "../../../config";

export interface DraftHistoryItem {
  jobId: string;
  documentId: string | null;
  title: string;
  status: string;
  createdAt: string;
  formatted_text?: string | null;
}

/** Fetch the user's past completed draft jobs, newest first.
 *  Throws an Error on any non-2xx HTTP response or network failure so the
 *  caller can distinguish a real server error from "no drafts yet". */
export async function fetchDraftHistory(
  authToken: string,
  limit = 50
): Promise<DraftHistoryItem[]> {
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/drafting/history?limit=${limit}`), {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch (networkErr) {
    throw new Error("Network error — could not reach the server.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as any)?.error ?? `Server error (${res.status})`
    );
  }
  const data = await res.json();
  return data.history ?? [];
}

/** Hard-delete a history entry by jobId. Returns true on success. */
export async function deleteDraftHistoryEntry(
  authToken: string,
  jobId: string
): Promise<boolean> {
  const res = await fetch(
    apiUrl(`/api/drafting/history/${encodeURIComponent(jobId)}`),
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    }
  );
  return res.ok;
}
