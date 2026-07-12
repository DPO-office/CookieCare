import React, { useState } from "react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import DocumentSelector from "./components/DocumentSelector";
import PromptPanel from "./components/PromptPanel";
import AnalysisOptions from "./components/AnalysisOptions";
import ReportView from "./components/ReportView";
import SideDrawer from "./components/SideDrawer";
import { useAnalyzeData } from "./hooks/useAnalyzeData";
import { useAnalysis } from "./hooks/useAnalysis";
import { useUpload } from "./hooks/useUpload";
import { InteractAnalyzeProps, DocumentMode, AnswerStyle, PromptTab, SidePanelType } from "./types";
import { DEFAULT_PROMPT } from "./constants";

export default function InteractAnalyze({
  documents,
  activeDocument,
  authToken,
  onRefresh,
  onSelectDocument,
}: InteractAnalyzeProps) {

  // --- Data & selection ---
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
  } = useAnalyzeData(authToken);

  // --- Analysis state & actions ---
  const analysis = useAnalysis(authToken);

  // --- Upload ---
  const upload = useUpload(authToken, folders, fetchFoldersAndDocs, onRefresh);

  // --- Local UI state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [savedDraftsExpanded, setSavedDraftsExpanded] = useState(true);
  const [promptTab, setPromptTab] = useState<PromptTab>("write");
  const [customPromptText, setCustomPromptText] = useState(DEFAULT_PROMPT);
  const [documentMode, setDocumentMode] = useState<DocumentMode>("unified");
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("narrative");
  const [chatInput, setChatInput] = useState("");

  // --- Side drawer ---
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidePanelType, setSidePanelType] = useState<SidePanelType>("folder");
  const [newFolderName, setNewFolderName] = useState("");

  const openSideDrawer = (type: SidePanelType) => {
    setSidePanelType(type);
    setIsSidePanelOpen(true);
  };

  const handleAddNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(`/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (res.ok) {
        await fetchFoldersAndDocs();
        setNewFolderName("");
        setIsSidePanelOpen(false);
      }
    } catch (err) {
      console.error("Failed to create folder", err);
    }
  };

  const handleRunAnalysis = () =>
    analysis.handleStartAnalysis(folders, savedDrafts, customPromptText, documentMode, answerStyle);

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    analysis.handleSendChatMessage(text, folders, savedDrafts, documentMode, answerStyle);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-[calc(100vh-0px)] relative overflow-hidden bg-gray-50 text-gray-900">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {(analysis.isAnalyzing || !!analysis.analysisError) && (
        <AiProgressOverlay
          visible={analysis.isAnalyzing || !!analysis.analysisError}
          message={analysis.analysisProgress}
          error={analysis.analysisError}
          label={`Analyzing ${analysis.activeReportDocName || "document"}...`}
          onRetry={analysis.analysisError ? () => { analysis.setAnalysisError(""); handleRunAnalysis(); } : undefined}
          onDismiss={analysis.analysisError ? () => analysis.setAnalysisError("") : undefined}
        />
      )}

      {analysis.viewMode === "form" ? (
        <div className="flex-1 overflow-y-auto px-8 py-7 w-full bg-[#F7F8FA]">
          <div className="mb-8 pb-5 border-b border-gray-100">
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Analyze agreements</h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed max-w-lg">
              Run AI-powered compliance audits, risk assessments, and custom legal queries across your document vaults.
            </p>
          </div>

          <div className="space-y-5">
            <DocumentSelector
              folders={folders}
              savedDrafts={savedDrafts}
              searchQuery={searchQuery}
              savedDraftsExpanded={savedDraftsExpanded}
              onSearchChange={setSearchQuery}
              onToggleSavedDraftsExpanded={() => setSavedDraftsExpanded((v) => !v)}
              onToggleFolderSelection={toggleFolderSelection}
              onToggleFolderExpanded={toggleFolderExpanded}
              onToggleFileSelection={toggleFileSelection}
              onToggleDraftSelection={toggleDraftSelection}
              onOpenUpload={() => openSideDrawer("upload")}
              onOpenNewFolder={() => openSideDrawer("folder")}
            />

            <PromptPanel
              promptTab={promptTab}
              customPromptText={customPromptText}
              promptLibrary={promptLibrary}
              questionsLibrary={questionsLibrary}
              onSetPromptTab={setPromptTab}
              onSetCustomPromptText={setCustomPromptText}
            />

            <AnalysisOptions
              documentMode={documentMode}
              answerStyle={answerStyle}
              onSetDocumentMode={setDocumentMode}
              onSetAnswerStyle={setAnswerStyle}
              onRunAnalysis={handleRunAnalysis}
            />
          </div>
        </div>
      ) : (
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
          uploadedFileName={upload.uploadedFileName}
          onClose={() => setIsSidePanelOpen(false)}
          onSetNewFolderName={setNewFolderName}
          onSetUploadSelectedFolder={upload.setUploadSelectedFolder}
          onAddNewFolder={handleAddNewFolder}
          onDragOver={upload.handleDragOver}
          onDragLeave={upload.handleDragLeave}
          onDrop={upload.handleDrop}
          onFileBrowseChange={upload.handleFileBrowseChange}
          onUploadSubmit={(e) => upload.executeUploadSubmission(e, () => setIsSidePanelOpen(false))}
        />
      )}
    </div>
  );
}
