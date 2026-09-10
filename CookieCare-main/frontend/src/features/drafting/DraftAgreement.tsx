import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../contexts/AppContext";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import DraftChatLanding from "./components/DraftChatLanding";
import DraftSplitWorkspace from "./components/DraftSplitWorkspace";
import CreateDocModal from "./components/CreateDocModal";
import SaveDraftModal from "./components/SaveDraftModal";
import { DraftLibraryPicker } from "./components/DraftLibraryPicker";
import { DraftHistoryPanel } from "./components/DraftHistoryPanel";
import { VaultPickerSheet } from "../analyze/components/VaultPickerSheet";
import { useDraftEditorState } from "./hooks/useDraftEditorState";
import { useDraftGeneratorState } from "./hooks/useDraftGeneratorState";
import { useDraftApiActions } from "./hooks/useDraftApiActions";
import { useDraftGeneratorActions } from "./hooks/useDraftGeneratorActions";
import { useDraftChat } from "./hooks/useDraftChat";
import { useDraftLibrary } from "./hooks/useDraftLibrary";
import { useDraftHistory } from "./hooks/useDraftHistory";
import { useDraftPromptLibrary } from "./hooks/useDraftPromptLibrary";
import { useAnalyzeData } from "../analyze/hooks/useAnalyzeData";
import { getSelectedDocuments } from "../analyze/documentSelection";
import { composeDraftContext } from "./utils/composeDraftContext";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";
import { DraftAgreementProps } from "./types";
import type { RichTextSelectionSnapshot } from "../../shared/components/RichTextEditor";
import type { DraftHistoryItem } from "./hooks/useDraftHistory";

