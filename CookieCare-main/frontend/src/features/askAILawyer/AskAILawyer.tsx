import React from "react";
import { Scale, PanelRight, PanelRightClose, Copy, Check, Gavel, Folder, ArrowUp, RefreshCw, ChevronDown } from "lucide-react";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import { AskAILawyerProps } from "./types";
import { useAskAILawyer } from "./hooks/useAskAILawyer";
import QuickPromptCards from "./components/QuickPromptCards";
import ComposerBar from "./components/ComposerBar";
import SourcesPanel from "./components/SourcesPanel";
import CitationModal from "./components/CitationModal";
import Popovers from "./components/Popovers";

// Alias — used inside the no-scroll landing layout
const LandingPopovers = Popovers;

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
    <div className="flex-1 overflow-hidden flex h-screen font-sans bg-[#FAFAFB]">

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

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Conversation column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {!hasResult && !isStreaming ? (

              /* ── Landing state: fixed layout, no scroll ── */
              <div className="flex-1 flex flex-col overflow-hidden px-10">

                {/* Page header */}
                <div className="w-full flex justify-between items-start pt-8 pb-0 shrink-0">
                  <div>
                    <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#1D6FD8" }}>Ask AI Lawyer</h1>
                    <p className="text-[13px] text-gray-500 mt-1">Legal research and advisory across global jurisdictions.</p>
                  </div>
                </div>

                {/* Hero + cards — top-aligned with fixed top padding */}
                <div className="shrink-0 flex flex-col items-center pt-10">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3 shadow-md" style={{ background: "#1D6FD8" }}>
                    <Scale className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-[22px] font-bold text-gray-900 tracking-tight mb-2 text-center">
                    How can I assist you legally?
                  </h2>
                  <p className="text-[13px] text-gray-500 text-center mb-6 leading-relaxed max-w-md">
                    Ask about statutes, case law, contract terms, or compliance obligations across global jurisdictions.
                  </p>
                  <QuickPromptCards onSelect={applyQuickPrompt} />
                </div>

                {/* Pushes composer to the bottom */}
                <div className="flex-1" />

                {/* Composer pinned at bottom */}
                <div className="shrink-0 pb-8 pt-4">
                  <div className="max-w-3xl mx-auto w-full relative" ref={composerRef}>
                    <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-gray-300 transition-all duration-200 overflow-visible">
                      <textarea
                        ref={textareaRef}
                        id="legal-prompt-input"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); autoResizeTextarea(); }}
                        onKeyDown={handleKeyDown}
                        disabled={isStreaming}
                        placeholder="Ask a legal question — GDPR compliance, contract review, tax treaties…"
                        rows={1}
                        className="w-full bg-transparent text-[15px] py-4 pl-5 pr-5 focus:outline-none placeholder:text-gray-400 text-gray-900 resize-none leading-relaxed"
                        style={{ minHeight: "60px", maxHeight: "180px" }}
                      />
                      <div className="mx-4 border-t border-gray-100" />
                      <div className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePopover("jurisdictions")}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150 cursor-pointer ${
                              openPopover === "jurisdictions" || selectedJurisdictions.length > 0
                                ? "text-white border-transparent shadow-sm"
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-700"
                            }`}
                            style={openPopover === "jurisdictions" || selectedJurisdictions.length > 0 ? { background: "#1D6FD8" } : {}}
                          >
                            <Gavel className="w-3 h-3" />
                            <span>
                              {selectedJurisdictions.length > 0
                                ? `${selectedJurisdictions.length} Jurisdiction${selectedJurisdictions.length > 1 ? "s" : ""}`
                                : "Jurisdiction"}
                            </span>
                            <ChevronDown className={`w-2.5 h-2.5 opacity-60 transition-transform duration-150 ${openPopover === "jurisdictions" ? "rotate-180" : ""}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePopover("kb")}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150 cursor-pointer ${
                              openPopover === "kb" || selectedKBCount > 0
                                ? "text-white border-transparent shadow-sm"
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-700"
                            }`}
                            style={openPopover === "kb" || selectedKBCount > 0 ? { background: "#1D6FD8" } : {}}
                          >
                            <Folder className="w-3 h-3" />
                            <span>
                              {selectedKBCount > 0
                                ? `${selectedKBCount} Doc${selectedKBCount > 1 ? "s" : ""}`
                                : "Documents"}
                            </span>
                            <ChevronDown className={`w-2.5 h-2.5 opacity-60 transition-transform duration-150 ${openPopover === "kb" ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                        <button
                          id="legal-prompt-submit"
                          type="button"
                          onClick={() => handleQueryDispatch()}
                          disabled={!searchQuery.trim() || isStreaming}
                          className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm shrink-0" style={{ background: "#1D6FD8" }}
                        >
                          {isStreaming
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <ArrowUp className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-center text-[10px] text-gray-400 mt-2.5">
                      <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send
                      &nbsp;·&nbsp;
                      <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
                    </p>
                    <LandingPopovers
                      openPopover={openPopover}
                      popoverRef={popoverRef}
                      availableJurisdictions={availableJurisdictions}
                      selectedJurisdictions={selectedJurisdictions}
                      toggleJurisdiction={toggleJurisdiction}
                      setSelectedJurisdictions={setSelectedJurisdictions}
                      selectedFormat={selectedFormat}
                      setSelectedFormat={setSelectedFormat}
                      folders={folders}
                      newFolderName={newFolderName}
                      setNewFolderName={setNewFolderName}
                      handleAddFolder={handleAddFolder}
                      toggleFolderSelection={toggleFolderSelection}
                      handleDeleteFolder={handleDeleteFolder}
                      setActiveFolderForUpload={setActiveFolderForUpload}
                      fileUploadRef={fileUploadRef}
                      selectedKBCount={selectedKBCount}
                      selectedFolderCount={selectedFolderCount}
                      webDiscoveryUrlInput={webDiscoveryUrlInput}
                      setWebDiscoveryUrlInput={setWebDiscoveryUrlInput}
                      webDiscoveryUrls={webDiscoveryUrls}
                      handleAddWebUrl={handleAddWebUrl}
                      removeWebUrl={removeWebUrl}
                      setOpenPopover={setOpenPopover}
                    />
                  </div>
                </div>
              </div>

            ) : (

              /* ── Chat state: scrollable, with persistent header + composer ── */
              <>
                <div className="flex-1 overflow-y-auto px-10 py-8">

                  {/* Page header */}
                  <div className="w-full flex justify-between items-start mb-9">
                    <div>
                      <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#1D6FD8" }}>Ask AI Lawyer</h1>
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
                          <span className="text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "#1D6FD8" }}>
                            {matchedSources.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Chat thread */}
                  <div className="max-w-3xl mx-auto w-full pb-4">
                    {submittedQuery && (
                      <div className="flex justify-end mb-6">
                        <div className="max-w-[72%] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm" style={{ background: "#1D6FD8" }}>
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
                            className="prose prose-sm max-w-none text-gray-800 leading-relaxed bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-xs select-text"
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




