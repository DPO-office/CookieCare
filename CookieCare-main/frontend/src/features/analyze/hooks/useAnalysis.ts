import { useRef, useState } from "react";
import { CustomFolder, SavedDraft, Message, DocumentMode, AnswerStyle, AnalysisDepth } from "../types";
import { collectAnalysisDocumentIds } from "../documentSelection";
import type { EphemeralFile } from "./useAnalyzeData";
import {
  ANALYSIS_MAX_DOCS,
  enqueueAnalysisJob,
  waitForAnalysisJob,
  type AnalysisJobOutcome,
  type AnalysisOpenQuestion,
} from "../api/analysisJobs";

type RunContext = {
  documentIds: string[];
  instruction: string;
  promptLibraryId?: string;
  firstDocName: string;
  documentRoles?: Record<string, "target" | "reference">;
};

function buildInstruction(
  prompt: string,
  documentMode: DocumentMode,
  answerStyle: AnswerStyle,
  analysisDepth: AnalysisDepth = "deep"
): string {
  const extras: string[] = [];
  if (documentMode === "individual") {
    extras.push(
      "Analyze each attached document individually rather than as a single combined review."
    );
  }
  if (answerStyle === "tabular") {
    extras.push("Present findings as a table.");
  }
  if (analysisDepth === "lite") {
    extras.push(
      "Provide a concise, high-level summary. Focus on the most critical points only — keep the response brief."
    );
  } else {
    extras.push(
      "Provide a thorough, in-depth analysis. Cover all relevant clauses, risks, and implications in detail."
    );
  }
  return [prompt.trim(), ...extras].join("\n\n");
}

