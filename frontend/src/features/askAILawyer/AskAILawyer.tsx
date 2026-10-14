import React from "react";
import { BookOpen, Scale, RotateCcw, Paperclip, X, Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import type { AskAILawyerProps } from "./types";
import { useAskAILawyer } from "./hooks/useAskAILawyer";
import { useAppContext } from "../../contexts/AppContext";
import ComposerBar from "./components/ComposerBar";
import SourcesPanel from "./components/SourcesPanel";
import CitationModal from "./components/CitationModal";
import { QUICK_PROMPTS } from "./constants";
import { AIResponseBlock } from "../../shared/components/chat";
import { PREMIUM_CHAT_LANDING_STYLES } from "../../shared/styles/premiumChatLandingStyles";
import { ASK_LAWYER_STYLES } from "./styles/askLawyerStyles";

/** Pill shown below the composer for each uploaded file */
function FilePill({
  name,
  indexing,
  onRemove,
}: {
  name: string;
  indexing?: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E7EC] bg-white py-1 pl-2.5 pr-1 text-[11px] font-medium text-[#344054] shadow-sm">
      {indexing ? (
        <Loader2 className="h-3 w-3 animate-spin text-[#4F5BD9] shrink-0" />
      ) : (
        <Paperclip className="h-3 w-3 text-[#4F5BD9] shrink-0" />
      )}
      <span className="max-w-[180px] truncate">{name}</span>
      {!indexing && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#98A2B3] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
        >
          <X className="h-2.5 w-2.5" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

function QuickChip({ label, icon: Icon, onClick }: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="ask-lawyer-chip outline-none">
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  );
}

/** @deprecated props now read from AppContext */
export default function AskAILawyer(_props: Partial<AskAILawyerProps> = {}) {
  const { authToken: ctxToken } = useAppContext();
  const authToken = ctxToken ?? "";
  const {
    searchQuery, setSearchQuery,
    selectedFormat, setSelectedFormat,
    selectedJurisdictions, setSelectedJurisdictions,
    webDiscoveryUrlInput, setWebDiscoveryUrlInput,
    webDiscoveryUrls,
    availableJurisdictions,
    folders,
    newFolderName, setNewFolderName,
    activeFolderForUpload, setActiveFolderForUpload,
    streamedResult,
    messages,
    matchedSources,
    isStreaming,
    stepperPhase,
    stepperMessage,
    activeCitationModal, setActiveCitationModal,
    lawyerProgress,
    lawyerError, setLawyerError,
    isCopied,
    openPopover, setOpenPopover,
    showSources, setShowSources,
    hasResult,
    submittedQuery,
    chatBottomRef, textareaRef, composerRef, popoverRef, fileUploadRef,
    autoResizeTextarea,
    toggleJurisdiction,
    handleAddFolder,
    toggleFolderSelection,
    handleDeleteFolder,
    handleFileUpload,
    handleAddWebUrl,
    removeWebUrl,
    handleQueryDispatch,
    handleKeyDown,
    handleCopyMarkdown,
    applyQuickPrompt,
    resetConversation,
    togglePopover,
    selectedKBCount,
    selectedFolderCount,
    uploadedFiles,
    removeUploadedFile,
  } = useAskAILawyer(authToken);

  const composerProps = {
    searchQuery, setSearchQuery, autoResizeTextarea,
    handleQueryDispatch, handleKeyDown, isStreaming,
    selectedJurisdictions, toggleJurisdiction, selectedKBCount,
    selectedFolderCount, webDiscoveryUrls, selectedFormat,
    openPopover, togglePopover, setOpenPopover,
    composerRef, popoverRef, textareaRef, fileUploadRef,
    availableJurisdictions, setSelectedJurisdictions, setSelectedFormat,
    folders, newFolderName, setNewFolderName, handleAddFolder,
    toggleFolderSelection, handleDeleteFolder, setActiveFolderForUpload,
    webDiscoveryUrlInput, setWebDiscoveryUrlInput, handleAddWebUrl, removeWebUrl,
  };


  const handleReset = () => {
    resetConversation();
  };

  return (
    <>
      <style>{PREMIUM_CHAT_LANDING_STYLES}</style>
      <style>{ASK_LAWYER_STYLES}</style>

      <div className="dpa-results-bg ask-lawyer-landing pcl-page flex-1 min-h-0 overflow-hidden flex relative font-sans">
        {!!lawyerError && (
          <AiProgressOverlay
            visible={!!lawyerError}
            error={lawyerError}
            label="Consulting AI Lawyer"
            onRetry={() => setLawyerError("")}
            onDismiss={() => setLawyerError("")}
          />
        )}

        <AnimatePresence mode="wait" initial={false}>

          {/* ════════════════════════════════════════════════
              LANDING STATE
              Mirrors LORA AI landing exactly:
                large hero heading (clamp) → subtitle →
                composer → chip-style quick prompts
          ════════════════════════════════════════════════ */}
          {!hasResult && !isStreaming && (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
            >
              <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-4 sm:px-6 py-6 sm:py-8 my-auto">
                <p className="pcl-rise-1 mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                  Legal Space · Research
                </p>
                <h1 className="pcl-rise-1 pcl-heading text-center">
                  What would you like to research?
                </h1>
                <p className="pcl-rise-1 mt-2 max-w-lg text-center text-[14px] leading-relaxed text-[#667085]">
                  Ask a legal question across jurisdictions, or ground the answer in your vault and web sources.
                </p>

                <div className="pcl-rise-2 w-full mt-8" style={{ maxWidth: 720 }}>
                  <ComposerBar {...composerProps} variant="landing" />
                  {(stepperPhase === "extracting" || uploadedFiles.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {stepperPhase === "extracting" && stepperMessage && (
                        <FilePill
                          name={stepperMessage.replace("Indexing ", "").replace("…", "")}
                          indexing
                          onRemove={() => {}}
                        />
                      )}
                      {uploadedFiles.map((f) => (
                        <FilePill key={f.id} name={f.name} onRemove={() => removeUploadedFile(f.id)} />
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className="pcl-rise-2 flex flex-wrap items-center justify-center gap-2 mt-6"
                  style={{ maxWidth: 640 }}
                >
                  {QUICK_PROMPTS.map((qp) => (
                    <QuickChip
                      key={qp.label}
                      label={qp.label}
                      icon={qp.icon}
                      onClick={() => applyQuickPrompt(qp.prompt)}
                    />
                  ))}
                </div>
              </div>

            </motion.div>
          )}

          {/* ════════════════════════════════════════════════
              CHAT STATE
              Mirrors LORA AI chat exactly:
                white session bar → scrollable messages →
                white pinned composer footer
          ════════════════════════════════════════════════ */}
          {(hasResult || isStreaming) && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 flex-1 overflow-hidden"
              style={{ zIndex: 2, position: "relative" }}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

                <header className="flex shrink-0 items-center justify-center px-3 sm:px-6 pt-3 sm:pt-4 pb-2">
                  <div className="ask-lawyer-session flex h-11 w-full max-w-[768px] items-center justify-between gap-3 px-2 pl-3 pr-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                        <Scale className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </div>
                      <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                        AI Lawyer
                      </p>
                      {matchedSources.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowSources((s) => !s)}
                          aria-pressed={showSources}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full border-none px-2 py-0.5 text-[11px] font-medium transition-colors"
                          style={{
                            color: showSources ? "#FFFFFF" : "#4F5BD9",
                            background: showSources ? "#111827" : "#EEF2FF",
                          }}
                        >
                          <BookOpen className="h-3 w-3" />
                          {matchedSources.length}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-3 text-[12px] font-medium text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                      aria-label="New conversation"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>New chat</span>
                    </button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-6 pb-4 pt-4 sm:pt-6">
                  <div className="mx-auto space-y-7" style={{ maxWidth: 768 }}>

                    {/* Render full conversation history */}
                    {messages.map((msg, idx) =>
                      msg.role === "user" ? (
                        <div key={idx} className="flex justify-end">
                          <div className="ask-lawyer-user-bubble max-w-[min(80%,36rem)] whitespace-pre-wrap px-4 py-2.5">
                            {msg.text}
                          </div>
                        </div>
                      ) : (
                        <AIResponseBlock
                          key={idx}
                          htmlContent={markdownToHtml(msg.text)}
                          isStreaming={false}
                          statusMessage=""
                          label="AI Lawyer"
                          subLabel={undefined}
                          isCopied={false}
                          onCopy={() => navigator.clipboard.writeText(msg.text)}
                        />
                      )
                    )}

                    {/* Current in-flight turn — only show the assistant loading state,
                        the user bubble is already in the messages array */}
                    {isStreaming && (
                      <AIResponseBlock
                        htmlContent=""
                        isStreaming={true}
                        statusMessage={lawyerProgress || "Thinking…"}
                        label="AI Lawyer"
                        subLabel={undefined}
                        isCopied={false}
                        onCopy={() => {}}
                      />
                    )}

                    <div ref={chatBottomRef} aria-hidden="true" />
                  </div>
                </div>

                <div className="ask-lawyer-composer-fade shrink-0 px-3 sm:px-6 pb-4 sm:pb-5 pt-4 sm:pt-8">
                  <div className="mx-auto" style={{ maxWidth: 768 }}>
                    {(stepperPhase === "extracting" || uploadedFiles.length > 0) && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {stepperPhase === "extracting" && stepperMessage && (
                          <FilePill
                            name={stepperMessage.replace("Indexing ", "").replace("…", "")}
                            indexing
                            onRemove={() => {}}
                          />
                        )}
                        {uploadedFiles.map((f) => (
                          <FilePill key={f.id} name={f.name} onRemove={() => removeUploadedFile(f.id)} />
                        ))}
                      </div>
                    )}
                    <ComposerBar {...composerProps} variant="chat" />
                  </div>
                </div>
              </div>

              {/* Sources side panel */}
              <SourcesPanel
                visible={hasResult && showSources}
                sources={matchedSources}
                onClose={() => setShowSources(false)}
                onSourceClick={setActiveCitationModal}
              />
            </motion.div>
          )}

        </AnimatePresence>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileUploadRef}
          className="hidden"
          aria-hidden="true"
          accept=".pdf,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg"
          onChange={handleFileUpload}
        />

        <CitationModal
          source={activeCitationModal}
          onClose={() => setActiveCitationModal(null)}
        />
      </div>
    </>
  );
}
