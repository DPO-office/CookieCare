import { useState, useCallback } from "react";
import {
  fetchAnalysisHistory,
  fetchAnalysisSession,
  type AnalysisHistoryItem,
} from "../api/analyzeApi";
import type { Message } from "../types";

export type { AnalysisHistoryItem };

function snapshotToMessages(
  instruction: string,
  renderedOutput?: string | null,
  conversation?: { turns?: Array<{ role: "user" | "model"; text: string }> }
): Message[] {
  // Full conversation replay (multi-turn)
  if (conversation?.turns && conversation.turns.length > 0) {
    const msgs = conversation.turns
      .filter((t) => t.text?.trim())
      .map((t) => ({
        sender: t.role === "user" ? ("user" as const) : ("gemini" as const),
        text: t.text,
      }));
    if (msgs.length > 0) return msgs;
  }

  // Single-turn: prompt + rendered report
  const msgs: Message[] = [];
  if (instruction) msgs.push({ sender: "user", text: instruction });
  if (renderedOutput?.trim()) msgs.push({ sender: "gemini", text: renderedOutput.trim() });
  return msgs;
}

export function useAnalysisHistory(authToken: string) {
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchAnalysisHistory(authToken);
      setHistory(items);
    } catch {
      setError("Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  /**
   * Load a session and return restored { messages, docName }.
   *
   * Strategy (fastest path first):
   * 1. If the history item already carries renderedOutput → use it immediately,
   *    no extra network call.
   * 2. If there's a sessionId → fetch full session snapshot for conversation turns.
   * 3. Otherwise fall back to just the title as a user message.
   */
  const loadSession = useCallback(
    async (
      item: AnalysisHistoryItem
    ): Promise<{ messages: Message[]; docName: string } | null> => {
      const docName = item.title || "Untitled analysis";

      // Fast path — renderedOutput is already in the history item
      if (item.renderedOutput?.trim()) {
        return {
          messages: snapshotToMessages(item.title, item.renderedOutput),
          docName,
        };
      }

      // Fetch full session snapshot for conversation turns / rendered output
      if (item.sessionId) {
        setLoadingSession(true);
        try {
          const snapshot = await fetchAnalysisSession(authToken, item.sessionId);
          if (snapshot) {
            const messages = snapshotToMessages(
              item.title,
              snapshot.renderedOutput,
              snapshot.conversation as any
            );
            if (messages.length > 0) {
              return { messages, docName };
            }
          }
        } catch {
          // fall through to minimal fallback
        } finally {
          setLoadingSession(false);
        }
      }

      // Last resort — show at least the prompt so the view isn't empty
      if (item.title) {
        return {
          messages: [{ sender: "user", text: item.title }],
          docName,
        };
      }

      return null;
    },
    [authToken]
  );

  return {
    history,
    loading,
    loadingSession,
    error,
    fetchHistory,
    loadSession,
  };
}