export default function DraftAgreement({
  initialDocumentId: initialDocumentIdProp,
}: Pick<DraftAgreementProps, "initialDocumentId">) {
  const { documents, authToken, fetchDocuments, setActiveDocument, openDraftId, setOpenDraftId } = useAppContext();
  const onRefresh = fetchDocuments;
  const onSelectDocument = setActiveDocument;
  // Prefer context openDraftId (set by vault "open in draft editor") over route prop
  const initialDocumentId = openDraftId ?? initialDocumentIdProp;
  
  // --- State management hooks ---
  const editorState = useDraftEditorState(documents, initialDocumentId);
  const generatorState = useDraftGeneratorState();
  const draftChat = useDraftChat();

  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(!!initialDocumentId);
  const [workspaceChatInput, setWorkspaceChatInput] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Draft session");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [libraryPicker, setLibraryPicker] = useState<"template" | "playbook" | "clauses" | null>(null);

  // --- History panel state ---
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  const { history, fetchHistory, deleteEntry, loading: historyLoading, error: historyError, deleteError, clearDeleteError } = useDraftHistory(authToken);

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    fetchHistory();
  };

  const handleCloseHistory = () => {
    setIsHistoryOpen(false);
  };

  const handleLoadHistoryEntry = async (entry: DraftHistoryItem) => {
    // Mark generator as active so workspace is fully initialized
    editorState.setIsGeneratorActive(true);

    // Normalize raw content: if it's already HTML leave it alone, otherwise
    // convert from Markdown so markup characters never appear in the editor.
    const normalizeContent = (raw: string): string => {
      const isHtml = /<[a-z][\s\S]*>/i.test(raw.trim());
      return isHtml ? raw : markdownToHtml(raw);
    };

    /** Opens the workspace showing the "Draft unavailable" message instead of
     *  a blank editor. The history entry is kept intact. */
    const showUnavailable = () => {
      setIsHistoryOpen(false);
      setDraftUnavailable(true);
      setIsWorkspaceOpen(true);
      setSessionTitle(entry.title || "Untitled");
    };

    if (entry.formatted_text) {
      // We have content from the 3-tier backend fallback — use it directly.
      const normalized = normalizeContent(entry.formatted_text);
      editorState.setEditorContent(normalized);

      if (entry.documentId) {
        const doc = documents.find((d: any) => d.id === entry.documentId);
        if (doc) {
          // Raise the suppress flag so the selectedDoc sync effect does NOT
          // overwrite what we just set.
          // Edge-case: if `doc` is the *exact same reference* already in
          // selectedDoc, React will bail out of setSelectedDoc and the effect
          // will never fire — meaning suppressDocSyncRef would stay `true`
          // forever and block the next legitimate document switch.
          // Guard: if the reference is identical, skip setSelectedDoc entirely
          // (content is already set above) and ensure the flag stays false.
          if (doc === editorState.selectedDoc) {
            // Same ref — effect won't run; flag must stay clear.
            editorState.suppressDocSyncRef.current = false;
          } else {
            editorState.suppressDocSyncRef.current = true;
            editorState.setSelectedDoc(doc);
          }
          onSelectDocument(doc);
        }
        // If doc not in local list, content is still set above — nothing more needed.
      }
    } else if (entry.status === "failed") {
      // Failed job — there is genuinely no content to show.
      showUnavailable();
      return;
    } else {
      // formatted_text is null for a completed job — the ledger entry may be
      // missing (e.g. updateJobState failed after the pipeline finished).
      // Fall back to loading from the associated document if one exists.
      if (entry.documentId) {
        const doc = documents.find((d: any) => d.id === entry.documentId);
        if (doc) {
          // Only use the doc fallback if it actually has content — a placeholder
          // files row created before the pipeline ran stores "" and would cause
          // the same blank editor as the original bug.
          const docHasContent = !!(doc.content || "").trim();
          if (!docHasContent) {
            // Incomplete draft — no content anywhere.
            showUnavailable();
            return;
          }
          // Let the selectedDoc effect run normally — it will load doc.content.
          // Only suppress if it's a different doc to avoid clobbering nothing.
          editorState.suppressDocSyncRef.current = false;
          if (doc !== editorState.selectedDoc) {
            editorState.setSelectedDoc(doc);
          } else {
            // Same doc already selected — manually sync content from it.
            const raw = doc.content || "";
            const isHtml = /<[a-z][\s\S]*>/i.test(raw.trim());
            editorState.setEditorContent(isHtml ? raw : markdownToHtml(raw));
          }
          onSelectDocument(doc);
        } else {
          // Document not in local list — content is genuinely unavailable.
          showUnavailable();
          return;
        }
      } else {
        // No documentId and no formatted_text — content is unavailable.
        showUnavailable();
        return;
      }
    }

    // Successful load — clear any prior unavailable state.
    setDraftUnavailable(false);
    setIsHistoryOpen(false);
    setIsWorkspaceOpen(true);
    setSessionTitle(entry.title || "Untitled");
  };

  const handleDeleteHistoryEntry = async (jobId: string): Promise<boolean> => {
    const success = await deleteEntry(jobId);
    if (success) {
      await fetchHistory();
    }
    return success;
  };

  const {
    templates,
    clauses: clauseLibrary,
    playbooks,
    privateTemplates,
    orgTemplates,
    privateClauses,
    orgClauses,
    privatePlaybooks,
    orgPlaybooks,
  } = useDraftLibrary(authToken);
  const { starterPrompts, customPrompts, addPrompt, removePrompt } = useDraftPromptLibrary(authToken);
  const {
    folders,
    savedDrafts,
    toggleFolderSelection,
    toggleFolderExpanded,
    toggleFileSelection,
    toggleDraftSelection,
    deselectDocument,
  } = useAnalyzeData(authToken);

  const selectedVaultDocs = useMemo(
    () => getSelectedDocuments(folders, savedDrafts).filter((d) => d.type !== "folder"),
    [folders, savedDrafts]
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === generatorState.selectedTemplateId) ?? null,
    [templates, generatorState.selectedTemplateId]
  );
  const selectedPlaybook = useMemo(
    () => playbooks.find((p) => p.id === generatorState.selectedPlaybookId) ?? null,
    [playbooks, generatorState.selectedPlaybookId]
  );
  const selectedClauseItems = useMemo(
    () => clauseLibrary.filter((c) => generatorState.selectedClauseIds.includes(c.id)),
    [clauseLibrary, generatorState.selectedClauseIds]
  );

  // --- Modal states ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState("");

  // --- Floating sparkle menu states ---
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [floatingMenuPos, setFloatingMenuPos] = useState({ x: 0, y: 0 });
  const [selectedTextRange, setSelectedTextRange] = useState<{ start: number; end: number } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [askAiQuery, setAskAiQuery] = useState("");

  // --- API actions ---
  const apiActions = useDraftApiActions({
    authToken,
    onRefresh,
    setSelectedDoc: editorState.setSelectedDoc,
    setEditorContent: editorState.setEditorContent,
    setIsSaving: editorState.setIsSaving,
    setSavingMsg: editorState.setSavingMsg,
  });

  // --- Generator actions ---
  const completionNotifiedRef = useRef(false);

  const generatorActions = useDraftGeneratorActions({
    authToken,
    onRefresh,
    editorContent: editorState.editorContent,
    currentDocumentId: editorState.selectedDoc?.id ?? null,
    pushUndoSnapshot: editorState.pushUndoSnapshot,
    setEditorContent: editorState.setEditorContent,
    setSelectedDoc: editorState.setSelectedDoc,
    setIsGeneratorActive: editorState.setIsGeneratorActive,
    setIsStreaming: generatorState.setIsStreaming,
    setStreamingProgress: generatorState.setStreamingProgress,
    setDraftError: generatorState.setDraftError,
    setUploadText: generatorState.setUploadText,
    setUploadFileName: generatorState.setUploadFileName,
    setSourceDocumentId: generatorState.setSourceDocumentId,
    setIsParsingTemplate: generatorState.setIsParsingTemplate,
    selectedTextRange,
    setSelectedTextRange,
    setShowFloatingMenu,
    setActiveDropdown,
    setAskAiQuery,
    refinementProgress: generatorState.refinementProgress,
    setRefinementProgress: generatorState.setRefinementProgress,
    refinementError: generatorState.refinementError,
    setRefinementError: generatorState.setRefinementError,
    tiptapEditorRef: editorState.tiptapEditorRef,
    onProgress: (message) => draftChat.updateProgressMessage(message),
    onNeedsInput: (questions, documentId) => {
      if (documentId) {
        onSelectDocument({
          id: documentId,
          title: "Draft in progress...",
        } as any);
      }
      draftChat.addAskMessage(questions);
    },
    onDraftComplete: () => {
      completionNotifiedRef.current = true;
      draftChat.addAssistantMessage(
        "Your draft is ready in the editor. You can edit it directly or ask follow-up questions here."
      );
      // Refresh history list if the panel is currently open so the new entry
      // appears immediately without the user having to close and reopen it.
      if (isHistoryOpen) {
        fetchHistory();
      }
    },
    onRefineComplete: () => {
      draftChat.addAssistantMessage("I've updated the draft based on your request.");
    },
  });

  // --- Event handlers ---
  const handleSelectDoc = (doc: any) => {
    editorState.setSelectedDoc(doc);
    editorState.setIsGeneratorActive(false);
    setIsWorkspaceOpen(true);
    setDraftUnavailable(false);
    setSessionTitle(doc.title);
    onSelectDocument(doc);
  };

  const handleOpenGenerator = () => {
    editorState.setSelectedDoc(null);
    editorState.setIsGeneratorActive(true);
    setIsWorkspaceOpen(false);
    setDraftUnavailable(false);
    draftChat.reset();
    setWorkspaceChatInput("");
    setSessionTitle("Draft session");
    onSelectDocument(null);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    generatorState.setIsDragging(true);
  };

  const handleDragLeave = () => {
    generatorState.setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    generatorState.setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      generatorActions.processFile(file);
    }
  };

  const handleExecuteDraftStream = (overrides?: {
    mode?: string;
    advancedStep?: string;
    sourceDocumentId?: string;
  }) => {
    const contextInstructions = composeDraftContext({
      playbook: selectedPlaybook,
      template: selectedTemplate,
      clauses: selectedClauseItems,
    });
    const vaultSource = selectedVaultDocs[0];
    const sourceDocumentId =
      overrides?.sourceDocumentId ??
      (generatorState.sourceDocumentId || vaultSource?.id || "");
    const mode = overrides?.mode ?? generatorState.mode;
    const advancedStep = overrides?.advancedStep ?? generatorState.advancedStep;

    generatorActions.handleExecuteDraftStream({
      mode,
      depth: generatorState.depth,
      instructions: generatorState.instructions,
      playbookGuidelines: contextInstructions,
      advancedStep,
      selectedTemplateName: selectedTemplate?.name ?? generatorState.selectedTemplateName,
      aiRulebookPrompt: generatorState.aiRulebookPrompt,
      referenceInstructions: generatorState.referenceInstructions,
      uploadFileName: generatorState.uploadFileName || vaultSource?.title || "",
      uploadText: generatorState.uploadText,
      sourceDocumentId,
      documentId: selectedTemplate?.id ?? null,
      templateId: selectedTemplate?.id ?? generatorState.selectedTemplateId,
      playbookId: selectedPlaybook?.id ?? generatorState.selectedPlaybookId,
      clauseIds: generatorState.selectedClauseIds,
    });
  };

  const handleChatSubmit = () => {
    const vaultSource = selectedVaultDocs[0];
    const sourceDocumentId = generatorState.sourceDocumentId || vaultSource?.id || "";
    const hasSource = !!sourceDocumentId;
    const hasContext =
      !!selectedTemplate || !!selectedPlaybook || selectedClauseItems.length > 0;

    if (!generatorState.instructions.trim() && !hasSource && !hasContext) {
      generatorState.setDraftError(
        "Describe what you want to draft, attach a document, or choose a template."
      );
      return;
    }
    generatorState.setDraftError("");

    const prompt =
      generatorState.instructions.trim() ||
      (hasSource
        ? `Draft from: ${generatorState.uploadFileName || vaultSource?.title}`
        : `Draft using ${selectedTemplate?.name || selectedPlaybook?.name || "selected vault items"}`);
    setSessionTitle(prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt);
    draftChat.addUserMessage(prompt);
    draftChat.updateProgressMessage("Starting draft generation…");
    setIsWorkspaceOpen(true);
    editorState.setIsGeneratorActive(false);
    setDraftUnavailable(false);

    const mode = hasSource ? "Advanced" : "Basic";
    const advancedStep = hasSource ? "reactive" : generatorState.advancedStep;
    generatorState.setMode(mode);
    if (hasSource) generatorState.setAdvancedStep("reactive");

    handleExecuteDraftStream({ mode, advancedStep, sourceDocumentId });
  };

  const handleWorkspaceChatSubmit = () => {
    const text = workspaceChatInput.trim();
    if (!text) return;
    if (!editorState.selectedDoc?.id) {
      draftChat.addAssistantMessage(
        "Generate or open a draft first so I know which document to refine."
      );
      return;
    }
    draftChat.addUserMessage(text);
    setWorkspaceChatInput("");
    void generatorActions.handleWorkspaceRefine(text);
  };

  const handleAskSubmit = (messageId: string, answers: Record<string, string>) => {
    const docId = editorState.selectedDoc?.id;
    if (!docId) {
      draftChat.addAssistantMessage("Missing draft document id — cannot continue.");
      return;
    }
    draftChat.resolveAskMessage(messageId);
    const summary = Object.values(answers)
      .map((a) => a.trim())
      .filter(Boolean)
      .join("; ");
    if (summary) draftChat.addUserMessage(summary);
    void generatorActions.handleResumeAsk(docId, answers);
  };

  const handleRemoveAttachedFile = () => {
    generatorState.setUploadFileName("");
    generatorState.setUploadText("");
    generatorState.setSourceDocumentId("");
  };

  const handleRemoveVaultDocument = (id: string) => {
    const doc = selectedVaultDocs.find((d) => d.id === id);
    if (!doc) return;
    deselectDocument(id, doc.type, doc.folderId);
    if (generatorState.sourceDocumentId === id) {
      generatorState.setSourceDocumentId("");
    }
  };

  const uploadedNameShownSeparately =
    generatorState.uploadFileName &&
    !selectedVaultDocs.some((d) => d.title === generatorState.uploadFileName)
      ? generatorState.uploadFileName
      : undefined;

  const handleSaveClick = () => {
    setDraftNameInput(editorState.selectedDoc?.title || "");
    setShowSaveDraftModal(true);
  };

  const handleSaveSubmit = (name: string) => {
    apiActions.handleSaveDraft(
      editorState.selectedDoc,
      editorState.editorContent,
      "Manual Editor Draft Commit",
      name
    );
    setShowSaveDraftModal(false);
  };

  const handleCreateDocSubmit = (title: string, type: "NDA" | "DPA" | "SLA" | "Custom") => {
    apiActions.handleCreateDocument(title, type, () => {
      setShowCreateModal(false);
    });
  };

  const handleEditorSelectionChange = (sel: RichTextSelectionSnapshot | null) => {
    if (!sel || sel.from === sel.to) {
      setShowFloatingMenu(false);
      setSelectedTextRange(null);
      setActiveDropdown(null);
      return;
    }

    // Store ProseMirror positions directly
    setSelectedTextRange({ start: sel.from, end: sel.to });

    // Position the floating menu relative to selection rect
    if (sel.rect) {
      const { x, y } = sel.rect;
      setFloatingMenuPos({ x: x + 10, y: y - 45 });
    }
    setShowFloatingMenu(true);
  };

  const handleDeleteDraft = () => {
    apiActions.handleDeleteDraft(editorState.selectedDoc, () => {
      editorState.setSelectedDoc(null);
      editorState.setIsGeneratorActive(true);
    });
  };

  const handleCopyToClipboard = () => {
    const ed = editorState.tiptapEditorRef.current;
    const text = ed ? ed.state.doc.textContent : editorState.editorContent;
    navigator.clipboard.writeText(text);
  };

  const handleExport = () => {
    apiActions.handleExportDoc(
      editorState.selectedDoc,
      generatorState.selectedTemplateName,
      editorState.editorContent
    );
  };

  const handlePrint = () => {
    apiActions.handlePrintDoc(
      editorState.selectedDoc,
      generatorState.selectedTemplateName,
      editorState.editorContent
    );
  };

  const handleSealDocument = () => {
    apiActions.handleSealDocumentLocally(editorState.selectedDoc);
  };

  const isFullySigned = editorState.selectedDoc?.signatures?.length
    ? editorState.selectedDoc.signatures.every(s => s.status === "signed")
    : false;

  useEffect(() => {
    if (initialDocumentId && editorState.selectedDoc) {
      setIsWorkspaceOpen(true);
      setSessionTitle(editorState.selectedDoc.title);
      // Clear the context flag so re-visiting /drafting doesn't re-open it
      if (openDraftId) setOpenDraftId(undefined);
    }
  }, [initialDocumentId, editorState.selectedDoc]);

  useEffect(() => {
    if (generatorState.isStreaming) {
      completionNotifiedRef.current = false;
    }
  }, [generatorState.isStreaming]);

  useEffect(() => {
    if (generatorState.draftError) {
      draftChat.addAssistantMessage(generatorState.draftError);
    }
  }, [generatorState.draftError]);

  return (
    <div className="flex-1 overflow-hidden flex min-h-0 h-full font-sans">
      
      {/* SSE draft progress overlay.
          During generation we only show the BLOCKING overlay in the brief "thinking"
          phase before the first streamed token arrives; once tokens start flowing we
          hide it and reveal the live StreamingDraftPreview underneath. Refinement (which
          does not stream tokens) keeps the blocking overlay as before. */}
      {(() => {
        const hasStreamedContent =
          !!editorState.editorContent && editorState.editorContent !== "<p></p>";
        const showStreamingOverlay = generatorState.isStreaming && !hasStreamedContent;
        const overlayVisible =
          (showStreamingOverlay || !!generatorState.refinementProgress || !!generatorState.refinementError) &&
          !isWorkspaceOpen;
        return overlayVisible ? (
          <AiProgressOverlay
            visible={overlayVisible}
            message={generatorState.isStreaming ? generatorState.streamingProgress : generatorState.refinementProgress}
            error={generatorState.refinementError}
            label={generatorState.isStreaming ? "Generating draft..." : "Refining selection..."}
            onRetry={generatorState.refinementError ? () => { generatorState.setRefinementError(""); handleExecuteDraftStream(); } : undefined}
            onDismiss={generatorState.refinementError ? () => generatorState.setRefinementError("") : undefined}
          />
        ) : null;
      })()}

      {/* Modals */}
      {showCreateModal && (
        <CreateDocModal
          onCancel={() => setShowCreateModal(false)}
          onSubmit={handleCreateDocSubmit}
        />
      )}

      {showSaveDraftModal && (
        <SaveDraftModal
          draftNameInput={draftNameInput}
          setDraftNameInput={setDraftNameInput}
          onCancel={() => setShowSaveDraftModal(false)}
          onSubmit={handleSaveSubmit}
        />
      )}

      {/* Main content: landing or split workspace */}
      {isWorkspaceOpen ? (
        <DraftSplitWorkspace
          sessionTitle={sessionTitle}
          documentTitle={editorState.selectedDoc?.title || "Draft Agreement"}
          draftUnavailable={draftUnavailable}
          messages={draftChat.messages}
          chatInput={workspaceChatInput}
          onChatInputChange={setWorkspaceChatInput}
          onChatSubmit={handleWorkspaceChatSubmit}
          onFileSelect={(file) => generatorActions.processFile(file)}
          onRemoveFile={handleRemoveAttachedFile}
          attachedFileName={generatorState.uploadFileName || undefined}
          isStreaming={generatorState.isStreaming}
          isParsing={generatorState.isParsingTemplate}
          isDragging={generatorState.isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          editorContent={editorState.editorContent}
          isFullySigned={isFullySigned}
          isSaving={editorState.isSaving}
          savingMsg={editorState.savingMsg}
          showFloatingMenu={showFloatingMenu}
          floatingMenuPos={floatingMenuPos}
          selectedTextRange={selectedTextRange}
          activeDropdown={activeDropdown}
          askAiQuery={askAiQuery}
          tiptapEditorRef={editorState.tiptapEditorRef}
          onEditorChange={(html) => {
            editorState.pushUndoSnapshot(editorState.editorContent);
            editorState.setEditorContent(html);
          }}
          onEditorReady={(editor) => {
            editorState.tiptapEditorRef.current = editor;
          }}
          onSelectionChange={handleEditorSelectionChange}
          onApplyRewrite={generatorActions.handleApplyRewriteResilient}
          onSetActiveDropdown={setActiveDropdown}
          onSetAskAiQuery={setAskAiQuery}
          onSetShowFloatingMenu={setShowFloatingMenu}
          onSetSelectedTextRange={setSelectedTextRange}
          onSealDocument={handleSealDocument}
          onSetEditorContent={editorState.setEditorContent}
          onInsertHtml={editorState.insertHtmlAtCursor}
          onToolbarFormat={editorState.handleToolbarFormat}
          onPushUndoSnapshot={editorState.pushUndoSnapshot}
          onSave={handleSaveClick}
          onExport={handleExport}
          onAskSubmit={handleAskSubmit}
          onBack={handleOpenGenerator}
          onOpenHistory={handleOpenHistory}
        />
      ) : editorState.isGeneratorActive ? (
        <DraftChatLanding
          instructions={generatorState.instructions}
          onSetInstructions={generatorState.setInstructions}
          onSubmit={handleChatSubmit}
          onFileSelect={(file) => generatorActions.processFile(file)}
          onRemoveFile={handleRemoveAttachedFile}
          attachedFileName={uploadedNameShownSeparately}
          vaultDocuments={selectedVaultDocs.map((d) => ({ id: d.id, title: d.title }))}
          onRemoveVaultDocument={handleRemoveVaultDocument}
          onOpenVault={() => setVaultPickerOpen(true)}
          template={selectedTemplate}
          playbook={selectedPlaybook}
          clauses={selectedClauseItems}
          onOpenTemplate={() => setLibraryPicker("template")}
          onOpenPlaybook={() => setLibraryPicker("playbook")}
          onOpenClauses={() => setLibraryPicker("clauses")}
          onClearTemplate={() => {
            generatorState.setSelectedTemplateId(null);
            generatorState.setSelectedTemplateName(null);
          }}
          onClearPlaybook={() => generatorState.setSelectedPlaybookId(null)}
          onRemoveClause={(id) => {
            const nextIds = generatorState.selectedClauseIds.filter((x) => x !== id);
            generatorState.setSelectedClauseIds(nextIds);
            generatorState.setSelectedClauses(
              clauseLibrary.filter((c) => nextIds.includes(c.id)).map((c) => c.name)
            );
          }}
          isStreaming={generatorState.isStreaming}
          isParsing={generatorState.isParsingTemplate}
          draftError={generatorState.draftError}
          isDragging={generatorState.isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          starterPrompts={starterPrompts}
          customPrompts={customPrompts}
          onAddPrompt={addPrompt}
          onRemovePrompt={removePrompt}
          onOpenHistory={handleOpenHistory}
        />
      ) : null}

      {vaultPickerOpen && (
        <VaultPickerSheet
          folders={folders}
          savedDrafts={savedDrafts}
          onToggleFolderSelection={toggleFolderSelection}
          onToggleFolderExpanded={toggleFolderExpanded}
          onToggleFileSelection={toggleFileSelection}
          onToggleDraftSelection={toggleDraftSelection}
          onClose={() => setVaultPickerOpen(false)}
          description="Browse and select a reference document for this draft."
        />
      )}

      {libraryPicker === "template" && (
        <DraftLibraryPicker
          title="Select template"
          description="Choose a boilerplate structure from your vault."
          privateItems={privateTemplates}
          orgItems={orgTemplates}
          selectedIds={generatorState.selectedTemplateId ? [generatorState.selectedTemplateId] : []}
          emptyLabel="No templates in your vault yet."
          onChange={(ids) => {
            const id = ids[0] ?? null;
            const item = templates.find((t) => t.id === id) ?? null;
            generatorState.setSelectedTemplateId(id);
            generatorState.setSelectedTemplateName(item?.name ?? null);
          }}
          onClose={() => setLibraryPicker(null)}
        />
      )}

      {libraryPicker === "playbook" && (
        <DraftLibraryPicker
          title="Select playbook"
          description="Apply company playbook rules from your vault."
          privateItems={privatePlaybooks}
          orgItems={orgPlaybooks}
          selectedIds={generatorState.selectedPlaybookId ? [generatorState.selectedPlaybookId] : []}
          emptyLabel="No playbooks in your vault yet."
          onChange={(ids) => generatorState.setSelectedPlaybookId(ids[0] ?? null)}
          onClose={() => setLibraryPicker(null)}
        />
      )}

      {libraryPicker === "clauses" && (
        <DraftLibraryPicker
          title="Select clauses"
          description="Add standardized clauses to include in this draft."
          privateItems={privateClauses}
          orgItems={orgClauses}
          selectedIds={generatorState.selectedClauseIds}
          multiple
          emptyLabel="No clauses in your vault yet."
          onChange={(ids) => {
            generatorState.setSelectedClauseIds(ids);
            generatorState.setSelectedClauses(
              clauseLibrary.filter((c) => ids.includes(c.id)).map((c) => c.name)
            );
          }}
          onClose={() => setLibraryPicker(null)}
        />
      )}

      {/* History panel — rendered at root level so it works from both landing and workspace */}
      {isHistoryOpen && (
        <DraftHistoryPanel
          history={history}
          loading={historyLoading}
          error={historyError}
          deleteError={deleteError}
          onClearDeleteError={clearDeleteError}
          onClose={handleCloseHistory}
          onSelectEntry={handleLoadHistoryEntry}
          onDeleteEntry={handleDeleteHistoryEntry}
        />
      )}

    </div>
  );
}
