import { useCallback, useState } from "react";
import type { DraftOpenQuestion } from "../api/draftingJobs";

export interface DraftChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: "text" | "progress" | "example" | "ask";
  questions?: DraftOpenQuestion[];
  /** When true, ASK form has been submitted and should render read-only. */
  askResolved?: boolean;
}

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useDraftChat() {
  const [messages, setMessages] = useState<DraftChatMessage[]>([]);

  const addUserMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: trimmed, kind: "text" },
    ]);
  }, []);

  const updateProgressMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.kind === "progress") {
        return [...prev.slice(0, -1), { ...last, content: trimmed }];
      }
      return [
        ...prev,
        { id: makeId(), role: "assistant", content: trimmed, kind: "progress" },
      ];
    });
  }, []);

  const addAssistantMessage = useCallback(
    (content: string, kind: DraftChatMessage["kind"] = "text") => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setMessages((prev) => [
        ...prev.filter((m) => m.kind !== "progress"),
        { id: makeId(), role: "assistant", content: trimmed, kind },
      ]);
    },
    []
  );

  const addAskMessage = useCallback((questions: DraftOpenQuestion[]) => {
    if (!questions.length) return;
    setMessages((prev) => [
      ...prev.filter((m) => m.kind !== "progress"),
      {
        id: makeId(),
        role: "assistant",
        kind: "ask",
        content: "I need a few details before I can finish drafting:",
        questions,
        askResolved: false,
      },
    ]);
  }, []);

  const resolveAskMessage = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, askResolved: true } : m))
    );
  }, []);

  const reset = useCallback(() => setMessages([]), []);

  return {
    messages,
    addUserMessage,
    updateProgressMessage,
    addAssistantMessage,
    addAskMessage,
    resolveAskMessage,
    reset,
  };
}
