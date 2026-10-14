import { useState, useRef, useEffect, useCallback } from "react";
import {
  fetchSettings,
  fetchKnowledgeBase,
  uploadDocument,
  askLawyer,
  createJobSSE,
} from "../api/askAILawyerApi";
import {
  KBFolder,
  OutputFormat,
  PopoverType,
  Source,
  StepperPhase,
} from "../types";

export function useAskAILawyer(authToken: string) {
  /* ·· Core state ··············································· */
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>("Brief Summary");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>([]);
  const [webDiscoveryUrlInput, setWebDiscoveryUrlInput] = useState("");
  const [webDiscoveryUrls, setWebDiscoveryUrls] = useState<string[]>([]);
  const [availableJurisdictions, setAvailableJurisdictions] = useState<any[]>([]);
  const [folders, setFolders] = useState<KBFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolderForUpload, setActiveFolderForUpload] = useState<string>("");

  const [stepperPhase, setStepperPhase] = useState<StepperPhase>("idle");
  const [stepperMessage, setStepperMessage] = useState("");
  const [streamedResult, setStreamedResult] = useState("");
  const [matchedSources, setMatchedSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCitationModal, setActiveCitationModal] = useState<Source | null>(null);
  const [lawyerProgress, setLawyerProgress] = useState("");
  const [lawyerError, setLawyerError] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  // Chat history — each turn is { role, text }
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);

  // Uploaded files — { id, name } — added only after indexing completes
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: string; name: string }>>([]);
  const uploadedFileIds = uploadedFiles.map((f) => f.id);
  /* ·· UI state ················································· */
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [showSources, setShowSources] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");

  /* ·· Refs ····················································· */
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const closeSse = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
  }, []);

  /* ·· Close popover on outside click ·························· */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!openPopover) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (composerRef.current?.contains(e.target as Node)) return;
      setOpenPopover(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [openPopover]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedResult, isStreaming]);

  /* ·· Data fetching ············································ */
  const loadSettings = async () => {
    try {
      const { jurisdictions, webSources } = await fetchSettings(authToken);
      setAvailableJurisdictions(jurisdictions);
      setWebDiscoveryUrls(webSources);
      if (jurisdictions.length >= 2) {
        setSelectedJurisdictions(
          [jurisdictions[0].label, jurisdictions[4]?.label].filter(Boolean)
        );
      }
    } catch {}
  };

  const loadKnowledgeBase = async () => {
    try {
      const kb = await fetchKnowledgeBase(authToken);
      setFolders(kb);
    } catch {}
  };

  useEffect(() => {
    loadKnowledgeBase();
    loadSettings();
  }, [authToken]);

  /* ·· Textarea auto-resize ····································· */
  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, []);

  /* ·· Toggle helpers ··········································· */
  const toggleJurisdiction = (label: string) =>
    setSelectedJurisdictions((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFolders((prev) => [
      ...prev,
      {
        id: "folder_" + Date.now(),
        name: newFolderName.trim(),
        isSelected: true,
        files: [],
      },
    ]);
    setNewFolderName("");
  };

  const toggleFolderSelection = (id: string) =>
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isSelected: !f.isSelected } : f))
    );

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders((prev) => prev.filter((f) => f.id !== id));
  };

  /* ·· File upload ·············································· */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = "";
    try {
      const { status, payload } = await uploadDocument(
        authToken,
        file,
        activeFolderForUpload || undefined
      );
      if (status === 202 && payload.file_id) {
        setStepperPhase("extracting");
        setStepperMessage(`Indexing ${file.name}…`);

        if (payload.job_id) {
          // Wait for the file_processing job to complete before making the
          // file_id available for RAG — chunks aren't indexed until then.
          const es = createJobSSE(authToken);
          sseRef.current = es;
          es.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.event === "job_update" && data.job.id === payload.job_id) {
              if (data.job.status === "completed") {
                es.close();
                loadKnowledgeBase();
                setStepperPhase("completed");
                setStepperMessage(`${file.name} ready.`);
                // Only add the file once indexing is confirmed complete
                setUploadedFiles((prev) =>
                  prev.some((f) => f.id === payload.file_id)
                    ? prev
                    : [...prev, { id: payload.file_id, name: file.name }]
                );
              } else if (data.job.status === "failed") {
                es.close();
                setStepperPhase("idle");
                setStepperMessage("");
                alert("File indexing failed: " + (data.job.error || "Unknown error"));
              }
            }
          };
          es.onerror = () => {
            es.close();
            // On SSE error, still add the file optimistically
            setUploadedFiles((prev) =>
              prev.some((f) => f.id === payload.file_id)
                ? prev
                : [...prev, { id: payload.file_id, name: file.name }]
            );
            setStepperPhase("idle");
          };
        } else {
          // No job_id — add immediately
          setUploadedFiles((prev) =>
            prev.some((f) => f.id === payload.file_id)
              ? prev
              : [...prev, { id: payload.file_id, name: file.name }]
          );
          setStepperPhase("completed");
          setStepperMessage(`${file.name} ready.`);
        }
      } else {
        loadKnowledgeBase();
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    }
  };

  /* ·· Web URL ·················································· */
  const handleAddWebUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webDiscoveryUrlInput.trim()) return;
    if (!webDiscoveryUrls.includes(webDiscoveryUrlInput.trim())) {
      setWebDiscoveryUrls((prev) => [...prev, webDiscoveryUrlInput.trim()]);
    }
    setWebDiscoveryUrlInput("");
  };

  const removeWebUrl = (url: string) =>
    setWebDiscoveryUrls((prev) => prev.filter((u) => u !== url));

  /* ·· Query dispatch ··········································· */
  const handleQueryDispatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isStreaming) return;

    const query = searchQuery.trim();
    setSubmittedQuery(query);
    setSearchQuery("");
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsStreaming(true);
    setStreamedResult("");
    setMatchedSources([]);
    setLawyerProgress("Thinking…");
    setLawyerError("");
    setStepperPhase("division");
    setHasResult(false);
    setOpenPopover(null);
    closeSse();

    // Append user message to history immediately
    setMessages((prev) => [...prev, { role: "user", text: query }]);

    try {
      const { data } = await askLawyer(authToken, query, uploadedFileIds, messages);
      const replyText = data.text || "";
      setStreamedResult(replyText);
      // Append assistant reply to history
      setMessages((prev) => [...prev, { role: "assistant", text: replyText }]);
      if (Array.isArray(data.sources) && data.sources.length > 0) {
        setMatchedSources(data.sources);
      }
      setStepperPhase("completed");
      setLawyerProgress("");
      setIsStreaming(false);
      setHasResult(true);
    } catch (err: any) {
      setStepperPhase("idle");
      setLawyerError(err.message || "Unexpected error.");
      setIsStreaming(false);
      // Remove the user message from history if the call failed
      setMessages((prev) => prev.slice(0, -1));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQueryDispatch();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      handleQueryDispatch();
    }
  };

  const handleCopyMarkdown = () => {
    if (!streamedResult) return;
    navigator.clipboard.writeText(streamedResult);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const applyQuickPrompt = (prompt: string) => {
    setSearchQuery(prompt);
    setTimeout(() => {
      autoResizeTextarea();
      textareaRef.current?.focus();
    }, 0);
  };

  const resetConversation = useCallback(() => {
    closeSse();
    setSearchQuery("");
    setStreamedResult("");
    setMatchedSources([]);
    setMessages([]);
    setUploadedFiles([]);
    setIsStreaming(false);
    setHasResult(false);
    setSubmittedQuery("");
    setLawyerProgress("");
    setLawyerError("");
    setIsCopied(false);
    setShowSources(false);
    setActiveCitationModal(null);
    setOpenPopover(null);
    setStepperPhase("idle");
    setStepperMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [closeSse]);

  const removeUploadedFile = (id: string) =>
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));

  const togglePopover = (p: PopoverType) =>
    setOpenPopover((prev) => (prev === p ? null : p));

  /* ·· Derived ·················································· */
  const selectedKBCount = folders
    .filter((f) => f.isSelected)
    .reduce((acc, f) => acc + f.files.length, 0);
  const selectedFolderCount = folders.filter((f) => f.isSelected).length;

  return {
    /* state */
    searchQuery, setSearchQuery,
    selectedFormat, setSelectedFormat,
    selectedJurisdictions, setSelectedJurisdictions,
    webDiscoveryUrlInput, setWebDiscoveryUrlInput,
    webDiscoveryUrls,
    availableJurisdictions,
    folders, setFolders,
    newFolderName, setNewFolderName,
    activeFolderForUpload, setActiveFolderForUpload,
    stepperPhase,
    stepperMessage,
    streamedResult,
    messages,
    matchedSources,
    isStreaming,
    activeCitationModal, setActiveCitationModal,
    lawyerProgress,
    lawyerError, setLawyerError,
    isCopied,
    openPopover, setOpenPopover,
    showSources, setShowSources,
    hasResult,
    submittedQuery,
    /* refs */
    chatBottomRef, textareaRef, composerRef, popoverRef, fileUploadRef,
    /* handlers */
    autoResizeTextarea,
    toggleJurisdiction,
    handleAddFolder,
    toggleFolderSelection,
    handleDeleteFolder,
    handleFileUpload,
    handleAddWebUrl,
    removeWebUrl,
    handleQueryDispatch,
    handleKeyDown,
    handleCopyMarkdown,
    applyQuickPrompt,
    togglePopover,
    resetConversation,
    removeUploadedFile,
    /* derived */
    selectedKBCount,
    selectedFolderCount,
    uploadedFiles,
  };
}
