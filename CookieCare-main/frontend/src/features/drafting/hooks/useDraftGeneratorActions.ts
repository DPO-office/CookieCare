import { apiUrl } from "../../../config";
import { LegalDocument } from "../../../shared/types";
import { markdownToHtml } from "../../../shared/utils/markdownToHtml";
import {
  enqueueDraftingJob,
  waitForDraftJob,
  type DraftOpenQuestion,
} from "../api/draftingJobs";

// --- Backend-aligned payload types (mirror the unified DraftRequestSchema) ---

type DraftRequestPayload = {
  draftInput: string;
  draftInstructions: string;
  uploadedDocument?: string | null;
  documentId?: string | null;
};

type RefineRequestPayload = {
  documentId: string;
  instructions: string;
  highlightedText?: string;
};

type DraftUiState = {
  mode: string;
  instructions: string;
  playbookGuidelines: string;
  advancedStep: string;
  referenceInstructions: string;
  aiRulebookPrompt: string;
  sourceDocumentId: string;
  documentId?: string | null;
};

/** Unified PAC CREATE payload — optional upload / vault / prompt-only. No modes. */
function buildGenerateStreamPayload(uiState: DraftUiState): DraftRequestPayload {
  const hasUpload = Boolean(uiState.sourceDocumentId?.trim());
  const hasVault = Boolean(uiState.documentId);
  const isProactiveUi =
    uiState.mode === "Advanced" && uiState.advancedStep === "proactive";

  if (hasUpload) {
    return {
      draftInput: uiState.instructions || "",
      draftInstructions:
        uiState.instructions || uiState.playbookGuidelines || "",
      uploadedDocument: uiState.sourceDocumentId,
      documentId: hasVault ? uiState.documentId : null,
    };
  }

  if (isProactiveUi || hasVault) {
    const draftInput = uiState.referenceInstructions || uiState.instructions;
    if (!draftInput || !draftInput.trim()) {
      throw new Error("Please describe what you want to draft in the first field.");
    }
    return {
      draftInput,
      draftInstructions: uiState.aiRulebookPrompt || uiState.playbookGuidelines || "",
      documentId: uiState.documentId ?? null,
    };
  }

  return {
    draftInput: uiState.instructions,
    draftInstructions: uiState.playbookGuidelines || "",
  };
}

function buildRefinementInstructions(type: string, param: string): string {
  switch (type) {
    case "tone":
      return `Rewrite the following legal text in a ${param} tone.`;
    case "grammar":
      return "Fix the spelling and grammar in the following legal text while preserving legal meaning.";
    case "extend":
      return "Expand the following legal clause with more comprehensive protections.";
    case "reduce":
      return "Shorten the following legal clause to its core obligation.";
    case "simplify":
      return "Rewrite the following legal text in plain English for a non-lawyer.";
    case "complete":
      return "Complete the following sentence or clause in a professional legal manner.";
    case "ask":
      return param;
    default:
      return param || `Apply the following refinement: ${type}`;
  }
}

function buildRefinePayload(
  documentId: string,
  type: string,
  param: string,
  highlightedText: string
): RefineRequestPayload {
  const instructions = buildRefinementInstructions(type, param);

  return {
    documentId,
    instructions,
    highlightedText: highlightedText || undefined,
  };
}

