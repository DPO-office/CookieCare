import React from "react";
import { Scale, PanelRight, PanelRightClose, Copy, Check } from "lucide-react";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import { AskAILawyerProps } from "./types";
import { useAskAILawyer } from "./hooks/useAskAILawyer";
import QuickPromptCards from "./components/QuickPromptCards";
import ComposerBar from "./components/ComposerBar";
import SourcesPanel from "./components/SourcesPanel";
import CitationModal from "./components/CitationModal";

export default function AskAILawyer({ authToken, documents: _propDocs = [] }: AskAILawyerProps) {
  const {
    searchQuery, setSearchQuery,
    selectedFormat, setSelectedFormat,
    selectedJurisdictions, setSelectedJurisdictions,
    webDiscoveryUrlInput, setWebDiscoveryUrlInput,
    webDiscoveryUrls,
    availableJurisdictions,
    folders, setFolders,
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

  // One composer, shared by the landing and chat states. They used to be two
  // copies of the same markup, which is how they drifted apart.
  const composer = (
    <ComposerBar
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      autoResizeTextarea={autoResizeTextarea}
      handleQueryDispatch={handleQueryDispatch}
      handleKeyDown={handleKeyDown}
      isStreaming={isStreaming}
      selectedJurisdictions={selectedJurisdictions}
      toggleJurisdiction={toggleJurisdiction}
      selectedKBCount={selectedKBCount}
      selectedFolderCount={selectedFolderCount}
      webDiscoveryUrls={webDiscoveryUrls}
      selectedFormat={selectedFormat}
      openPopover={openPopover}
      togglePopover={togglePopover}
      setOpenPopover={setOpenPopover}
      composerRef={composerRef}
      popoverRef={popoverRef}
      textareaRef={textareaRef}
      fileUploadRef={fileUploadRef}
      availableJurisdictions={availableJurisdictions}
      setSelectedJurisdictions={setSelectedJurisdictions}
      setSelectedFormat={setSelectedFormat}
      folders={folders}
      newFolderName={newFolderName}
      setNewFolderName={setNewFolderName}
      handleAddFolder={handleAddFolder}
      toggleFolderSelection={toggleFolderSelection}
      handleDeleteFolder={handleDeleteFolder}
      setActiveFolderForUpload={setActiveFolderForUpload}
      webDiscoveryUrlInput={webDiscoveryUrlInput}
      setWebDiscoveryUrlInput={setWebDiscoveryUrlInput}
      handleAddWebUrl={handleAddWebUrl}
      removeWebUrl={removeWebUrl}
    />
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex font-sans bg-[#FAFAFB]">

      {/* AI progress overlay */}
      {(isStreaming || !!lawyerError) && (
        <AiProgressOverlay
          visible={isStreaming || !!lawyerError}
          message={lawyerProgress}
          error={lawyerError}
          label="Consulting AI Lawyer"
          onRetry={lawyerError ? () => setLawyerError("") : undefined}
          onDismiss={lawyerError ? () => setLawyerError("") : undefined}
        />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Conversation column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {!hasResult && !isStreaming ? (

              /* -- Landing state: composer pinned, everything above it scrolls -- */
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">

                {/* Header + hero share one scroll area. On a short viewport they
                    scroll instead of pushing the composer off screen. */}
                <div className="flex-1 min-h-0 overflow-y-auto px-10">

                  {/* Page header */}
                  <div className="pt-8 pb-0">
                    <div className="w-full max-w-5xl mx-auto flex justify-between items-start">
                      <div>
                        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#2175D9" }}>Ask AI Lawyer</h1>
                        <p className="text-[13px] text-gray-500 mt-1">Legal research and advisory across global jurisdictions.</p>
                      </div>
                    </div>
                  </div>

                  {/* Hero + cards - top-aligned with fixed top padding */}
                  <div className="flex flex-col items-center pt-18 pb-6">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-md" style={{ background: "#2175D9" }}>
                      <Scale className="w-[22px] h-[22px] text-white" />
                    </div>
                    <h2 className="text-[24px] font-bold text-gray-900 tracking-tight mb-2 text-center">
                      How can I assist you legally?
                    </h2>
                    <p className="text-[14px] text-gray-500 text-center mb-6 leading-relaxed max-w-md">
                      Ask about statutes, case law, contract terms, or compliance obligations across global jurisdictions.
                    </p>
                    <QuickPromptCards onSelect={applyQuickPrompt} />
                  </div>
                </div>

                {/* Composer pinned at bottom */}
                {composer}
              </div>

            ) : (

              /* -- Chat state: scrollable, with persistent header + composer -- */
              <>
                <div className="flex-1 overflow-y-auto px-10 py-8">

                  {/* Page header */}
                  <div className="w-full max-w-5xl mx-auto flex justify-between items-start mb-9">
                    <div>
                      <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#2175D9" }}>Ask AI Lawyer</h1>
                      <p className="text-[13px] text-gray-500 mt-1">Legal research and advisory across global jurisdictions.</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowSources((s) => !s)}
                        className="flex items-center gap-2 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl px-3 h-9 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-xs cursor-pointer"
                      >
                        {showSources ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
                        <span>{showSources ? "Hide" : "Show"} Sources</span>
                        {matchedSources.length > 0 && (
                          <span className="text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "#2175D9" }}>
                            {matchedSources.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Chat thread */}
                  <div className="max-w-5xl mx-auto w-full pb-4">
                    {submittedQuery && (
                      <div className="flex justify-end mb-6">
                        <div className="max-w-[72%] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm" style={{ background: "#2175D9" }}>
                          {submittedQuery}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3 mb-6">
                      <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        <Scale className="w-4 h-4 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-gray-800">AI Lawyer</span>
                            {selectedJurisdictions.length > 0 && (
                              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                                {selectedJurisdictions.slice(0, 2).join(" | ")}
                                {selectedJurisdictions.length > 2 ? ` +${selectedJurisdictions.length - 2}` : ""}
                              </span>
                            )}
                          </div>
                          {streamedResult && (
                            <button
                              type="button"
                              onClick={handleCopyMarkdown}
                              className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-900 border border-gray-200 bg-white px-2.5 py-1 rounded-xl hover:bg-gray-50 transition cursor-pointer"
                            >
                              {isCopied
                                ? <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600">Copied</span></>
                                : <><Copy className="w-3 h-3" /><span>Copy</span></>}
                            </button>
                          )}
                        </div>
                        {isStreaming && !streamedResult ? (
                          <div className="flex items-center gap-2.5 py-4">
                            <div className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                                  style={{ animationDelay: `${i * 0.15}s` }} />
                              ))}
                            </div>
                            <span className="text-xs text-gray-400">{lawyerProgress || "Analyzing..."}</span>
                          </div>
                        ) : (
                          <div
                            className="md-content text-[14px] text-gray-800 leading-relaxed bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-xs select-text"
                            style={{ userSelect: "text", WebkitUserSelect: "text" }}
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(streamedResult) }}
                          />
                        )}
                      </div>
                    </div>
                    <div ref={chatBottomRef} />
                  </div>
                </div>

                {/* Composer */}
                {composer}
              </>
            )}
          </div>

          {/* Sources panel */}
          <SourcesPanel
            visible={hasResult && showSources}
            sources={matchedSources}
            onClose={() => setShowSources(false)}
            onSourceClick={setActiveCitationModal}
          />
        </div>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileUploadRef}
        className="hidden"
        accept=".pdf,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg"
        onChange={handleFileUpload}
      />

      {/* Citation modal */}
      <CitationModal
        source={activeCitationModal}
        onClose={() => setActiveCitationModal(null)}
      />
    </div>
  );
}




