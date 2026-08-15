import { apiUrl } from "../../../config";
import { LegalDocument } from "../../../shared/types";
import { markdownToHtml } from "../../../shared/utils/markdownToHtml";

// --- Backend-aligned payload types (mirror the unified DraftRequestSchema) ---
// The backend receives only raw user intent; contractType, parties, governing law,
// term tiers, liability, etc. are derived in orchestration step 1 (requirement extraction).

type DraftRequestPayload = {
  mode: "BASIC" | "PROACTIVE" | "REACTIVE";
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

function buildGenerateStreamPayload(uiState: DraftUiState): DraftRequestPayload {
  if (uiState.mode === "Basic") {
    return {
      mode: "BASIC",
      draftInput: uiState.instructions,
      draftInstructions: uiState.playbookGuidelines || "",
    };
  }

  if (uiState.advancedStep === "proactive") {
    const draftInput = uiState.referenceInstructions || uiState.instructions;
    if (!draftInput || !draftInput.trim()) {
      throw new Error("Please describe what you want to draft in the first field.");
    }

    return {
      mode: "PROACTIVE",
      draftInput,
      draftInstructions: uiState.aiRulebookPrompt || "",
      // Vault selector arrives later; proactive currently runs on default documents.
      documentId: uiState.documentId ?? null,
    };
  }

  if (!uiState.sourceDocumentId) {
    throw new Error("Reactive drafting requires an uploaded source document. Please upload a file first.");
  }

  return {
    mode: "REACTIVE",
    // The uploaded document IS the "what to draft"; the user's typed rules are the
    // instructions. All other details are extracted from the document in step 1.
    draftInput: "",
    draftInstructions: uiState.instructions || "",
    uploadedDocument: uiState.sourceDocumentId,
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
  refinementProgress,
  setRefinementProgress,
  refinementError,
  setRefinementError,
  tiptapEditorRef,
}: UseDraftGeneratorActionsParams) {

  const handleCreateAndSaveGeneratedDoc = async (title: string, content: string, existingDocId?: string) => {
    if (existingDocId) {
      setSelectedDoc({
        versions: [],
        signatures: [],
        sharedWith: [],
        redlines: [],
        auditLogs: [],
        id: existingDocId,
        title,
        type: "Custom",
        creatorId: "",
        creatorEmail: "",
        isEncrypted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content,
      });
      onRefresh();
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/documents"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ title, type: "Custom", content })
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
      console.error("Storing generated code failed, using fallback client storage", err);
    }
  };

  const uploadReactiveSourceTemplate = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(apiUrl("/api/drafting/process-uploaded-template"), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`
      },
      body: formData
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
    setStreamingProgress("Initiating multi-agent ingestion pipeline...");
    setDraftError("");
    pushUndoSnapshot(editorContent);
    // Reset the canvas so the live streaming preview starts from a clean slate
    // (the previous content was just snapshotted above for undo).
    setEditorContent("");

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
      const res = await fetch(apiUrl("/api/drafting/generate-stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Drafting request failed");

      if (res.status === 202 && data.job_id) {
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        // Live token stream buffer — filled by "draft_token" events and rendered
        // incrementally. The final "completed" event is the authoritative content.
        let streamBuffer = "";
        eventSource.onmessage = (event) => {
          const p = JSON.parse(event.data);

          // Real token streaming: append deltas and render live as the doc is written.
          if (p.event === "draft_token" && p.jobId === data.job_id) {
            streamBuffer += p.delta || "";
            setStreamingProgress("Drafting your document...");
            setEditorContent(markdownToHtml(normalizeDraftMarkdownInput(streamBuffer)));
            return;
          }

          if (p.event === "job_update" && p.job.id === data.job_id) {
            if (p.job.message) setStreamingProgress(p.job.message);
            if (p.job.status === "completed") {
              // Resilient textual property extraction mapping loop
              const resultContent = 
                p.job.result?.content || 
                p.job.result?.data || 
                p.job.result?.draft?.formattedDocument || 
                "";
                
              const resultFileId = p.job.result?.file_id || p.job.result?.documentId;
              const normalizedResultContent = normalizeDraftMarkdownInput(resultContent);
              const htmlContent = markdownToHtml(normalizedResultContent);
              
              setEditorContent(htmlContent);
              setIsStreaming(false);
              setStreamingProgress("");
              handleCreateAndSaveGeneratedDoc(documentTitle, normalizedResultContent, resultFileId);
              eventSource.close();
              
            } else if (p.job.status === "failed") {
              eventSource.close();
              setIsStreaming(false);
              setStreamingProgress("");
              setDraftError(p.job.error || "Draft generation failed. Please try again.");
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setIsStreaming(false);
          setStreamingProgress("");
          setDraftError("Connection to drafting engine was interrupted. Please retry.");
        };
      }
    } catch (err: any) {
      console.error(err);
      setIsStreaming(false);
      setStreamingProgress("");
      setDraftError(err.message || "Drafting failed. Please try again.");
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

    // The refinement endpoint returns the complete revised document. Even for a
    // highlighted-text request, the backend surgically patches that selection
    // into its document snapshot and returns the resulting full document.
    const applyRefinedDocument = (rewritten: string) => {
      const rewrittenHtml = markdownToHtml(rewritten);
      const ed = tiptapEditorRef.current;
      if (ed) {
        ed.chain()
          .focus()
          .setContent(rewrittenHtml)
          .run();
        setEditorContent(ed.getHTML());
      }
    };

    const refinePayload = buildRefinePayload(currentDocumentId, type, param, originalText);

    try {
      const res = await fetch(apiUrl("/api/drafting/refine"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(refinePayload)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Refinement request failed");

      if (res.status === 202 && payload.job_id) {
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "job_update" && data.job.id === payload.job_id) {
            if (data.job.message) {
              setRefinementProgress(data.job.message);
            } else if (data.job.status === "processing") {
              setRefinementProgress("Refinement in progress...");
            }

            if (data.job.status === "completed") {
              // Resilient extraction layer for the refinement loop artifacts
              const rewritten = 
                data.job.result?.data || 
                data.job.result?.content || 
                data.job.result?.draft?.formattedDocument || 
                "";

              if (!rewritten) {
                setRefinementProgress("");
                setRefinementError("Refinement completed without returning revised text.");
                eventSource.close();
                return;
              }

              setRefinementProgress("Applying the refined text...");
              applyRefinedDocument(normalizeDraftMarkdownInput(rewritten));
              setRefinementProgress("");
              setAskAiQuery("");
              eventSource.close();
            } else if (data.job.status === "failed") {
              setRefinementProgress("");
              setRefinementError(data.job.error || "Refinement failed: Unknown error");
              setAskAiQuery("");
              eventSource.close();
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setRefinementProgress("");
          setRefinementError("Refinement failed: job connection interrupted");
          setAskAiQuery("");
        };
        return;
      }

      const rewritten = payload.data ?? payload.result ?? payload.text ?? "";
      if (!rewritten) {
        throw new Error("Refinement completed without returning revised text.");
      }
      applyRefinedDocument(normalizeDraftMarkdownInput(rewritten));
      setRefinementProgress("");

    } catch (err: any) {
      console.error("Refinement failed", err);
      setRefinementProgress("");
      setRefinementError(err.message || "Refinement failed.");
      alert("Refinement failed: " + err.message);
    } finally {
      setAskAiQuery("");
    }
  };

  return {
    handleExecuteDraftStream,
    handleCreateAndSaveGeneratedDoc,
    processFile,
    analyzeUploadedTemplate,
    handleApplyRewriteResilient,
  };
}
