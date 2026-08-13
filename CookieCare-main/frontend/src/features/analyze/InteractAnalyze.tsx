import { useState, useRef } from "react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import SideDrawer from "./components/SideDrawer";
import ReportView from "./components/ReportView";
import { AnalysisComposer } from "./components/AnalysisComposer";
import { VaultPickerSheet } from "./components/VaultPickerSheet";
import { AnalysisStarters } from "./components/AnalysisStarters";
import { useAnalyzeData } from "./hooks/useAnalyzeData";
import { useAnalysis } from "./hooks/useAnalysis";
import { useUpload } from "./hooks/useUpload";
import { getSelectedDocuments, hasSelectedDocuments } from "./documentSelection";
import { ACCEPTED_UPLOAD_ACCEPT_STRING } from "./constants";
import { InteractAnalyzeProps, DocumentMode, AnswerStyle, SidePanelType } from "./types";
import { createAnalyzeFolder } from "./api/analyzeApi";
import { toPromptLibraryId } from "./api/analysisJobs";
import { PREMIUM_CHAT_LANDING_STYLES } from "../../shared/styles/premiumChatLandingStyles";
import { ANALYZE_STYLES } from "./styles/analyzeStyles";

/**
 * Analyze Agreements — Ask Lawyer's document-analysis sibling.
 *
 * Same AI Workspace visual language:
 *   SubtleBackground canvas → large question hero → compact composer →
 *   contextual chips → suggestion chips.
 */
