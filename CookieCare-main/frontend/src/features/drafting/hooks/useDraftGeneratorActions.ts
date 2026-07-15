import { apiUrl } from "../../../config";
import { LegalDocument } from "../../../shared/types";
import { markdownToHtml } from "../../../shared/utils/markdownToHtml";
import { AdvancedField } from "../types";

// --- Backend-aligned payload types (mirror DraftRequestSchema / RefineRequestSchema) ---

type BasicDraftPayload = {
  mode: "BASIC";
  instructions: string;
  contractType: string;
  formFields: Record<string, string>;
};

type ProactiveDraftPayload = {
  mode: "PROACTIVE";
  instructions: string;
  templateId: string;
  playbookId?: string;
  clauseIds?: string[];
};

type ReactiveDraftPayload = {
  mode: "REACTIVE";
  sourceDocumentId: string;
  extractedFields: Record<string, string>;
  instructions: string;
};

type DraftRequestPayload = BasicDraftPayload | ProactiveDraftPayload | ReactiveDraftPayload;

type RefineRequestPayload = {
  documentId: string;
  instructions: string;
  highlightedText?: string;
};

type DraftUiState = {
  mode: string;
  instructions: string;
  basicPartyA: string;
  basicPartyB: string;
  basicLaw: string;
  basicLiability: string;
  advancedStep: string;
  selectedTemplateName: string | null;
  referenceInstructions: string;
  uploadFileName: string;
  advancedFieldValues: Record<string, string>;
  selectedClauses: string[];
  sourceDocumentId: string;
  playbookId?: string;
};

function buildGenerateStreamPayload(uiState: DraftUiState): DraftRequestPayload {
  if (uiState.mode === "Basic") {
    const formFields: Record<string, string> = {
      contractType: "NDA",
      party_a: uiState.basicPartyA,
      party_b: uiState.basicPartyB,
      governing_law: uiState.basicLaw,
      liability_cap: uiState.basicLiability,
    };

    return {
      mode: "BASIC",
      instructions: uiState.instructions,
      contractType: formFields.contractType || "NDA",
      formFields,
    };
  }

  if (uiState.advancedStep === "proactive") {
    if (!uiState.selectedTemplateName) {
      throw new Error("Proactive drafting requires a selected template.");
    }

    return {
      mode: "PROACTIVE",
      instructions: uiState.referenceInstructions || uiState.instructions,
      templateId: uiState.selectedTemplateName,
      playbookId: uiState.playbookId || undefined,
      clauseIds: uiState.selectedClauses.length > 0 ? uiState.selectedClauses : undefined,
    };
  }

  if (!uiState.sourceDocumentId) {
    throw new Error("Reactive drafting requires an uploaded source document. Please upload a file first.");
  }

  return {
    mode: "REACTIVE",
    sourceDocumentId: uiState.sourceDocumentId,
    extractedFields: uiState.advancedFieldValues || {},
    instructions: uiState.instructions,
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

function extractPlaceholderFields(text: string): AdvancedField[] {
  const placeholders = Array.from(text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g));
  return placeholders.map((match, index) => ({
    id: match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || `field_${index + 1}`,
    name: match[1].trim(),
    defaultValue: "",
    description: "Template field",
  }));
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
  setAdvancedFields: (fields: AdvancedField[]) => void;
  setAdvancedFieldValues: (values: Record<string, string>) => void;
  selectedTextRange: { start: number; end: number } | null;
  setSelectedTextRange: (range: { start: number; end: number } | null) => void;
  setShowFloatingMenu: (show: boolean) => void;
  setIsAiRefiningText: (refining: boolean) => void;
  setActiveDropdown: (dropdown: string | null) => void;
  setShowAskAiInput: (show: boolean) => void;
  setAskAiQuery: (query: string) => void;
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
  setAdvancedFields,
  setAdvancedFieldValues,
  selectedTextRange,
  setSelectedTextRange,
  setShowFloatingMenu,
  setIsAiRefiningText,
  setActiveDropdown,
  setShowAskAiInput,
  setAskAiQuery,
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
        type: "draft",
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
    basicPartyA: string;
    basicPartyB: string;
    basicLaw: string;
    basicLiability: string;
    advancedStep: string;
    selectedTemplateName: string | null;
    aiRulebookPrompt: string;
    referenceInstructions: string;
    uploadFileName: string;
    uploadText: string;
    advancedFieldValues: Record<string, string>;
    selectedClauses: string[];
    sourceDocumentId: string;
    playbookId?: string;
  }) => {
    setIsStreaming(true);
    setStreamingProgress("Initiating multi-agent ingestion pipeline...");
    setDraftError("");
    pushUndoSnapshot(editorContent);

    let documentTitle = "Mutual Compliance Agreement";

    if (params.mode === "Basic") {
      documentTitle = `Mutual NDA - ${params.basicPartyB}`;
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
        basicPartyA: params.basicPartyA,
        basicPartyB: params.basicPartyB,
        basicLaw: params.basicLaw,
        basicLiability: params.basicLiability,
        advancedStep: params.advancedStep,
        selectedTemplateName: params.selectedTemplateName,
        referenceInstructions: params.referenceInstructions,
        uploadFileName: params.uploadFileName,
        advancedFieldValues: params.advancedFieldValues,
        selectedClauses: params.selectedClauses,
        sourceDocumentId: params.sourceDocumentId,
        playbookId: params.playbookId,
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
        eventSource.onmessage = (event) => {
          const p = JSON.parse(event.data);
          if (p.event === "job_update" && p.job.id === data.job_id) {
            if (p.job.message) setStreamingProgress(p.job.message);
            if (p.job.status === "completed") {
              const resultContent = p.job.result.content;
              const resultFileId = p.job.result.file_id;
              const htmlContent = markdownToHtml(resultContent);
              setEditorContent(htmlContent);
              setIsStreaming(false);
              setStreamingProgress("");
              handleCreateAndSaveGeneratedDoc(documentTitle, resultContent, resultFileId);
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

        const fields = extractPlaceholderFields(text);
        if (fields.length > 0) {
          setAdvancedFields(fields);
          const seedVals: Record<string, string> = {};
          fields.forEach((f) => {
            seedVals[f.id] = f.defaultValue;
          });
          setAdvancedFieldValues(seedVals);
        }
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

    setIsAiRefiningText(true);
    setActiveDropdown(null);
    setShowAskAiInput(false);
    setShowFloatingMenu(false);
    setSelectedTextRange(null);
    pushUndoSnapshot(editorContent);

    const applyRewrite = (rewritten: string) => {
      const rewrittenHtml = markdownToHtml(rewritten);
      const ed = tiptapEditorRef.current;
      if (ed) {
        ed.chain()
          .focus()
          .insertContentAt({ from: capturedRange.start, to: capturedRange.end }, rewrittenHtml)
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
            if (data.job.status === "completed") {
              applyRewrite(data.job.result.data ?? "");
              setIsAiRefiningText(false);
              setAskAiQuery("");
              eventSource.close();
            } else if (data.job.status === "failed") {
              setIsAiRefiningText(false);
              setAskAiQuery("");
              eventSource.close();
              alert("Refinement failed: " + (data.job.error || "Unknown error"));
            }
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setIsAiRefiningText(false);
          setAskAiQuery("");
          alert("Refinement failed: job connection interrupted");
        };
        return;
      }

      const rewritten = payload.data ?? payload.result ?? payload.text ?? "";
      if (rewritten) applyRewrite(rewritten);

    } catch (err: any) {
      console.error("Refinement failed", err);
      alert("Refinement failed: " + err.message);
    } finally {
      setIsAiRefiningText(false);
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
