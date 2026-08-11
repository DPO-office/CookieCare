// ─── useChat ──────────────────────────────────────────────────────────────────
// Owns all chat state and the submit → API → streaming-update cycle.
// Components only call the returned handlers; they have zero knowledge of fetch.

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, QuickAction, UploadedFile, CompareResult } from "../types";
import { callDPAReview, callVendorReview, callAIEthicsReview } from "../services/randtrustApi";
import { uid } from "../lib/utils";

interface UseChatOptions {
  authToken: string;
  /**
   * If provided, follow-up messages are routed through the compare chat agent
   * when `isCompareChatActive()` returns true.
   */
  isCompareChatActive?: () => boolean;
  askCompareQuestion?: (
    question: string,
    history: Array<{ role: "user" | "assistant"; content: string }>
  ) => Promise<string>;
}

export function useChat({ authToken, isCompareChatActive, askCompareQuestion }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<QuickAction | null>(null);

  // Keep a ref in sync with messages so callbacks always read the latest value
  // without needing messages in their dependency arrays.
  const messagesRef = useRef<ChatMessage[]>([]);

  // Store routing callbacks in refs so submitMessage can have a stable empty
  // dep array. The SSE completion path calls these after 30-90 seconds, during
  // which React may have re-rendered many times, potentially changing the
  // identity of these functions if they weren't stabilised upstream.
  const isCompareChatActiveRef = useRef(isCompareChatActive);
  const askCompareQuestionRef  = useRef(askCompareQuestion);
  const authTokenRef           = useRef(authToken);
  const activeWorkflowRef      = useRef(activeWorkflow);

  // Keep refs in sync on every render
  isCompareChatActiveRef.current = isCompareChatActive;
  askCompareQuestionRef.current  = askCompareQuestion;
  authTokenRef.current           = authToken;
  activeWorkflowRef.current      = activeWorkflow;

  // ── Derived ───────────────────────────────────────────────────────────────
  const isLanding = messages.length === 0;

  // Keep the messages ref in sync on every render
  messagesRef.current = messages;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const selectWorkflow = useCallback((action: QuickAction) => {
    setActiveWorkflow(action);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
    setActiveWorkflow(null);
  }, []);

  const restoreMessages = useCallback((restored: ChatMessage[]) => {
    setMessages(restored);
    setIsLoading(false);
    setActiveWorkflow(null);
  }, []);

  const submitMessage = useCallback(
    async (text: string, files: UploadedFile[]) => {
      if (!text.trim() && files.length === 0) return;

      // 1. Append the user message immediately
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "user",
          content: text || "(uploaded document)",
          timestamp: new Date(),
          files: files.map((f) => ({ name: f.name, size: f.size })),
        },
      ]);
      setIsLoading(true);

      // 2. Create a streaming placeholder for the AI response
      const aiId = uid();
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true },
      ]);

      // 3. Route: compare chat agent takes priority when a session is active.
      // Read everything through refs so this callback never goes stale.
      const compareActive = isCompareChatActiveRef.current?.() ?? false;
      const askFn         = askCompareQuestionRef.current;

      console.log("[useChat/submitMessage] compareActive:", compareActive, "| askFn:", !!askFn, "| text:", !!text.trim());

      if (compareActive && askFn && text.trim()) {
        // Snapshot conversation history from the ref — always current.
        const capturedHistory = messagesRef.current
          .filter((m) => !m.isStreaming && m.content)
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
          .slice(-10);

        console.log("[useChat] Routing to compare agent — history turns:", capturedHistory.length);

        askFn(text.trim(), capturedHistory)
          .then((answer) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, content: answer, isStreaming: false } : m
              )
            );
          })
          .catch((err: any) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content: `**Unable to answer**\n\n${err?.message ?? "Please try again."}`,
                      isStreaming: false,
                    }
                  : m
              )
            );
          })
          .finally(() => {
            setIsLoading(false);
          });

        return;
      }

      // 4. Standard workflow path — read authToken and activeWorkflow through refs.
      const currentAuthToken    = authTokenRef.current;
      const currentActiveWorkflow = activeWorkflowRef.current;

      try {
        let result = "";
        if (currentActiveWorkflow && files.length > 0) {
          const f = files[0].file;
          if (currentActiveWorkflow.id === "dpa-review")
            result = await callDPAReview(currentAuthToken, f);
          else if (currentActiveWorkflow.id === "vendor-review")
            result = await callVendorReview(currentAuthToken, f);
          else if (currentActiveWorkflow.id === "ai-ethics")
            result = await callAIEthicsReview(currentAuthToken, f);
          else result = "This workflow is coming soon.";
        } else {
          result =
            "Please select a workflow from the suggestions above and upload a document to begin your analysis.";
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, content: result, isStreaming: false } : m
          )
        );
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? {
                  ...m,
                  content: `**Analysis failed**\n\n${err?.message ?? "An unexpected error occurred. Please try again."}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [] // stable — all external values accessed through refs
  );

  // ── Compare Documents integration ─────────────────────────────────────────
  // These three methods are called by RandTrustAI.tsx which delegates the
  // full SSE lifecycle to useCompare (in the compare feature).

  /**
   * Injects the user intent message for a compare operation.
   * Text is pre-formatted markdown; fileNames are shown as attachments.
   */
  const injectCompareUserMessage = useCallback(
    (text: string, fileNames: string[]) => {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "user" as const,
          content: text,
          timestamp: new Date(),
          files: fileNames.map((name) => ({ name, size: 0 })),
        },
      ]);
      setIsLoading(true);
    },
    []
  );

  /**
   * Adds an empty streaming placeholder. Returns its id so the caller can
   * update it later via updateCompareProgress / finaliseCompareMessage.
   */
  const startCompareStreaming = useCallback((): string => {
    const id = uid();
    setMessages((prev) => [
      ...prev,
      { id, role: "assistant" as const, content: "", timestamp: new Date(), isStreaming: true },
    ]);
    return id;
  }, []);

  /**
   * Updates the streaming placeholder's content to show the current stage.
   * The MessageBubble renders `content` as the cycling loading label when
   * isStreaming is true and content is non-empty.
   */
  const updateCompareProgress = useCallback((id: string, label: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: label } : m))
    );
  }, []);

  /**
   * Replaces the streaming placeholder with the final result message.
   * Attaches the structured CompareResult for interactive card rendering.
   */
  const finaliseCompareMessage = useCallback(
    (id: string, markdownContent: string, compareResult: CompareResult) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: markdownContent, isStreaming: false, compareResult }
            : m
        )
      );
      console.log("[useChat] finaliseCompareMessage — clearing isLoading");
      setIsLoading(false);
    },
    []
  );

  /**
   * Replaces the streaming placeholder with an error message.
   */
  const failCompareMessage = useCallback((id: string, errorMessage: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              content: `**Comparison failed**\n\n${errorMessage}`,
              isStreaming: false,
            }
          : m
      )
    );
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    isLanding,
    activeWorkflow,
    selectWorkflow,
    reset,
    restoreMessages,
    submitMessage,
    // Compare-specific
    injectCompareUserMessage,
    startCompareStreaming,
    updateCompareProgress,
    finaliseCompareMessage,
    failCompareMessage,
  };
}
