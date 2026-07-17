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
  /* ── Core state ─────────────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>("Full IRAC");
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

  /* ── UI state ───────────────────────────────────────────────── */
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [showSources, setShowSources] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");

  /* ── Refs ───────────────────────────────────────────────────── */
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  /* ── Close popover on outside click ────────────────────────── */
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

  /* ── Data fetching ──────────────────────────────────────────── */
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

  /* ── Textarea auto-resize ───────────────────────────────────── */
  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 180) + "px";
    }
  }, []);

  /* ── Toggle helpers ─────────────────────────────────────────── */
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

  /* ── File upload ────────────────────────────────────────────── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { status, payload } = await uploadDocument(
        authToken,
        file,
        activeFolderForUpload || undefined
      );
      if (status === 202 && payload.job_id) {
        setStepperPhase("extracting");
        setStepperMessage(`Processing ${file.name}…`);
        const es = createJobSSE(authToken);
        es.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (
            data.event === "job_update" &&
            data.job.id === payload.job_id
          ) {
            if (data.job.status === "completed") {
              es.close();
              loadKnowledgeBase();
              setStepperPhase("completed");
              setStepperMessage(`${file.name} indexed.`);
            } else if (data.job.status === "failed") {
              es.close();
              setStepperPhase("idle");
              alert("Indexing failed: " + data.job.error);
            }
          }
        };
      } else {
        loadKnowledgeBase();
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    }
  };

  /* ── Web URL ────────────────────────────────────────────────── */
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

  /* ── Query dispatch ─────────────────────────────────────────── */
  const handleQueryDispatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isStreaming) return;

    const query = searchQuery.trim();
    setSubmittedQuery(query);
    setIsStreaming(true);
    setStreamedResult("");
    setMatchedSources([]);
    setLawyerProgress("Preparing request…");
    setLawyerError("");
    setStepperPhase("division");
    setHasResult(false);
    setOpenPopover(null);

    try {
      const { status, data } = await askLawyer(
        authToken,
        query,
        selectedJurisdictions,
        selectedFormat,
        folders
      );
      if (status === 202 && data.job_id) {
        setLawyerProgress("Analyzing…");
        const es = createJobSSE(authToken);
        es.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (
            payload.event === "job_update" &&
            payload.job.id === data.job_id
          ) {
            const job = payload.job;
            if (job.message) {
              setLawyerProgress(job.message);
              setStepperMessage(job.message);
            }
            if (job.status === "completed") {
              setStreamedResult(job.result.text || job.result || "");
              if (Array.isArray(job.result.sources) && job.result.sources.length > 0) {
                setMatchedSources(job.result.sources);
              }
              setStepperPhase("completed");
              setLawyerProgress("");
              setIsStreaming(false);
              setHasResult(true);
              es.close();
            } else if (job.status === "failed") {
              es.close();
              setLawyerError(job.error || "Advisory failed.");
              setIsStreaming(false);
            }
          }
        };
        es.onerror = () => {
          es.close();
          setLawyerError("Connection interrupted. Please retry.");
          setIsStreaming(false);
        };
      }
    } catch (err: any) {
      setStepperPhase("idle");
      setLawyerError(err.message || "Unexpected error.");
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
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

  const togglePopover = (p: PopoverType) =>
    setOpenPopover((prev) => (prev === p ? null : p));

  /* ── Derived ────────────────────────────────────────────────── */
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
    matchedSources,
    isStreaming,
    activeCitationModal, setActiveCitationModal,
    lawyerProgress,
    lawyerError, setLawyerError,
    isCopied,
    openPopover,
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
    /* derived */
    selectedKBCount,
    selectedFolderCount,
  };
}
