// ─── Compare Chat — API Service ───────────────────────────────────────────────
// Backend communication for Compare follow-up questions.
// One call: POST /api/compare/chat → { answer: string }

import { apiUrl } from "../../../../config";

export interface CompareChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompareChatResponse {
  answer: string;
}

/**
 * Ask a follow-up question about a completed comparison.
 *
 * @param sessionId   The job_id returned by POST /api/compare/start
 * @param question    The user's question text
 * @param history     Prior chat turns (sent for conversational continuity)
 * @param authToken   Bearer token
 */
export async function askCompareChat(
  sessionId: string,
  question: string,
  history: CompareChatTurn[],
  authToken: string
): Promise<CompareChatResponse> {
  const res = await fetch(apiUrl("/api/compare/chat"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, question, history }),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(
      data.error ?? `Compare chat failed (${res.status})`
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return data as CompareChatResponse;
}
