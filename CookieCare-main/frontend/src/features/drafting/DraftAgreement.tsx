import React, { useState, useEffect, useRef, useMemo } from "react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import DraftChatLanding from "./components/DraftChatLanding";
import DraftSplitWorkspace from "./components/DraftSplitWorkspace";
import CreateDocModal from "./components/CreateDocModal";
import SaveDraftModal from "./components/SaveDraftModal";
import { DraftLibraryPicker } from "./components/DraftLibraryPicker";
import { VaultPickerSheet } from "../analyze/components/VaultPickerSheet";
import { useDraftEditorState } from "./hooks/useDraftEditorState";
import { useDraftGeneratorState } from "./hooks/useDraftGeneratorState";
import { useDraftApiActions } from "./hooks/useDraftApiActions";
import { useDraftGeneratorActions } from "./hooks/useDraftGeneratorActions";
import { useDraftChat } from "./hooks/useDraftChat";
import { useDraftLibrary } from "./hooks/useDraftLibrary";
import { useDraftPromptLibrary } from "./hooks/useDraftPromptLibrary";
import { useAnalyzeData } from "../analyze/hooks/useAnalyzeData";
import { getSelectedDocuments } from "../analyze/documentSelection";
import { composeDraftContext } from "./utils/composeDraftContext";
import { DraftAgreementProps } from "./types";
import type { RichTextSelectionSnapshot } from "../../shared/components/RichTextEditor";
export default function DraftAgreement({
  documents,
  authToken,
  onRefresh,
  onSelectDocument,
  initialDocumentId
}: DraftAgreementProps) {
  
  // --- State management hooks ---
  const editorState = useDraftEditorState(documents, initialDocumentId);
  const generatorState = useDraftGeneratorState();
  const draftChat = useDraftChat();

  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(!!initialDocumentId);
  const [workspaceChatInput, setWorkspaceChatInput] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Draft session");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [libraryPicker, setLibraryPicker] = useState<"template" | "playbook" | "clauses" | null>(null);

  const { templates, clauses: clauseLibrary, playbooks } = useDraftLibrary(authToken);
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
  });

  // --- Event handlers ---
  const handleSelectDoc = (doc: any) => {
    editorState.setSelectedDoc(doc);
    editorState.setIsGeneratorActive(false);
    setIsWorkspaceOpen(true);
    setSessionTitle(doc.title);
    onSelectDocument(doc);
  };

  const handleOpenGenerator = () => {
    editorState.setSelectedDoc(null);
    editorState.setIsGeneratorActive(true);
    setIsWorkspaceOpen(false);
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

    const mode = hasSource ? "Advanced" : "Basic";
    const advancedStep = hasSource ? "reactive" : generatorState.advancedStep;
    generatorState.setMode(mode);
    if (hasSource) generatorState.setAdvancedStep("reactive");

    handleExecuteDraftStream({ mode, advancedStep, sourceDocumentId });
  };

  const handleWorkspaceChatSubmit = () => {
    const text = workspaceChatInput.trim();
    if (!text) return;
    draftChat.addUserMessage(text);
    draftChat.addAssistantMessage("Got it — I'll use that to refine your draft.");
    setWorkspaceChatInput("");
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

  const completionNotifiedRef = useRef(false);

  useEffect(() => {
    if (initialDocumentId && editorState.selectedDoc) {
      setIsWorkspaceOpen(true);
      setSessionTitle(editorState.selectedDoc.title);
    }
  }, [initialDocumentId, editorState.selectedDoc]);

  useEffect(() => {
    if (generatorState.streamingProgress) {
      draftChat.updateProgressMessage(generatorState.streamingProgress);
    }
  }, [generatorState.streamingProgress]);

  useEffect(() => {
    if (generatorState.isStreaming) {
      completionNotifiedRef.current = false;
    }
  }, [generatorState.isStreaming]);

  useEffect(() => {
    if (
      !generatorState.isStreaming &&
      isWorkspaceOpen &&
      editorState.editorContent &&
      editorState.editorContent !== "<p></p>" &&
      !completionNotifiedRef.current
    ) {
      completionNotifiedRef.current = true;
      draftChat.addAssistantMessage(
        "Your draft is ready in the editor. You can edit it directly or ask follow-up questions here."
      );
    }
  }, [generatorState.isStreaming, isWorkspaceOpen, editorState.editorContent]);

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
          items={templates}
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
          items={playbooks}
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
          items={clauseLibrary}
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

    </div>
  );
}
