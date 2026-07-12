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

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-screen bg-[#F7F8FA]">

      {/* AI progress overlay */}
      {(isStreaming || !!lawyerError) && (
        <AiProgressOverlay
          visible={isStreaming || !!lawyerError}
          message={lawyerProgress}
          error={lawyerError}
          label="Consulting AI Lawyer…"
          onRetry={lawyerError ? () => setLawyerError("") : undefined}
          onDismiss={lawyerError ? () => setLawyerError("") : undefined}
        />
      )}

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-7 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-[22px] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: "'Outfit','Inter',system-ui,sans-serif" }}
            >
              Ask AI Lawyer
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Legal research and advisory across global jurisdictions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasResult && (
              <button
                type="button"
                onClick={() => setShowSources((s) => !s)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm cursor-pointer"
              >
                {showSources ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
                <span>{showSources ? "Hide" : "Show"} Sources</span>
                {matchedSources.length > 0 && (
                  <span className="bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                    {matchedSources.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Conversation column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {!hasResult && !isStreaming ? (

              /* Welcome state */
              <div className="flex flex-col items-center justify-center h-full px-6 py-16">
                <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center mb-5 shadow-md">
                  <Scale className="w-6 h-6 text-white" />
                </div>
                <h2
                  className="text-2xl font-bold text-gray-900 tracking-tight mb-2 text-center"
                  style={{ fontFamily: "'Outfit','Inter',system-ui,sans-serif" }}
                >
                  How can I assist you legally?
                </h2>
                <p className="text-sm text-gray-500 text-center mb-10 leading-relaxed max-w-sm">
                  Ask about statutes, case law, contract terms, or compliance obligations.
                  Use the <strong className="text-gray-700 font-semibold">+</strong> button to attach context.
                </p>
                <QuickPromptCards onSelect={applyQuickPrompt} />
              </div>

            ) : (

              /* Chat thread */
              <div className="max-w-3xl mx-auto w-full px-4 pt-8 pb-4">

                {submittedQuery && (
                  <div className="flex justify-end mb-6">
                    <div className="max-w-[72%] bg-gray-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
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
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {selectedFormat}
                        </span>
                        {selectedJurisdictions.length > 0 && (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                            {selectedJurisdictions.slice(0, 2).join(" · ")}
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
                        <span className="text-xs text-gray-400">{lawyerProgress || "Analyzing…"}</span>
                      </div>
                    ) : (
                      <div
                        className="prose prose-sm max-w-none text-gray-800 leading-relaxed bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-xs select-all"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(streamedResult) }}
                      />
                    )}
                  </div>
                </div>

                <div ref={chatBottomRef} />
              </div>
            )}
          </div>

          {/* Composer */}
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
        </div>

        {/* Sources panel */}
        <SourcesPanel
          visible={hasResult && showSources}
          sources={matchedSources}
          onClose={() => setShowSources(false)}
          onSourceClick={setActiveCitationModal}
        />
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