export function useAnalysis(authToken: string) {
  const [viewMode, setViewMode] = useState<"form" | "report">("form");
  const [activeReportDocName, setActiveReportDocName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [openQuestions, setOpenQuestions] = useState<AnalysisOpenQuestion[]>([]);
  const [askResolved, setAskResolved] = useState(false);

  const runContextRef = useRef<RunContext | null>(null);
  const streamBufferRef = useRef("");
  const streamRafRef = useRef<number | null>(null);

  const flushStreamToUi = () => {
    streamRafRef.current = null;
    const text = streamBufferRef.current;
    setChatMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, text } : m))
    );
  };

  const cancelStreamFlush = () => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  };

  const appendStreamToken = (delta: string) => {
    if (!delta) return;
    streamBufferRef.current += delta;
    if (streamRafRef.current == null) {
      streamRafRef.current = requestAnimationFrame(flushStreamToUi);
    }
  };

  const resetLiveStream = () => {
    streamBufferRef.current = "";
    cancelStreamFlush();
    setChatMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, text: "" } : m))
    );
  };

  const handleProgress = (message: string) => {
    if (
      message === "Writing the report…" ||
      message === "Checking the analysis…" ||
      message === "Verifying key findings…"
    ) {
      resetLiveStream();
    }
    setAnalysisProgress(message);
  };

  const beginStreamingReply = (userText: string, replaceThread: boolean) => {
    streamBufferRef.current = "";
    cancelStreamFlush();
    setViewMode("report");
    setChatMessages((prev) => {
      const base = replaceThread ? [] : prev.filter((m) => !m.loading && !m.streaming);
      const hasUser = Boolean(userText) && base.some((m) => m.sender === "user" && m.text === userText);
      return [
        ...base,
        ...(hasUser || !userText ? [] : [{ sender: "user" as const, text: userText }]),
        { sender: "gemini" as const, text: "", streaming: true },
      ];
    });
  };

  const applyOutcome = (outcome: AnalysisJobOutcome, userText: string): boolean => {
    if (outcome.kind === "failed") {
      setAnalysisError(outcome.error);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.streaming
            ? {
                ...m,
                streaming: false,
                text: m.text || "Analysis failed. Please try again.",
              }
            : m
        )
      );
      return false;
    }

    if (outcome.kind === "needs_input") {
      setSessionId(outcome.sessionId || null);
      setOpenQuestions(outcome.openQuestions);
      setAskResolved(false);
      setChatMessages((prev) => {
        const withoutStream = prev.filter((m) => !m.streaming || m.text.trim());
        const cleaned = withoutStream.map((m) => ({ ...m, streaming: false }));
        const hasUser = cleaned.some((m) => m.sender === "user" && m.text === userText);
        return hasUser ? cleaned : [...cleaned, { sender: "user", text: userText }];
      });
      setViewMode("report");
      return true;
    }

    // Prefer the released report only. ACT/critique drafts are held server-side
    // until persist, so this should not swap a visible memo.
    const finalText =
      outcome.kind === "out_of_scope"
        ? outcome.declineMessage
        : outcome.kind === "success" && outcome.report.trim()
          ? outcome.report
          : streamBufferRef.current || "Analysis complete.";
    streamBufferRef.current = "";
    cancelStreamFlush();

    setSessionId(
      outcome.kind === "out_of_scope" || outcome.kind === "success"
        ? outcome.sessionId || null
        : null
    );
    setOpenQuestions([]);
    setAskResolved(false);
    setChatMessages((prev) => {
      const withoutLoading = prev.filter((m) => !m.loading);
      const next = withoutLoading.some((m) => m.sender === "user" && m.text === userText)
        ? withoutLoading
        : [...withoutLoading, { sender: "user", text: userText }];
      const streamIdx = [...next].reverse().findIndex((m) => m.sender === "gemini" && m.streaming);
      const realIdx = streamIdx === -1 ? -1 : next.length - 1 - streamIdx;
      if (realIdx >= 0) {
        const updated = [...next];
        updated[realIdx] = { sender: "gemini", text: finalText, streaming: false };
        return updated;
      }
      return [...next, { sender: "gemini", text: finalText }];
    });
    setViewMode("report");
    return true;
  };

  const handleStartAnalysis = async (
    folders: CustomFolder[],
    savedDrafts: SavedDraft[],
    ephemeralFiles: EphemeralFile[],
    customPromptText: string,
    documentMode: DocumentMode,
    answerStyle: AnswerStyle,
    analysisDepth: AnalysisDepth,
    promptLibraryId?: string,
    playbookDocId?: string | null
  ) => {
    const { documentIds, firstTitle } = collectAnalysisDocumentIds(folders, savedDrafts, ephemeralFiles);

    if (documentIds.length === 0) {
      alert("Please select at least one document folder, file, or saved draft to analyze.");
      return;
    }
    if (documentIds.length > ANALYSIS_MAX_DOCS) {
      alert(
        `Please select at most ${ANALYSIS_MAX_DOCS} documents. The analysis engine cannot process more than that in one run.`
      );
      return;
    }

    const documentRoles: Record<string, "target" | "reference"> | undefined =
      playbookDocId && documentIds.includes(playbookDocId)
        ? Object.fromEntries(
            documentIds.map((id) => [
              id,
              id === playbookDocId ? ("reference" as const) : ("target" as const),
            ])
          )
        : undefined;

    const instruction = buildInstruction(customPromptText, documentMode, answerStyle, analysisDepth);
    runContextRef.current = {
      documentIds,
      instruction,
      promptLibraryId,
      firstDocName: firstTitle,
      documentRoles,
    };

    setActiveReportDocName(firstTitle);
    setOpenQuestions([]);
    setAskResolved(false);
    setSessionId(null);
    streamBufferRef.current = "";
    cancelStreamFlush();
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisProgress("Thinking…");
    beginStreamingReply(customPromptText.trim(), true);

    try {
      const jobId = await enqueueAnalysisJob(authToken, "/api/analysis/run", {
        instruction,
        documentIds,
        documentRoles,
        promptLibraryId: promptLibraryId || undefined,
        documentMode,
        answerStyle,
      });

      const outcome = await waitForAnalysisJob({
        authToken,
        jobId,
        onProgress: handleProgress,
        onToken: appendStreamToken,
      });
      applyOutcome(outcome, customPromptText.trim());
    } catch (err: any) {
      console.error("Analysis failed", err);
      setAnalysisError(err.message || "Failed to perform analysis. Please check your connection.");
      setChatMessages((prev) =>
        prev.map((m) =>
          m.streaming
            ? { ...m, streaming: false, text: m.text || err.message || "Analysis failed." }
            : m
        )
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress("");
    }
  };

  const handleResumeAsk = async (answers: Record<string, string>) => {
    if (!sessionId) {
      setAnalysisError("Cannot resume: missing analysis session.");
      return;
    }

    const userSummary = Object.values(answers)
      .map((v) => v.trim())
      .filter(Boolean)
      .join("; ");

    setAskResolved(true);
    setIsAnalyzing(true);
    setAnalysisProgress("Continuing…");
    setAnalysisError("");
    beginStreamingReply(userSummary || "Answers submitted", false);

    try {
      const jobId = await enqueueAnalysisJob(authToken, "/api/analysis/resume-ask", {
        sessionId,
        answers,
      });

      const outcome = await waitForAnalysisJob({
        authToken,
        jobId,
        onProgress: handleProgress,
        onToken: appendStreamToken,
      });
      applyOutcome(outcome, userSummary || "Answers submitted");
    } catch (err: any) {
      console.error("Resume analysis failed", err);
      setAskResolved(false);
      setAnalysisError(err.message || "Failed to resume analysis.");
      setChatMessages((prev) =>
        prev.map((m) =>
          m.streaming ? { ...m, streaming: false, text: m.text || err.message } : m
        )
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress("");
    }
  };

  const handleSendChatMessage = async (
    userText: string,
    folders: CustomFolder[],
    savedDrafts: SavedDraft[],
    documentMode: DocumentMode,
    answerStyle: AnswerStyle,
    analysisDepth: AnalysisDepth = "deep",
    ephemeralFiles: EphemeralFile[] = []
  ) => {
    const trimmed = userText.trim();
    if (!trimmed) return;

    const ctx = runContextRef.current;
    const { documentIds } =
      ctx?.documentIds.length
        ? { documentIds: ctx.documentIds }
        : collectAnalysisDocumentIds(folders, savedDrafts, ephemeralFiles);

    if (documentIds.length === 0) {
      setChatMessages((prev) => [
        ...prev,
        { sender: "user", text: trimmed },
        {
          sender: "gemini",
          text: "Add at least one document before asking a follow-up.",
        },
      ]);
      return;
    }

    const followUpInstruction = buildInstruction(trimmed, documentMode, answerStyle, analysisDepth);

    setIsAnalyzing(true);
    setAnalysisError("");
    beginStreamingReply(trimmed, false);

    try {
      const jobId = await enqueueAnalysisJob(authToken, "/api/analysis/run", {
        instruction: followUpInstruction,
        documentIds,
        documentRoles: ctx?.documentRoles,
        promptLibraryId: ctx?.promptLibraryId,
        sessionId: sessionId || undefined,
        documentMode,
        answerStyle,
      });

      const outcome = await waitForAnalysisJob({
        authToken,
        jobId,
        onProgress: handleProgress,
        onToken: appendStreamToken,
      });
      applyOutcome(outcome, trimmed);
    } catch (err: any) {
      console.error("Chat failed", err);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.streaming
            ? {
                ...m,
                streaming: false,
                text: m.text || "I encountered an error while processing your request. Please try again.",
              }
            : m
        )
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress("");
    }
  };

  /** Restore a past session directly into report view — no analysis is triggered. */
  const restoreSession = (messages: Message[], docName: string) => {
    // Guard: never enter report view with no content — it would show "Thinking…"
    if (messages.length === 0) return;

    cancelStreamFlush();
    streamBufferRef.current = "";
    setIsAnalyzing(false);
    setAnalysisProgress("");
    setAnalysisError("");
    setOpenQuestions([]);
    setAskResolved(false);
    setSessionId(null);
    setActiveReportDocName(docName);
    // Set messages first, then flip view mode so ReportView never sees empty state
    setChatMessages(messages);
    setViewMode("report");
  };

  const handleCopyReport = () => {
    const latest = chatMessages.filter((m) => m.sender === "gemini").slice(-1)[0];
    navigator.clipboard.writeText(latest?.text || "");
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 2000);
  };

  const handleDownloadReport = () => {
    const reportText = chatMessages.map((m) => `[${m.sender.toUpperCase()}]\n${m.text}`).join("\n\n");
    const blob = new Blob([reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Legal_Assessment_Memorandum.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => window.print();

  return {
    viewMode,
    setViewMode,
    activeReportDocName,
    isAnalyzing,
    analysisProgress,
    analysisError,
    setAnalysisError,
    chatMessages,
    showCopyToast,
    openQuestions,
    askResolved,
    sessionId,
    handleStartAnalysis,
    handleResumeAsk,
    handleSendChatMessage,
    handleCopyReport,
    handleDownloadReport,
    handlePrintReport,
    restoreSession,
  };
}
