import React, { useState, useEffect, useRef } from "react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import DraftChatLanding from "./components/DraftChatLanding";
import DraftSplitWorkspace from "./components/DraftSplitWorkspace";
import CreateDocModal from "./components/CreateDocModal";
import SaveDraftModal from "./components/SaveDraftModal";
import { useDraftEditorState } from "./hooks/useDraftEditorState";
import { useDraftGeneratorState } from "./hooks/useDraftGeneratorState";
import { useDraftApiActions } from "./hooks/useDraftApiActions";
import { useDraftGeneratorActions } from "./hooks/useDraftGeneratorActions";
import { useDraftChat } from "./hooks/useDraftChat";
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

  const handleExecuteDraftStream = () => {
    generatorActions.handleExecuteDraftStream({
      mode: generatorState.mode,
      depth: generatorState.depth,
      instructions: generatorState.instructions,
      playbookGuidelines: generatorState.playbookGuidelines,
      advancedStep: generatorState.advancedStep,
      selectedTemplateName: generatorState.selectedTemplateName,
      aiRulebookPrompt: generatorState.aiRulebookPrompt,
      referenceInstructions: generatorState.referenceInstructions,
      uploadFileName: generatorState.uploadFileName,
      uploadText: generatorState.uploadText,
      sourceDocumentId: generatorState.sourceDocumentId,
    });
  };

  const handleChatSubmit = () => {
    if (!generatorState.instructions.trim() && !generatorState.sourceDocumentId) {
      generatorState.setDraftError("Describe what you want to draft, or attach a reference document.");
      return;
    }
    generatorState.setDraftError("");

    const prompt = generatorState.instructions.trim() || `Draft from: ${generatorState.uploadFileName}`;
    setSessionTitle(prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt);
    draftChat.addUserMessage(prompt);
    draftChat.updateProgressMessage("Starting draft generation…");
    setIsWorkspaceOpen(true);
    editorState.setIsGeneratorActive(false);

    handleExecuteDraftStream();
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
        />
      ) : editorState.isGeneratorActive ? (
        <DraftChatLanding
          instructions={generatorState.instructions}
          onSetInstructions={generatorState.setInstructions}
          onSubmit={handleChatSubmit}
          onFileSelect={(file) => generatorActions.processFile(file)}
          onRemoveFile={handleRemoveAttachedFile}
          attachedFileName={generatorState.uploadFileName || undefined}
          isStreaming={generatorState.isStreaming}
          isParsing={generatorState.isParsingTemplate}
          draftError={generatorState.draftError}
          isDragging={generatorState.isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      ) : null}

    </div>
  );
}