function normalizeDraftMarkdownInput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface UseDraftGeneratorActionsParams {
  authToken: string;
  onRefresh: () => void;
  editorContent: string;
  currentDocumentId: string | null;
  pushUndoSnapshot: (snapshot: string) => void;
  setEditorContent: (content: string) => void;
  setSelectedDoc: (doc: LegalDocument | null) => void;
  setIsGeneratorActive: (active: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamingProgress: (progress: string) => void;
  setDraftError: (error: string) => void;
  setUploadText: (text: string) => void;
  setUploadFileName: (name: string) => void;
  setSourceDocumentId: (id: string) => void;
  setIsParsingTemplate: (parsing: boolean) => void;
  selectedTextRange: { start: number; end: number } | null;
  setSelectedTextRange: (range: { start: number; end: number } | null) => void;
  setShowFloatingMenu: (show: boolean) => void;
  setActiveDropdown: (dropdown: string | null) => void;
  setAskAiQuery: (query: string) => void;
  refinementProgress: string;
  setRefinementProgress: (message: string) => void;
  refinementError: string;
  setRefinementError: (error: string) => void;
  tiptapEditorRef: React.MutableRefObject<import("@tiptap/react").Editor | null>;
  /** Chat progress line during generate / resume / workspace refine. */
  onProgress?: (message: string) => void;
  /** PAC paused in ASK — show questions in chat. */
  onNeedsInput?: (questions: DraftOpenQuestion[], documentId: string) => void;
  /** Draft finished successfully. */
  onDraftComplete?: (documentId?: string) => void;
  /** Workspace / selection refine finished. */
  onRefineComplete?: () => void;
}

export function useDraftGeneratorActions({
  authToken,
  onRefresh,
  editorContent,
  currentDocumentId,
  pushUndoSnapshot,
  setEditorContent,
  setSelectedDoc,
  setIsGeneratorActive,
  setIsStreaming,
  setStreamingProgress,
  setDraftError,
  setUploadText,
  setUploadFileName,
  setSourceDocumentId,
  setIsParsingTemplate,
  selectedTextRange,
  setSelectedTextRange,
  setShowFloatingMenu,
  setActiveDropdown,
  setAskAiQuery,
  setRefinementProgress,
  setRefinementError,
  tiptapEditorRef,
  onProgress,
  onNeedsInput,
  onDraftComplete,
  onRefineComplete,
}: UseDraftGeneratorActionsParams) {
  const reportProgress = (message: string) => {
    setStreamingProgress(message);
    onProgress?.(message);
  };

  const bindDocumentShell = (documentId: string, title: string, content = "") => {
    setSelectedDoc({
      versions: [],
      signatures: [],
      sharedWith: [],
      redlines: [],
      auditLogs: [],
      id: documentId,
      title,
      type: "Custom",
      creatorId: "",
      creatorEmail: "",
      isEncrypted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content,
    });
  };

  const handleCreateAndSaveGeneratedDoc = async (
    title: string,
    content: string,
    existingDocId?: string
  ) => {
    if (existingDocId) {
      bindDocumentShell(existingDocId, title, content);
      onRefresh();
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/documents"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ title, type: "Custom", content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDoc({
        versions: [],
        signatures: [],
        sharedWith: [],
        redlines: [],
        auditLogs: [],
        ...data,
        content,
      });
      onRefresh();
    } catch (err: any) {
      console.error("Storing generated draft failed, using fallback client storage", err);
    }
  };

  const applyDocumentToEditor = (markdownOrHtml: string) => {
    const normalized = normalizeDraftMarkdownInput(markdownOrHtml);
    const htmlContent = markdownToHtml(normalized);
    const ed = tiptapEditorRef.current;
    if (ed) {
      ed.chain().focus().setContent(htmlContent).run();
      setEditorContent(ed.getHTML());
    } else {
      setEditorContent(htmlContent);
    }
    return normalized;
  };

  const settleJobOutcome = async (
    outcome: Awaited<ReturnType<typeof waitForDraftJob>>,
    documentTitle: string
  ): Promise<"needs_input" | "success" | "failed"> => {
    if (outcome.kind === "failed") {
      setDraftError(outcome.error);
      return "failed";
    }

    if (outcome.kind === "needs_input") {
      if (outcome.documentId) {
        bindDocumentShell(outcome.documentId, "Draft in progress...");
      }
      onNeedsInput?.(outcome.openQuestions, outcome.documentId);
      return "needs_input";
    }

    if (!outcome.content) {
      setDraftError("Draft completed without returning document text.");
      return "failed";
    }

    const normalized = applyDocumentToEditor(outcome.content);
    await handleCreateAndSaveGeneratedDoc(
      documentTitle,
      normalized,
      outcome.documentId
    );
    onDraftComplete?.(outcome.documentId);
    return "success";
  };

  const uploadReactiveSourceTemplate = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(apiUrl("/api/drafting/process-uploaded-template"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
    });

    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Template upload failed");

    const docId = payload.sourceDocumentId;
    if (!docId) throw new Error("Server did not return a sourceDocumentId.");

    setSourceDocumentId(docId);
    return docId;
  };

  const handleExecuteDraftStream = async (params: {
    mode: string;
    depth: string;
    instructions: string;
    playbookGuidelines: string;
    advancedStep: string;
    selectedTemplateName: string | null;
    aiRulebookPrompt: string;
    referenceInstructions: string;
    uploadFileName: string;
    uploadText: string;
    sourceDocumentId: string;
    documentId?: string | null;
  }) => {
    setIsStreaming(true);
    reportProgress("Initiating drafting pipeline...");
    setDraftError("");
    pushUndoSnapshot(editorContent);
    setEditorContent("");

<<<<<<< HEAD
    let documentTitle = "Draft Agreement";
    if (params.sourceDocumentId) {
      documentTitle = `Draft from: ${params.uploadFileName || "uploaded document"}`;
    } else if (params.selectedTemplateName) {
      documentTitle = params.selectedTemplateName;
    } else if (params.instructions.trim()) {
      const t = params.instructions.trim();
      documentTitle = t.length > 48 ? `${t.slice(0, 48)}…` : t;
=======
    let documentTitle = "Mutual Compliance Agreement";

    if (params.mode === "Basic") {
      // QUALITY_FIX: previous — `Mutual NDA - ${params.basicPartyB}` jammed a party
      // name into the document title (e.g. "Mutual NDA - Vendor Infrastructure Host").
      // Use a clean legal title; the party details belong in the body, not the title.
      documentTitle = params.selectedTemplateName || "Draft Agreement";
    } else if (params.advancedStep === "proactive") {
      documentTitle = params.selectedTemplateName || "Proactive Draft Covenants";
    } else {
      documentTitle = `Ingested response: ${params.uploadFileName || "Reactive Blueprint"}`;
>>>>>>> origin/development
    }

    setIsGeneratorActive(false);

    let payload: DraftRequestPayload;
    try {
      payload = buildGenerateStreamPayload({
        mode: params.mode,
        instructions: params.instructions,
        playbookGuidelines: params.playbookGuidelines,
        advancedStep: params.advancedStep,
        referenceInstructions: params.referenceInstructions,
        aiRulebookPrompt: params.aiRulebookPrompt,
        sourceDocumentId: params.sourceDocumentId,
        documentId: params.documentId,
      });
    } catch (validationErr: any) {
      setIsStreaming(false);
      setStreamingProgress("");
      setDraftError(validationErr.message || "Invalid drafting configuration.");
      return;
    }

    try {
      const jobId = await enqueueDraftingJob(
        authToken,
        "/api/drafting/generate-stream",
        payload
      );

      let streamBuffer = "";
      const outcome = await waitForDraftJob({
        authToken,
        jobId,
        onProgress: reportProgress,
        onToken: (delta) => {
          streamBuffer += delta;
          reportProgress("Drafting your document...");
          setEditorContent(markdownToHtml(normalizeDraftMarkdownInput(streamBuffer)));
        },
      });

      await settleJobOutcome(outcome, documentTitle);
    } catch (err: any) {
      console.error(err);
      setDraftError(err.message || "Drafting failed. Please try again.");
    } finally {
      setIsStreaming(false);
      setStreamingProgress("");
    }
  };

  const handleResumeAsk = async (
    documentId: string,
    answers: Record<string, string>
  ) => {
    if (!documentId) {
      setDraftError("Cannot resume: missing document id.");
      return;
    }

    setIsStreaming(true);
    reportProgress("Applying your answers and continuing…");
    setDraftError("");

    try {
      const jobId = await enqueueDraftingJob(authToken, "/api/drafting/resume-ask", {
        documentId,
        answers,
      });

      let streamBuffer = "";
      const outcome = await waitForDraftJob({
        authToken,
        jobId,
        onProgress: reportProgress,
        onToken: (delta) => {
          streamBuffer += delta;
          reportProgress("Drafting your document...");
          setEditorContent(markdownToHtml(normalizeDraftMarkdownInput(streamBuffer)));
        },
      });

      await settleJobOutcome(outcome, "Draft Agreement");
    } catch (err: any) {
      console.error(err);
      setDraftError(err.message || "Failed to resume drafting.");
    } finally {
      setIsStreaming(false);
      setStreamingProgress("");
    }
  };

  /** Workspace follow-up chat — full-document HUMAN_REFINE (no highlight). */
  const handleWorkspaceRefine = async (instructions: string) => {
    const docId = currentDocumentId;
    if (!docId) {
      setDraftError("Save or generate a draft first so I know which document to refine.");
      return;
    }

    const trimmed = instructions.trim();
    if (!trimmed) return;

    setRefinementError("");
    setRefinementProgress("Preparing your refinement request...");
    onProgress?.("Refining your draft…");
    pushUndoSnapshot(editorContent);
    setIsStreaming(true);

    try {
      const jobId = await enqueueDraftingJob(authToken, "/api/drafting/refine", {
        documentId: docId,
        instructions: trimmed,
      } satisfies RefineRequestPayload);

      const outcome = await waitForDraftJob({
        authToken,
        jobId,
        onProgress: (message) => {
          setRefinementProgress(message);
          onProgress?.(message);
        },
      });

      if (outcome.kind === "failed") {
        setRefinementError(outcome.error);
        onProgress?.(outcome.error);
        return;
      }

      if (outcome.kind === "needs_input") {
        if (outcome.documentId) bindDocumentShell(outcome.documentId, "Draft in progress...");
        onNeedsInput?.(outcome.openQuestions, outcome.documentId);
        return;
      }

      if (!outcome.content) {
        setRefinementError("Refinement completed without returning revised text.");
        return;
      }

      applyDocumentToEditor(outcome.content);
      onRefineComplete?.();
    } catch (err: any) {
      console.error("Workspace refine failed", err);
      setRefinementError(err.message || "Refinement failed.");
    } finally {
      setIsStreaming(false);
      setRefinementProgress("");
      setStreamingProgress("");
    }
  };

  const analyzeUploadedTemplate = async (file: File) => {
    setIsParsingTemplate(true);
    setStreamingProgress("Uploading counterparty document to reactive gateway...");

    try {
      const sourceId = await uploadReactiveSourceTemplate(file);
      setUploadFileName(file.name);
      setStreamingProgress(`Source document registered: ${sourceId}`);

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = (event.target?.result as string) || "";
        setUploadText(text);
      };
      reader.readAsText(file);
    } catch (err: any) {
      console.warn("Reactive source upload failed:", err);
      setDraftError(err.message || "Failed to upload source template.");
    } finally {
      setIsParsingTemplate(false);
      setStreamingProgress("");
    }
  };

  const processFile = async (file: File) => {
    setUploadFileName(file.name);
    setIsParsingTemplate(true);
    setStreamingProgress("Uploading template file to reactive ingestion gateway...");

    try {
      await analyzeUploadedTemplate(file);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.warn("Secure backend upload failed:", err.message);
      setDraftError(err.message || "File upload failed.");
    } finally {
      setIsParsingTemplate(false);
      setStreamingProgress("");
    }
  };

  const handleApplyRewriteResilient = async (type: string, param: string = "") => {
    if (!selectedTextRange) return;
    const capturedRange = { ...selectedTextRange };

    const editor = tiptapEditorRef.current;
    const originalText = editor
      ? editor.state.doc.textBetween(capturedRange.start, capturedRange.end, "\n")
      : "";
    if (!originalText) return;

    if (!currentDocumentId) {
      alert("Refinement requires an active draft document. Generate or save a draft first.");
      return;
    }
    setRefinementError("");
    setRefinementProgress("Preparing your refinement request...");
    setActiveDropdown(null);
    setShowFloatingMenu(false);
    setSelectedTextRange(null);
    pushUndoSnapshot(editorContent);

    const refinePayload = buildRefinePayload(
      currentDocumentId,
      type,
      param,
      originalText
    );

    try {
      const jobId = await enqueueDraftingJob(
        authToken,
        "/api/drafting/refine",
        refinePayload
      );

      const outcome = await waitForDraftJob({
        authToken,
        jobId,
        onProgress: (message) => setRefinementProgress(message),
      });

      if (outcome.kind === "failed") {
        setRefinementError(outcome.error);
        return;
      }

      if (outcome.kind === "needs_input") {
        onNeedsInput?.(outcome.openQuestions, outcome.documentId);
        return;
      }

      if (!outcome.content) {
        setRefinementError("Refinement completed without returning revised text.");
        return;
      }

      setRefinementProgress("Applying the refined text...");
      applyDocumentToEditor(outcome.content);
      onRefineComplete?.();
    } catch (err: any) {
      console.error("Refinement failed", err);
      setRefinementError(err.message || "Refinement failed.");
      alert("Refinement failed: " + err.message);
    } finally {
      setRefinementProgress("");
      setAskAiQuery("");
    }
  };

  return {
    handleExecuteDraftStream,
    handleCreateAndSaveGeneratedDoc,
    handleResumeAsk,
    handleWorkspaceRefine,
    processFile,
    analyzeUploadedTemplate,
    handleApplyRewriteResilient,
  };
}
