/**
 * AskAILawyer — Enterprise AI Legal Workspace
 *
 * Visual language matches RandTrust AI exactly:
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

function QuickChip({ label, icon: Icon, onClick }: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 outline-none rounded-full px-3.5 py-1.5 text-[12px] text-[#A1A1AA] bg-[#FAFAFA] border border-[#EBEBEB] hover:border-[#D4D4D8] hover:text-[#52525B] transition-colors"
    >
      <Icon className="w-3 h-3 shrink-0 text-[#A1A1AA]" />
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
    // Navigate back to landing by clearing result state via a re-mount trick —
    // the hook exposes setLawyerError; for a full reset we reload the page state.
    // A lightweight approach: reload the component by clearing key state.
    setOpenPopover(null);
    setShowSources(false);
    // The hook's hasResult / submittedQuery are derived from internal state.
    // We trigger a visible reset by dispatching an empty query reset signal.
    // Since the hook doesn't expose a reset(), we achieve this through the
    // error channel which brings us back to landing when lawyerError is set
    // and then immediately cleared — instead, just reload the page.
    window.location.reload();
  };

  return (
    <>
      <style>{PREMIUM_CHAT_LANDING_STYLES}</style>

      <div className="pcl-page flex-1 min-h-0 overflow-hidden flex relative">
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
              Mirrors RandTrust AI landing exactly:
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
                <h1 className="pcl-rise-1 pcl-heading text-center">
                  What would you like to research?
                </h1>

                <div className="pcl-rise-2 w-full mt-8" style={{ maxWidth: 720 }}>
                  <ComposerBar {...composerProps} variant="landing" />
                </div>

                <div
                  className="pcl-rise-2 flex flex-wrap items-center justify-center gap-2 mt-6"
                  style={{ maxWidth: 560 }}
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
              Mirrors RandTrust AI chat exactly:
                white session bar → scrollable messages →
                white pinned composer footer
          ════════════════════════════════════════════════ */}
          {(hasResult || isStreaming) && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex min-h-0 overflow-hidden"
              style={{ zIndex: 2, position: "relative" }}
            >
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#FAFAFA]">

                {/* Session bar */}
                <header
                  className="flex items-center justify-between px-6 shrink-0 bg-white"
                  style={{
                    height: 56,
                    borderBottom: "1px solid #F0F0F0",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#F4F4F5] flex items-center justify-center shrink-0">
                      <Scale className="w-3.5 h-3.5 text-[#18181B]" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="m-0 text-[14px] font-semibold text-[#18181B] leading-tight">
                        AI Lawyer
                      </p>
                      {selectedJurisdictions.length > 0 && (
                        <p className="m-0 mt-0.5 text-[11px] text-[#A1A1AA] truncate">
                          {selectedJurisdictions.length === 1
                            ? selectedJurisdictions[0]
                            : `${selectedJurisdictions.length} jurisdictions`}
                        </p>
                      )}
                    </div>
                    {matchedSources.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSources((s) => !s)}
                        aria-pressed={showSources}
                        className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors cursor-pointer border-none"
                        style={{
                          color: showSources ? "#FFFFFF" : "#52525B",
                          background: showSources ? "#18181B" : "#F4F4F5",
                        }}
                      >
                        <BookOpen className="w-3 h-3" />
                        {matchedSources.length} source{matchedSources.length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-medium border transition-colors cursor-pointer"
                    style={{
                      color: "#52525B",
                      background: "#FFFFFF",
                      borderColor: "#E4E4E7",
                    }}
                    aria-label="New conversation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>New</span>
                  </button>
                </header>

                {/* Scrollable conversation */}
                <div className="flex-1 overflow-y-auto px-6 py-8">
                  <div className="mx-auto space-y-8" style={{ maxWidth: 720 }}>

                    {submittedQuery && (
                      <div className="flex justify-end">
                        <div
                          className="max-w-[80%] rounded-2xl rounded-br-md px-5 py-3.5"
                          style={{ background: "#18181B", color: "#FFFFFF" }}
                        >
                          <p className="m-0 text-[11px] font-medium text-white/45 mb-1.5">You asked</p>
                          <p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap">
                            {submittedQuery}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <AIResponseBlock
                        htmlContent={markdownToHtml(streamedResult)}
                        isStreaming={isStreaming}
                        statusMessage={lawyerProgress || "Researching across jurisdictions…"}
                        label="AI Lawyer"
                        subLabel={jurisdictionSubLabel}
                        isCopied={isCopied}
                        onCopy={handleCopyMarkdown}
                      />
                    </div>

                    <div ref={chatBottomRef} aria-hidden="true" />
                  </div>
                </div>

                {/* Pinned composer */}
                <div
                  className="shrink-0 px-6 pb-5 pt-4 bg-white"
                  style={{ borderTop: "1px solid #F0F0F0" }}
                >
                  <div className="max-w-[720px] mx-auto">
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
