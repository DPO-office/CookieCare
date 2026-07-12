import React, { useState } from "react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import EditorHeader from "./components/EditorHeader";
import EditorToolbar from "./components/EditorToolbar";
import EditorCanvas from "./components/EditorCanvas";
import GeneratorPanel from "./components/GeneratorPanel";
import CreateDocModal from "./components/CreateDocModal";
import SaveDraftModal from "./components/SaveDraftModal";
import { useDraftEditorState } from "./hooks/useDraftEditorState";
import { useDraftGeneratorState } from "./hooks/useDraftGeneratorState";
import { useDraftApiActions } from "./hooks/useDraftApiActions";
import { useDraftGeneratorActions } from "./hooks/useDraftGeneratorActions";
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
  const [showAskAiInput, setShowAskAiInput] = useState(false);
  const [isAiRefiningText, setIsAiRefiningText] = useState(false);

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
    pushUndoSnapshot: editorState.pushUndoSnapshot,
    setEditorContent: editorState.setEditorContent,
    setSelectedDoc: editorState.setSelectedDoc,
    setIsGeneratorActive: editorState.setIsGeneratorActive,
    setIsStreaming: generatorState.setIsStreaming,
    setStreamingProgress: generatorState.setStreamingProgress,
    setDraftError: generatorState.setDraftError,
    setUploadText: generatorState.setUploadText,
    setUploadFileName: generatorState.setUploadFileName,
    setIsParsingTemplate: generatorState.setIsParsingTemplate,
    setAdvancedFields: generatorState.setAdvancedFields,
    setAdvancedFieldValues: generatorState.setAdvancedFieldValues,
    selectedTextRange,
    setSelectedTextRange,
    setShowFloatingMenu,
    setIsAiRefiningText,
    setActiveDropdown,
    setShowAskAiInput,
    setAskAiQuery,
    tiptapEditorRef: editorState.tiptapEditorRef,
  });

  // --- Event handlers ---
  const handleSelectDoc = (doc: any) => {
    editorState.setSelectedDoc(doc);
    editorState.setIsGeneratorActive(false);
    onSelectDocument(doc);
  };

  const handleOpenGenerator = () => {
    editorState.setSelectedDoc(null);
    editorState.setIsGeneratorActive(true);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      generatorActions.processFile(file);
    }
  };

  const handleExecuteDraftStream = () => {
    generatorActions.handleExecuteDraftStream({
      mode: generatorState.mode,
      depth: generatorState.depth,
      instructions: generatorState.instructions,
      basicPartyA: generatorState.basicPartyA,
      basicPartyB: generatorState.basicPartyB,
      basicLaw: generatorState.basicLaw,
      basicLiability: generatorState.basicLiability,
      advancedStep: generatorState.advancedStep,
      selectedTemplateName: generatorState.selectedTemplateName,
      aiRulebookPrompt: generatorState.aiRulebookPrompt,
      referenceInstructions: generatorState.referenceInstructions,
      uploadFileName: generatorState.uploadFileName,
      uploadText: generatorState.uploadText,
      advancedFieldValues: generatorState.advancedFieldValues,
    });
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
      setShowAskAiInput(false);
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

  return (
    <div className="flex-1 overflow-hidden flex h-screen font-sans bg-[#FAFBFD]">
      
      {/* SSE draft progress overlay */}
      {(generatorState.isStreaming || !!generatorState.draftError) && (
        <AiProgressOverlay
          visible={generatorState.isStreaming || !!generatorState.draftError}
          message={generatorState.streamingProgress}
          error={generatorState.draftError}
          label="Generating Draft..."
          onRetry={generatorState.draftError ? () => { generatorState.setDraftError(""); handleExecuteDraftStream(); } : undefined}
          onDismiss={generatorState.draftError ? () => generatorState.setDraftError("") : undefined}
        />
      )}

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

      {/* Main content: Generator or Editor */}
      {editorState.isGeneratorActive ? (
        <GeneratorPanel
          documents={documents}
          selectedDoc={editorState.selectedDoc}
          authToken={authToken}
          mode={generatorState.mode}
          depth={generatorState.depth}
          instructions={generatorState.instructions}
          playbookGuidelines={generatorState.playbookGuidelines}
          customClauseText={generatorState.customClauseText}
          basicPartyA={generatorState.basicPartyA}
          basicPartyB={generatorState.basicPartyB}
          basicLaw={generatorState.basicLaw}
          basicLiability={generatorState.basicLiability}
          advancedStep={generatorState.advancedStep}
          clauseTab={generatorState.clauseTab}
          s1Open={generatorState.s1Open}
          s2Open={generatorState.s2Open}
          s3Open={generatorState.s3Open}
          s4Open={generatorState.s4Open}
          expandedFolder={generatorState.expandedFolder}
          expandedClauseCat={generatorState.expandedClauseCat}
          searchTemplateQuery={generatorState.searchTemplateQuery}
          searchClauseQuery={generatorState.searchClauseQuery}
          selectedTemplateName={generatorState.selectedTemplateName}
          selectedClauses={generatorState.selectedClauses}
          referenceInstructions={generatorState.referenceInstructions}
          aiRulebookPrompt={generatorState.aiRulebookPrompt}
          templateFolders={generatorState.templateFolders}
          clauseCategories={generatorState.clauseCategories}
          isDragging={generatorState.isDragging}
          uploadText={generatorState.uploadText}
          uploadFileName={generatorState.uploadFileName}
          isParsingTemplate={generatorState.isParsingTemplate}
          advancedFields={generatorState.advancedFields}
          advancedFieldValues={generatorState.advancedFieldValues}
          isStreaming={generatorState.isStreaming}
          streamingProgress={generatorState.streamingProgress}
          draftError={generatorState.draftError}
          onSetMode={generatorState.setMode}
          onSetDepth={generatorState.setDepth}
          onSetInstructions={generatorState.setInstructions}
          onSetPlaybookGuidelines={generatorState.setPlaybookGuidelines}
          onSetCustomClauseText={generatorState.setCustomClauseText}
          onSetBasicPartyA={generatorState.setBasicPartyA}
          onSetBasicPartyB={generatorState.setBasicPartyB}
          onSetBasicLaw={generatorState.setBasicLaw}
          onSetBasicLiability={generatorState.setBasicLiability}
          onSetAdvancedStep={generatorState.setAdvancedStep}
          onSetClauseTab={generatorState.setClauseTab}
          onSetS1Open={generatorState.setS1Open}
          onSetS2Open={generatorState.setS2Open}
          onSetS3Open={generatorState.setS3Open}
          onSetS4Open={generatorState.setS4Open}
          onSetExpandedFolder={generatorState.setExpandedFolder}
          onSetExpandedClauseCat={generatorState.setExpandedClauseCat}
          onSetSearchTemplateQuery={generatorState.setSearchTemplateQuery}
          onSetSearchClauseQuery={generatorState.setSearchClauseQuery}
          onSetSelectedTemplateName={generatorState.setSelectedTemplateName}
          onSetSelectedClauses={generatorState.setSelectedClauses}
          onSetReferenceInstructions={generatorState.setReferenceInstructions}
          onSetAiRulebookPrompt={generatorState.setAiRulebookPrompt}
          onSetTemplateFolders={generatorState.setTemplateFolders}
          onSetClauseCategories={generatorState.setClauseCategories}
          onSetIsDragging={generatorState.setIsDragging}
          onSetUploadText={generatorState.setUploadText}
          onSetUploadFileName={generatorState.setUploadFileName}
          onSetIsParsingTemplate={generatorState.setIsParsingTemplate}
          onSetAdvancedFields={generatorState.setAdvancedFields}
          onSetAdvancedFieldValues={generatorState.setAdvancedFieldValues}
          onHandleDragOver={handleDragOver}
          onHandleDragLeave={handleDragLeave}
          onHandleDrop={handleDrop}
          onHandleFileChange={handleFileChange}
          onExecuteDraftStream={handleExecuteDraftStream}
          onSelectDoc={handleSelectDoc}
        />
      ) : (
        editorState.selectedDoc && (
          <div className="flex-1 bg-[#F2F4F7] flex flex-col overflow-hidden relative draft-editor-workspace">
            
            <EditorHeader
              selectedDoc={editorState.selectedDoc}
              documents={documents}
              isSaving={editorState.isSaving}
              savingMsg={editorState.savingMsg}
              isFullySigned={isFullySigned}
              onBack={handleOpenGenerator}
              onSelectDoc={handleSelectDoc}
              onCopyToClipboard={handleCopyToClipboard}
              onExport={handleExport}
              onPrint={handlePrint}
              onSaveClick={handleSaveClick}
              onDelete={handleDeleteDraft}
              onAiGenerate={handleOpenGenerator}
            />

            <EditorToolbar
              tiptapEditor={editorState.tiptapEditorRef.current}
              editorContent={editorState.editorContent}
              onUndo={editorState.handleUndo}
              onRedo={editorState.handleRedo}
              onSetEditorContent={editorState.setEditorContent}
              onInsertHtml={editorState.insertHtmlAtCursor}
              onToolbarFormat={editorState.handleToolbarFormat}
              onPushUndoSnapshot={editorState.pushUndoSnapshot}
              onCopy={handleCopyToClipboard}
              onExport={handleExport}
              onPrint={handlePrint}
              onSave={handleSaveClick}
              isSaving={editorState.isSaving}
              isFullySigned={isFullySigned}
            />

            <EditorCanvas
              editorContent={editorState.editorContent}
              isFullySigned={isFullySigned}
              isAiRefiningText={isAiRefiningText}
              showFloatingMenu={showFloatingMenu}
              floatingMenuPos={floatingMenuPos}
              selectedTextRange={selectedTextRange}
              activeDropdown={activeDropdown}
              showAskAiInput={showAskAiInput}
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
              onSetShowAskAiInput={setShowAskAiInput}
              onSetAskAiQuery={setAskAiQuery}
              onSetShowFloatingMenu={setShowFloatingMenu}
              onSetSelectedTextRange={setSelectedTextRange}
              onSealDocument={handleSealDocument}
              onSetEditorContent={editorState.setEditorContent}
            />

          </div>
        )
      )}

    </div>
  );
}
