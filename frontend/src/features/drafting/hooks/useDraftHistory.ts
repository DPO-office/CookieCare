import { useState, useCallback } from "react";
import {
  fetchDraftHistory,
  deleteDraftHistoryEntry,
  type DraftHistoryItem,
} from "../api/draftingHistoryApi";

export type { DraftHistoryItem };

export function useDraftHistory(authToken: string) {
  const [history, setHistory] = useState<DraftHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate error state for delete so it doesn't replace the list-level error
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchDraftHistory(authToken);
      setHistory(items);
    } catch (err: any) {
      // fetchDraftHistory now throws on HTTP/network errors, so this will fire
      // for real failures only. An empty list from a 200 response still reaches
      // setHistory(items) above, so empty-history and error are distinguishable.
      setError(err?.message ?? "Failed to load draft history.");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const deleteEntry = useCallback(
    async (jobId: string): Promise<boolean> => {
      setDeleteError(null);
      try {
        const ok = await deleteDraftHistoryEntry(authToken, jobId);
        if (ok) {
          setHistory((prev) => prev.filter((item) => item.jobId !== jobId));
          return true;
        }
        // deleteDraftHistoryEntry returned false without throwing — treat as
        // a generic failure so the entry stays in the list.
        setDeleteError("Deletion failed. Please try again.");
        return false;
      } catch (err: any) {
        setDeleteError(err?.message ?? "Deletion failed. Please try again.");
        return false;
      }
    },
    [authToken]
  );

  const clearDeleteError = useCallback(() => setDeleteError(null), []);

  return { history, loading, error, deleteError, clearDeleteError, fetchHistory, deleteEntry };
}
