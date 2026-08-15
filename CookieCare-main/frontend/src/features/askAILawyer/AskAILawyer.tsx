/**
 * AskAILawyer — Enterprise AI Legal Workspace
 *
 * Visual language matches LORA AI exactly:
 *   – #F7F8FA base with SubtleBackground ambient layers
 *   – Same PAGE_STYLES (animations, typography, scrollbar, response prose)
 *   – Landing: large hero heading + composer + chip-style quick prompts
 *   – Chat: white session bar + scrollable messages + white pinned composer footer
 */
import React from "react";
import { BookOpen, Scale, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import { AskAILawyerProps } from "./types";
import { useAskAILawyer } from "./hooks/useAskAILawyer";
import ComposerBar from "./components/ComposerBar";
import SourcesPanel from "./components/SourcesPanel";
import CitationModal from "./components/CitationModal";
import { QUICK_PROMPTS } from "./constants";
import { AIResponseBlock } from "../../shared/components/chat";
import { PREMIUM_CHAT_LANDING_STYLES } from "../../shared/styles/premiumChatLandingStyles";
import { ASK_LAWYER_STYLES } from "./styles/askLawyerStyles";

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

export default function AskAILawyer({
  authToken,
  documents: _propDocs = [],
}: AskAILawyerProps) {
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
    matchedSources,
    isStreaming,
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

  const jurisdictionSubLabel =
    selectedJurisdictions.length > 0
      ? `${selectedJurisdictions.slice(0, 2).join(", ")}${selectedJurisdictions.length > 2 ? ` +${selectedJurisdictions.length - 2}` : ""}`
      : undefined;

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
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6">
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

                <header className="flex shrink-0 items-center justify-center px-6 pt-4 pb-2">
                  <div className="ask-lawyer-session flex h-11 w-full max-w-[768px] items-center justify-between gap-3 px-2 pl-3 pr-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                        <Scale className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </div>
                      <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                        AI Lawyer
                      </p>
                      {selectedJurisdictions.length > 0 && (
                        <span className="hidden max-w-[180px] truncate text-[11px] text-[#98A2B3] sm:inline">
                          {selectedJurisdictions.length === 1
                            ? selectedJurisdictions[0]
                            : `${selectedJurisdictions.length} jurisdictions`}
                        </span>
                      )}
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

                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
                  <div className="mx-auto space-y-7" style={{ maxWidth: 768 }}>
                    {submittedQuery && (
                      <div className="flex justify-end">
                        <div className="ask-lawyer-user-bubble max-w-[min(80%,36rem)] whitespace-pre-wrap px-4 py-2.5">
                          {submittedQuery}
                        </div>
                      </div>
                    )}

                    <AIResponseBlock
                      htmlContent={markdownToHtml(streamedResult)}
                      isStreaming={isStreaming}
                      statusMessage={lawyerProgress || "Researching across jurisdictions…"}
                      label="AI Lawyer"
                      subLabel={jurisdictionSubLabel}
                      isCopied={isCopied}
                      onCopy={handleCopyMarkdown}
                    />

                    <div ref={chatBottomRef} aria-hidden="true" />
                  </div>
                </div>

                <div className="ask-lawyer-composer-fade shrink-0 px-6 pb-5 pt-8">
                  <div className="mx-auto" style={{ maxWidth: 768 }}>
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
