// ─── useCompareChat ───────────────────────────────────────────────────────────
// Manages the active compare session state and routes follow-up questions
// to the Compare Chat backend agent.
//
// Usage:
//   - Call `activateSession(sessionId)` once the comparison completes.
//   - Call `isActiveSession()` to know whether the current chat context is
//     a compare session (used by useChat to route messages).
//   - Call `askQuestion(question, history)` to send a follow-up question.
//   - Call `clearSession()` when the user resets the conversation.

import { useState, useCallback, useRef } from "react";
import { askCompareChat, type CompareChatTurn } from "../api/compareChatApi";

interface UseCompareChatOptions {
  authToken: string;
}

export interface UseCompareChatReturn {
  /** ID of the currently active compare session (= job_id), or null */
  activeSessionId: string | null;
  /** Set the active session once comparison completes */
  activateSession: (sessionId: string) => void;
  /** Returns true when we have an active compare session */
  isActiveSession: () => boolean;
  /**
   * Ask a follow-up question against the active compare session.
   * Returns the markdown answer string.
   * Throws when the session is not active or the request fails.
   */
  askQuestion: (
    question: string,
    history: CompareChatTurn[]
  ) => Promise<string>;
  /** Clear the active session (e.g. when the user starts a new conversation) */
  clearSession: () => void;
}

export function useCompareChat({
  authToken,
}: UseCompareChatOptions): UseCompareChatReturn {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Keep a ref in sync so callbacks always see the latest value without
  // requiring re-creation.
  const sessionIdRef = useRef<string | null>(null);

  const activateSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    sessionIdRef.current = sessionId;
    console.log(`[useCompareChat] Session activated: ${sessionId}`);
  }, []);

  const clearSession = useCallback(() => {
    setActiveSessionId(null);
    sessionIdRef.current = null;
    console.log("[useCompareChat] Session cleared");
  }, []);

  const isActiveSession = useCallback((): boolean => {
    const active = sessionIdRef.current !== null;
    return active;
  }, []);

  const askQuestion = useCallback(
    async (question: string, history: CompareChatTurn[]): Promise<string> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        throw new Error(
          "No active comparison session. Please run a comparison first."
        );
      }

      try {
        const response = await askCompareChat(sessionId, question, history, authToken);
        return response.answer;
      } catch (err: any) {
        // Surface session expiry clearly so the user knows what to do
        if (err?.status === 404 || err?.message?.includes("not found") || err?.message?.includes("expired")) {
          // Clear the stale session so further messages go through the standard path
          setActiveSessionId(null);
          sessionIdRef.current = null;
          throw new Error(
            "Your comparison session has expired (sessions last 4 hours). " +
            "Please run a new comparison to continue the conversation."
          );
        }
        throw err;
      }
    },
    [authToken]
  );

  return {
    activeSessionId,
    activateSession,
    isActiveSession,
    askQuestion,
    clearSession,
  };
}
