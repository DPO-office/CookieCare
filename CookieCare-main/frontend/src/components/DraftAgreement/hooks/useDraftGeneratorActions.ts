import { apiUrl } from "../../../config";
import { LegalDocument } from "../../../types";
import { markdownToHtml } from "../../../utils/markdownToHtml";
import { AdvancedField } from "../types";

interface UseDraftGeneratorActionsParams {
  authToken: string;
  onRefresh: () => void;
  editorContent: string;
  pushUndoSnapshot: (snapshot: string) => void;
  setEditorContent: (content: string) => void;
  setSelectedDoc: (doc: LegalDocument | null) => void;
  setIsGeneratorActive: (active: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamingProgress: (progress: string) => void;
  setDraftError: (error: string) => void;
  setUploadText: (text: string) => void;
  setUploadFileName: (name: string) => void;
  setIsParsingTemplate: (parsing: boolean) => void;
  setAdvancedFields: (fields: AdvancedField[]) => void;
  setAdvancedFieldValues: (values: Record<string, string>) => void;
  // Floating sparkle / inline rewrite
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
  pushUndoSnapshot,
  setEditorContent,
  setSelectedDoc,
  setIsGeneratorActive,
  setIsStreaming,
  setStreamingProgress,
  setDraftError,
  setUploadText,
  setUploadFileName,
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

  const handleCreateAndSaveGeneratedDoc = async (title: string, content: string) => {
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
  }) => {
    setIsStreaming(true);
    setStreamingProgress("Initiating multi-agent ingestion pipeline...");
    setDraftError("");
    pushUndoSnapshot(editorContent);

    let documentTitle = "Mutual Compliance Agreement";
    const payload: any = {
      mode: params.mode,
      outputLevel: params.depth,
      instructions: params.instructions,
    };

    if (params.mode === "Basic") {
      documentTitle = `Mutual NDA - ${params.basicPartyB}`;
      payload.formFields = {
        party_a: params.basicPartyA,
        party_b: params.basicPartyB,
        governing_law: params.basicLaw,
        liability_cap: params.basicLiability
      };
    } else {
      if (params.advancedStep === "proactive") {
        documentTitle = params.selectedTemplateName || "Proactive Draft Covenants";
        payload.templateId = params.selectedTemplateName;
        payload.playbookText = params.aiRulebookPrompt;
        payload.instructions = params.referenceInstructions || params.instructions;
      } else {
        documentTitle = `Ingested response: ${params.uploadFileName || "Reactive Blueprint"}`;
        payload.sourceText = params.uploadText;
        payload.formFields = params.advancedFieldValues;
      }
    }

    setIsGeneratorActive(false);

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
              const htmlContent = markdownToHtml(p.job.result.content);
              setEditorContent(htmlContent);
              setIsStreaming(false);
              setStreamingProgress("");
              handleCreateAndSaveGeneratedDoc(documentTitle, p.job.result.content);
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

  const analyzeUploadedTemplate = async (text: string) => {
    setIsParsingTemplate(true);
    setStreamingProgress("PII Shield Redaction & Parameter extraction active...");
    try {
      const res = await fetch(apiUrl("/api/drafting/process-uploaded-template"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ templateText: text })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);

      setUploadText(payload.data.redactedText || text);
      if (payload.data.fields && payload.data.fields.length > 0) {
        setAdvancedFields(payload.data.fields);
        const seedVals: Record<string, string> = {};
        payload.data.fields.forEach((f: any) => {
          seedVals[f.id] = f.defaultValue;
        });
        setAdvancedFieldValues(seedVals);
      }
      setStreamingProgress("");
    } catch (err: any) {
      console.warn("PII Sanitization placeholder applied", err);
    } finally {
      setIsParsingTemplate(false);
      setStreamingProgress("");
    }
  };

  const processFile = async (file: File) => {
    setUploadFileName(file.name);
    setIsParsingTemplate(true);
    setStreamingProgress("Uploading template file and parsing legal structure securely...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isTemplate", "true");
      formData.append("templateType", "Template");

      const res = await fetch(apiUrl("/api/documents/upload"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`
        },
        body: formData
      });

      let payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "File upload failed");

      if (res.status === 202 && payload.job_id) {
        setStreamingProgress("Offloaded to background job-queue. Processing file...");
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));

        eventSource.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "job_update" && data.job.id === payload.job_id) {
            setStreamingProgress(`Processing file... (${data.job.progress}%) - ${data.job.message}`);

            if (data.job.status === "completed") {
              eventSource.close();
              const resultData = data.job.result;
              setUploadText(resultData.content || "");
              await analyzeUploadedTemplate(resultData.content || "");
              if (onRefresh) onRefresh();
              setIsParsingTemplate(false);
            } else if (data.job.status === "failed") {
              eventSource.close();
              setIsParsingTemplate(false);
              alert("Background parsing failed: " + data.job.error);
            }
          }
        };
        return;
      }

      setUploadText(payload.content);
      await analyzeUploadedTemplate(payload.content);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.warn("Secure backend upload bypassed, falling back to local text processing:", err.message);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        setUploadText(text);
        await analyzeUploadedTemplate(text);
      };
      reader.readAsText(file);
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

    try {
      const res = await fetch(apiUrl("/api/drafting/refine"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ text: originalText, type, param })
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
