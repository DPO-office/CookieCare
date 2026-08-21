import { useState, useRef } from "react";
import { History } from "lucide-react";
import { useAppContext } from "../../contexts/AppContext";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import SideDrawer from "./components/SideDrawer";
import ReportView from "./components/ReportView";
import { AnalysisComposer } from "./components/AnalysisComposer";
import { VaultPickerSheet } from "./components/VaultPickerSheet";
import { AnalysisStarters } from "./components/AnalysisStarters";
import { AnalysisHistoryPanel } from "./components/AnalysisHistoryPanel";
import { useAnalyzeData } from "./hooks/useAnalyzeData";
import { useAnalysis } from "./hooks/useAnalysis";
import { useUpload } from "./hooks/useUpload";
import { useAnalysisHistory } from "./hooks/useAnalysisHistory";
import { getSelectedDocuments, hasSelectedDocuments } from "./documentSelection";
import { ACCEPTED_UPLOAD_ACCEPT_STRING } from "./constants";
import type { DocumentMode, AnswerStyle, AnalysisDepth, SidePanelType } from "./types";
import { createAnalyzeFolder } from "./api/analyzeApi";
import { toPromptLibraryId } from "./api/analysisJobs";
import { PREMIUM_CHAT_LANDING_STYLES } from "../../shared/styles/premiumChatLandingStyles";
import { ANALYZE_STYLES } from "./styles/analyzeStyles";

export default function InteractAnalyze() {
  const { authToken: ctxToken, fetchDocuments } = useAppContext();
  const authToken = ctxToken ?? "";
  const onRefresh = fetchDocuments;

  const {
    folders,
    savedDrafts,
    ephemeralFiles,
    promptLibrary,
    questionsLibrary,
    fetchFoldersAndDocs,
    toggleFolderSelection,
    toggleFolderExpanded,
    toggleFileSelection,
    toggleDraftSelection,
    deselectDocument,
    selectFilesByIds,
    addEphemeralFiles,
    removeEphemeralFile,
  } = useAnalyzeData(authToken);

  const analysis = useAnalysis(authToken);
  const upload = useUpload(authToken, folders, fetchFoldersAndDocs, onRefresh);
  const history = useAnalysisHistory(authToken);

  const [customPromptText, setCustomPromptText] = useState("");
  const [promptLibraryId, setPromptLibraryId] = useState<string | undefined>();
  const [documentMode, setDocumentMode] = useState<DocumentMode>("unified");
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("narrative");
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>("lite");
  const [playbookDocId, setPlaybookDocId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [validationMessage, setValidationMessage] = useState("");

  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidePanelType, setSidePanelType] = useState<SidePanelType>("upload");
  const [newFolderName, setNewFolderName] = useState("");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDocuments = getSelectedDocuments(folders, savedDrafts, ephemeralFiles);
  const hasDocuments = hasSelectedDocuments(folders, savedDrafts, ephemeralFiles);
  const hasPrompt = customPromptText.trim().length > 0;
  const canAnalyze = hasDocuments && hasPrompt;

  const handleOpenHistory = () => {
    setHistoryOpen(true);
    history.fetchHistory();
  };

  const handleSelectHistorySession = async (item: Parameters<typeof history.loadSession>[0]) => {
    const restored = await history.loadSession(item);
    if (!restored) return;
    setHistoryOpen(false);
    analysis.restoreSession(restored.messages, restored.docName);
  };

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
      setVaultPickerOpen(true);
      return;
    }
    if (!hasPrompt) {
      setValidationMessage("Tell LORA what you want to know, or pick a suggestion below.");
      return;
    }
    setValidationMessage("");
    analysis.handleStartAnalysis(
      folders,
      savedDrafts,
      ephemeralFiles,
      customPromptText,
      documentMode,
      answerStyle,
      analysisDepth,
      promptLibraryId,
      playbookDocId
    );
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    analysis.handleSendChatMessage(text, folders, savedDrafts, documentMode, answerStyle, analysisDepth, ephemeralFiles);
  };

  const attachUploadedFiles = (result: { fileIds: string[]; fileTitles: Record<string, string>; error?: string }) => {
    if (result.fileIds.length > 0) {
      addEphemeralFiles(result.fileIds.map((id) => ({ id, title: result.fileTitles[id] || id })));
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
      attachUploadedFiles(result);
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
    attachUploadedFiles(result);
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
          questionsLibrary={questionsLibrary}
          onOpenHistory={handleOpenHistory}
        />
        {historyOpen && (
          <AnalysisHistoryPanel
            history={history.history}
            loading={history.loading}
            loadingSession={history.loadingSession}
            error={history.error}
            onClose={() => setHistoryOpen(false)}
            onSelectSession={handleSelectHistorySession}
          />
        )}
      </>
    );
  }

  return (
    <>
      <style>{PREMIUM_CHAT_LANDING_STYLES}</style>
      <style>{ANALYZE_STYLES}</style>

      <div className="dpa-results-bg analyze-landing flex-1 flex flex-col min-h-0 overflow-hidden relative font-sans">

        {/* History button — top-right of the landing page */}
        <div className="no-print absolute top-4 right-5 z-10">
          <button
            type="button"
            onClick={handleOpenHistory}
            className="analyze-history-btn"
            aria-label="Analysis history"
          >
            <History className="h-[15px] w-[15px]" strokeWidth={1.75} />
            <span>History</span>
          </button>
        </div>

        {(analysis.isAnalyzing || !!analysis.analysisError) && analysis.viewMode === "form" && (
          <AiProgressOverlay
            visible
            message={analysis.analysisProgress}
            error={analysis.analysisError}
            label="Analyzing"
            subtitle={analysis.activeReportDocName || "document"}
            illustration="scan"
            onRetry={
              analysis.analysisError
                ? () => {
                    analysis.setAnalysisError("");
                    handleRunAnalysis();
                  }
                : undefined
            }
            onDismiss={
              analysis.analysisError ? () => analysis.setAnalysisError("") : undefined
            }
          />
        )}

        <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6">
          <p className="pcl-rise-1 mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
            Legal Space · Analyze
          </p>
          <h1 className="pcl-rise-1 pcl-heading text-center">
            What would you like to analyze?
          </h1>
          <p className="pcl-rise-1 mt-2 max-w-lg text-center text-[14px] leading-relaxed text-dark-200">
            Attach an agreement, pick a prompt, or describe the review you want LORA to run.
          </p>

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
              onRemoveDocument={(doc) => {
                if (playbookDocId === doc.id) setPlaybookDocId(null);
                if (doc.type === "ephemeral") {
                  removeEphemeralFile(doc.id);
                } else {
                  deselectDocument(doc.id, doc.type, doc.folderId);
                }
              }}
              playbookDocId={playbookDocId}
              onTogglePlaybook={(doc) =>
                setPlaybookDocId((prev) => (prev === doc.id ? null : doc.id))
              }
              documentMode={documentMode}
              answerStyle={answerStyle}
              analysisDepth={analysisDepth}
              onSetDocumentMode={setDocumentMode}
              onSetAnswerStyle={setAnswerStyle}
              onSetAnalysisDepth={setAnalysisDepth}
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

        {historyOpen && (
          <AnalysisHistoryPanel
            history={history.history}
            loading={history.loading}
            loadingSession={history.loadingSession}
            error={history.error}
            onClose={() => setHistoryOpen(false)}
            onSelectSession={handleSelectHistorySession}
          />
        )}
      </div>
    </>
  );
}