export default function InteractAnalyze({
  authToken,
  onRefresh,
}: InteractAnalyzeProps) {
  const {
    folders,
    savedDrafts,
    promptLibrary,
    questionsLibrary,
    fetchFoldersAndDocs,
    toggleFolderSelection,
    toggleFolderExpanded,
    toggleFileSelection,
    toggleDraftSelection,
    deselectDocument,
    selectFilesByIds,
  } = useAnalyzeData(authToken);

  const analysis = useAnalysis(authToken);
  const upload = useUpload(authToken, folders, fetchFoldersAndDocs, onRefresh);

  const [customPromptText, setCustomPromptText] = useState("");
  const [promptLibraryId, setPromptLibraryId] = useState<string | undefined>();
  const [documentMode, setDocumentMode] = useState<DocumentMode>("unified");
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("narrative");
  const [chatInput, setChatInput] = useState("");
  const [validationMessage, setValidationMessage] = useState("");

  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidePanelType, setSidePanelType] = useState<SidePanelType>("upload");
  const [newFolderName, setNewFolderName] = useState("");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDocuments = getSelectedDocuments(folders, savedDrafts);
  const hasDocuments = hasSelectedDocuments(folders, savedDrafts);
  const hasPrompt = customPromptText.trim().length > 0;
  const canAnalyze = hasDocuments && hasPrompt;

  const handleAddNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const ok = await createAnalyzeFolder(authToken, newFolderName.trim());
      if (ok) {
        await fetchFoldersAndDocs();
        setNewFolderName("");
        setIsSidePanelOpen(false);
      }
    } catch (err) {
      console.error("Failed to create folder", err);
    }
  };

  const handleRunAnalysis = () => {
    if (!hasDocuments) {
      setValidationMessage("Add at least one agreement before analyzing.");
      return;
    }
    if (!hasPrompt) {
      setValidationMessage("Tell RandTrust what you want to know, or pick a suggestion below.");
      return;
    }
    setValidationMessage("");
    analysis.handleStartAnalysis(
      folders,
      savedDrafts,
      customPromptText,
      documentMode,
      answerStyle,
      promptLibraryId
    );
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    analysis.handleSendChatMessage(text, folders, savedDrafts, documentMode, answerStyle);
  };

  const attachUploadedFiles = async (result: {
    fileIds: string[];
    error?: string;
  }) => {
    if (result.fileIds.length > 0) {
      selectFilesByIds(result.fileIds);
    }
    if (result.error) {
      setValidationMessage(result.error);
      if (result.fileIds.length === 0) {
        setSidePanelType("upload");
        setIsSidePanelOpen(true);
      }
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setValidationMessage("");
      const result = await upload.quickUploadFiles(e.target.files);
      await attachUploadedFiles(result);
    }
    e.target.value = "";
  };

  const handleApplyStarter = (text: string, libraryId?: string) => {
    setCustomPromptText(text);
    setPromptLibraryId(toPromptLibraryId(libraryId));
    setValidationMessage("");
  };

  const handleComposerDrop = async (e: React.DragEvent) => {
    setValidationMessage("");
    const result = await upload.quickUploadFromDrop(e);
    await attachUploadedFiles(result);
  };

  if (analysis.viewMode === "report") {
    return (
      <>
        {!!analysis.analysisError && (
          <AiProgressOverlay
            visible
            message={analysis.analysisProgress}
            error={analysis.analysisError}
            label="Analyzing"
            subtitle={analysis.activeReportDocName || "document"}
            onRetry={() => {
              analysis.setAnalysisError("");
              handleRunAnalysis();
            }}
            onDismiss={() => analysis.setAnalysisError("")}
          />
        )}
        <ReportView
          activeReportDocName={analysis.activeReportDocName}
          chatMessages={analysis.chatMessages}
          chatInput={chatInput}
          showCopyToast={analysis.showCopyToast}
          onBack={() => analysis.setViewMode("form")}
          onChatInputChange={setChatInput}
          onSendMessage={handleSendChatMessage}
          onCopy={analysis.handleCopyReport}
          onDownload={analysis.handleDownloadReport}
          onPrint={analysis.handlePrintReport}
          openQuestions={analysis.openQuestions}
          askResolved={analysis.askResolved}
          askDisabled={analysis.isAnalyzing}
          onAskSubmit={analysis.handleResumeAsk}
          isStreaming={analysis.isAnalyzing}
          progressMessage={analysis.analysisProgress}
        />
      </>
    );
  }

  return (
    <>
      <style>{PREMIUM_CHAT_LANDING_STYLES}</style>
      <style>{ANALYZE_STYLES}</style>

      <div className="pcl-page flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {!!analysis.analysisError && analysis.viewMode === "form" && (
          <AiProgressOverlay
            visible
            message={analysis.analysisProgress}
            error={analysis.analysisError}
            label="Analyzing"
            subtitle={analysis.activeReportDocName || "document"}
            onRetry={() => {
              analysis.setAnalysisError("");
              handleRunAnalysis();
            }}
            onDismiss={() => analysis.setAnalysisError("")}
          />
        )}

        <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6">
          <h1 className="pcl-rise-1 pcl-heading text-center">
            What would you like to analyze?
          </h1>

          <div className="pcl-rise-2 w-full mt-8 flex flex-col items-center" style={{ maxWidth: 720 }}>
            <AnalysisComposer
              variant="landing"
              value={customPromptText}
              onChange={(v) => {
                setCustomPromptText(v);
                setPromptLibraryId(undefined);
                if (v.trim()) setValidationMessage("");
              }}
              onAnalyze={handleRunAnalysis}
              onAttachFiles={() => fileInputRef.current?.click()}
              onOpenVault={() => setVaultPickerOpen(true)}
              onOpenPrompts={() => setPromptModalOpen(true)}
              onOpenQuestions={() => setQuestionModalOpen(true)}
              documents={selectedDocuments}
              onRemoveDocument={(doc) =>
                deselectDocument(doc.id, doc.type, doc.folderId)
              }
              documentMode={documentMode}
              answerStyle={answerStyle}
              onSetDocumentMode={setDocumentMode}
              onSetAnswerStyle={setAnswerStyle}
              canAnalyze={canAnalyze}
              isAnalyzing={analysis.isAnalyzing}
              isUploading={upload.isUploading}
              uploadProgress={upload.uploadProgress}
              validationMessage={validationMessage}
              isDragging={upload.isDraggingFile}
              onDragOver={upload.handleDragOver}
              onDragLeave={upload.handleDragLeave}
              onDrop={handleComposerDrop}
            />

            <div className="w-full mt-6">
              <AnalysisStarters
                promptLibrary={promptLibrary}
                questionsLibrary={questionsLibrary}
                onApply={handleApplyStarter}
                promptModalOpen={promptModalOpen}
                questionModalOpen={questionModalOpen}
                onPromptModalOpenChange={setPromptModalOpen}
                onQuestionModalOpenChange={setQuestionModalOpen}
              />
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_UPLOAD_ACCEPT_STRING}
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {vaultPickerOpen && (
          <VaultPickerSheet
            folders={folders}
            savedDrafts={savedDrafts}
            onToggleFolderSelection={toggleFolderSelection}
            onToggleFolderExpanded={toggleFolderExpanded}
            onToggleFileSelection={toggleFileSelection}
            onToggleDraftSelection={toggleDraftSelection}
            onClose={() => setVaultPickerOpen(false)}
          />
        )}

        {isSidePanelOpen && (
          <SideDrawer
            sidePanelType={sidePanelType}
            folders={folders}
            newFolderName={newFolderName}
            uploadSelectedFolder={upload.uploadSelectedFolder}
            isDraggingFile={upload.isDraggingFile}
            isUploading={upload.isUploading}
            pendingFiles={upload.pendingFiles}
            batchError={upload.batchError}
            successMessage={upload.successMessage}
            suggestedFolderName={upload.suggestedFolderName}
            uploadProgress={upload.uploadProgress}
            onClose={() => setIsSidePanelOpen(false)}
            onSetNewFolderName={setNewFolderName}
            onSetUploadSelectedFolder={upload.setUploadSelectedFolder}
            onAddNewFolder={handleAddNewFolder}
            onDragOver={upload.handleDragOver}
            onDragLeave={upload.handleDragLeave}
            onDrop={upload.handleDrop}
            onFileBrowseChange={upload.handleFileBrowseChange}
            onFolderBrowseChange={upload.handleFolderBrowseChange}
            onRemoveFile={upload.removeFile}
            onClearFiles={upload.clearFiles}
            onUploadSubmit={(e) =>
              upload.executeUploadSubmission(e, (uploadedFileIds) => {
                setIsSidePanelOpen(false);
                if (uploadedFileIds && uploadedFileIds.length > 0) {
                  selectFilesByIds(uploadedFileIds);
                } else {
                  setVaultPickerOpen(true);
                }
              })
            }
          />
        )}
      </div>
    </>
  );
}
