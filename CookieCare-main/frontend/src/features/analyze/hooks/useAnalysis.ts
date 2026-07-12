import { useState } from "react";
import { apiUrl } from "../../../config";
import { CustomFolder, SavedDraft, Message, DocumentMode, AnswerStyle } from "../types";

export function useAnalysis(authToken: string) {
  const [viewMode, setViewMode] = useState<"form" | "report">("form");
  const [activeReportDocName, setActiveReportDocName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [reportClauses, setReportClauses] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [showCopyToast, setShowCopyToast] = useState(false);

  const handleStartAnalysis = async (
    folders: CustomFolder[],
    savedDrafts: SavedDraft[],
    customPromptText: string,
    documentMode: DocumentMode,
    answerStyle: AnswerStyle
  ) => {
    const activeSelectedFolders = folders.filter((f) => f.selected || f.files.some((fi) => fi.selected));
    const activeSelectedDrafts = savedDrafts.filter((d) => d.selected);

    if (activeSelectedFolders.length === 0 && activeSelectedDrafts.length === 0) {
      alert("Please select at least one document folder or saved draft to analyze.");
      return;
    }

    const firstSelected =
      activeSelectedFolders.length > 0
        ? activeSelectedFolders[0].name
        : activeSelectedDrafts[0].title;
    setActiveReportDocName(firstSelected);
    setIsAnalyzing(true);
    setAnalysisProgress("Preparing analysis request...");
    setAnalysisError("");

    let waitingForJob = false;
    try {
      setAnalysisProgress("Sending request to AI...");
      const response = await fetch(apiUrl("/api/analyze/interact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          folderIds: activeSelectedFolders.map((f) => f.id),
          draftIds: activeSelectedDrafts.map((d) => d.id),
          prompt: customPromptText,
          documentMode,
          answerStyle,
          history: [],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      if (response.status === 202 && data.job_id) {
        waitingForJob = true;
        setAnalysisProgress("Uploading documents to AI engine...");
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            if (payload.job.message) setAnalysisProgress(payload.job.message);
            if (payload.job.status === "completed") {
              const result =
                typeof payload.job.result === "string"
                  ? { analysis: payload.job.result, clauses: [] }
                  : payload.job.result;
              setChatMessages([
                {
                  sender: "gemini",
                  text:
                    result.analysis ||
                    `### Executive Legal Assessment for ${firstSelected}\n\nAnalysis complete.`,
                },
              ]);
              if (result.clauses) setReportClauses(result.clauses);
              setViewMode("report");
              setIsAnalyzing(false);
              setAnalysisProgress("");
              eventSource.close();
            } else if (payload.job.status === "failed") {
              eventSource.close();
              setAnalysisError(payload.job.error || "Analysis failed. Please try again.");
              setIsAnalyzing(false);
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setAnalysisError("Connection to AI engine was interrupted. Please retry.");
          setIsAnalyzing(false);
        };
      }
    } catch (err: any) {
      console.error("Analysis failed", err);
      setAnalysisError(err.message || "Failed to perform analysis. Please check your connection.");
      setIsAnalyzing(false);
    } finally {
      if (!waitingForJob) setIsAnalyzing(false);
    }
  };

  const handleSendChatMessage = async (
    userText: string,
    folders: CustomFolder[],
    savedDrafts: SavedDraft[],
    documentMode: DocumentMode,
    answerStyle: AnswerStyle
  ) => {
    const newMessages: Message[] = [...chatMessages, { sender: "user", text: userText }];
    setChatMessages(newMessages);

    const loadingIdx = newMessages.length;
    setChatMessages((prev) => [
      ...prev,
      { sender: "gemini", text: "Analyzing your query in context of the legal framework...", loading: true },
    ]);

    try {
      const activeSelectedFolders = folders.filter((f) => f.selected);
      const activeSelectedDrafts = savedDrafts.filter((d) => d.selected);
      const response = await fetch(apiUrl("/api/analyze/interact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          folderIds: activeSelectedFolders.map((f) => f.id),
          draftIds: activeSelectedDrafts.map((d) => d.id),
          prompt: userText,
          documentMode,
          answerStyle,
          history: chatMessages.map((m) => ({
            role: m.sender === "gemini" ? "assistant" : "user",
            content: m.text,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (response.status === 202 && data.job_id) {
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            if (payload.job.status === "completed") {
              const result =
                typeof payload.job.result === "string"
                  ? { analysis: payload.job.result }
                  : payload.job.result;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[loadingIdx] = { sender: "gemini", text: result.analysis || "Analysis complete.", loading: false };
                return updated;
              });
              eventSource.close();
            } else if (payload.job.status === "failed") {
              eventSource.close();
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[loadingIdx] = { sender: "gemini", text: payload.job.error || "Analysis failed.", loading: false };
                return updated;
              });
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[loadingIdx] = { sender: "gemini", text: "Analysis connection interrupted. Please try again.", loading: false };
            return updated;
          });
        };
      }
    } catch (err) {
      console.error("Chat failed", err);
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[loadingIdx] = {
          sender: "gemini",
          text: "I encountered an error while processing your request. Please try again.",
          loading: false,
        };
        return updated;
      });
    }
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
    reportClauses,
    chatMessages,
    showCopyToast,
    handleStartAnalysis,
    handleSendChatMessage,
    handleCopyReport,
    handleDownloadReport,
    handlePrintReport,
  };
}
