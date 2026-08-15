"use client";

import { useState, useCallback, useEffect } from "react";
import { PAGE_STYLES, PAGE_STYLES_SUBTLE } from "./styles/pageStyles";
import { SubtleBackground } from "./components/SubtleBackground";

// ── Background variant ────────────────────────────────────────────────────────
// "plain"  → flat #F7F8FA, zero decoration
// "subtle" → ambient radial glow + noise (disabled in Phase 1 foundation)
const BG_VARIANT: "plain" | "subtle" = "plain";
import { LandingState } from "./components/LandingState";
import { ChatView } from "./components/ChatView";
import { useChat } from "./hooks/useChat";
import { useFileUpload } from "./hooks/useFileUpload";
import { useDragDrop } from "./hooks/useDragDrop";
import type { ComposerProps } from "./components/Composer";
import type { QuickAction, CompareResult } from "./types";
import { CompareDocumentsModal, CompareLandingPage, CompareResultsState, useCompareDocuments } from "../analyze/compare";
import { useCompare } from "../analyze/compare/hooks/useCompare";
import { useCompareChat } from "../analyze/compare/hooks/useCompareChat";
import {
  getCompareHistory,
  saveCompareToHistory,
  restoreCompareHistoryEntry,
  deleteCompareHistoryEntry,
  type CompareHistoryEntry,
} from "../analyze/compare/utils/compareHistory";

interface LORAAIProps {
  authToken: string;
  user: { name: string; email: string } | null;
  /**
   * "workspace" — full AI Workspace with quick actions (default).
   * "compare"   — Sidebar Compare tab: opens the existing Compare flow directly.
   */
  mode?: "workspace" | "compare";
  /** When Compare is launched from AI Workspace, navigate to the Compare tab. */
  onNavigateToCompare?: () => void;
}

export default function LORAAI({
  authToken,
  mode = "workspace",
  onNavigateToCompare,
}: LORAAIProps) {
  const isCompareMode = mode === "compare";

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<CompareHistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (isCompareMode) {
      setHistoryEntries(getCompareHistory());
    }
  }, [isCompareMode]);
  const [inputValue, setInputValue] = useState("");

  // ── Compare Chat — in-memory session for follow-up questions ─────────────
  const {
    activateSession: activateCompareSession,
    isActiveSession: isCompareChatActive,
    askQuestion: askCompareQuestion,
    clearSession: clearCompareSession,
  } = useCompareChat({ authToken });

  // ── Behaviour hooks ───────────────────────────────────────────────────────
  const { uploadedFiles, addFiles, removeFile, clearFiles } = useFileUpload();

  const {
    messages,
    isLoading,
    isLanding,
    activeWorkflow,
    selectWorkflow,
    reset,
    restoreMessages,
    submitMessage,
    injectCompareUserMessage,
    startCompareStreaming,
    updateCompareProgress,
    finaliseCompareMessage,
    failCompareMessage,
  } = useChat({
    authToken,
    isCompareChatActive,
    askCompareQuestion,
  });

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } = useDragDrop({
    onDrop: addFiles,
  });

  // ── Compare Documents modal state ─────────────────────────────────────────
  const {
    isOpen: isCompareOpen,
    original,
    revised,
    canCompare,
    open: openCompare,
    close: closeCompare,
    setFile,
    removeFile: removeCompareFile,
    replaceFile,
    clear: clearCompareFiles,
  } = useCompareDocuments();

  // Sidebar Compare tab: show the dedicated compare landing page (not the modal)
  // Modal is only used when Compare is launched from AI Workspace quick actions.

  /**
   * Wraps finaliseCompareMessage to also activate the compare chat session
   * so follow-up questions are automatically routed to the compare agent.
   */
  const handleCompareComplete = useCallback((
    id: string,
    markdownContent: string,
    compareResult: CompareResult
  ) => {
    finaliseCompareMessage(id, markdownContent, compareResult);
    if (compareResult.sessionId) {
      activateCompareSession(compareResult.sessionId);
      setActiveHistoryId(compareResult.sessionId);
    }
  }, [finaliseCompareMessage, activateCompareSession]);

  // Persist completed comparisons to local history
  useEffect(() => {
    if (!isCompareMode || isLanding || isLoading) return;
    const hasResult = messages.some((m) => m.compareResult);
    if (!hasResult) return;
    const saved = saveCompareToHistory(messages);
    if (saved) {
      setActiveHistoryId(saved.id);
      setHistoryEntries(getCompareHistory());
    }
  }, [messages, isCompareMode, isLanding, isLoading]);

  // ── Compare AI engine — wired to the chat message flow ───────────────────
  const { startCompare } = useCompare({
    authToken,
    onUserMessage: injectCompareUserMessage,
    onStreamingStart: startCompareStreaming,
    onProgressUpdate: updateCompareProgress,
    onComplete: handleCompareComplete,
    onError: failCompareMessage,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    submitMessage(inputValue, uploadedFiles);
    setInputValue("");
    clearFiles();
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.id === "compare-documents") {
      if (onNavigateToCompare) {
        onNavigateToCompare();
        return;
      }
      openCompare();
      return;
    }
    selectWorkflow(action);
    setInputValue(action.prompt);
  };

  const handleReset = () => {
    reset();
    clearCompareSession();
    clearCompareFiles();
    setInputValue("");
    clearFiles();
    setHistoryOpen(false);
    setActiveHistoryId(null);
  };

  const handleSelectHistory = (entry: CompareHistoryEntry) => {
    const restored = restoreCompareHistoryEntry(entry);
    restoreMessages(restored);
    setActiveHistoryId(entry.id);
    if (entry.sessionId) {
      activateCompareSession(entry.sessionId);
    } else {
      clearCompareSession();
    }
  };

  const handleDeleteHistory = (id: string) => {
    deleteCompareHistoryEntry(id);
    setHistoryEntries(getCompareHistory());
    if (activeHistoryId === id) {
      setActiveHistoryId(null);
    }
  };

  /**
   * Called when the user clicks "Compare Agreements" in the modal.
   * Closes the modal immediately, then starts the compare pipeline which
   * streams progress updates directly into the chat.
   */
  const handleCompare = () => {
    if (!original || !revised) return;
    if (!isCompareMode) closeCompare();
    startCompare(original.file, revised.file);
  };

  const handleCloseCompare = () => {
    // In Compare tab, closing without running compare just dismisses the modal;
    // user can reopen via the Compare Documents quick action / New reset.
    closeCompare();
  };

  // ── Shared composer props (passed to LandingState and ChatView) ───────────
  const composerProps: Omit<ComposerProps, "placeholder"> = {
    value: inputValue,
    onChange: setInputValue,
    onSubmit: handleSubmit,
    onFileAdd: addFiles,
    uploadedFiles,
    onRemoveFile: removeFile,
    isLoading,
    isDragging,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  const isSubtle = BG_VARIANT === "subtle";

  return (
    <>
      <style>{isSubtle ? PAGE_STYLES_SUBTLE : PAGE_STYLES}</style>
      <div
        className="rt flex-1 flex flex-col min-w-0 overflow-hidden relative"
        style={{ background: isCompareMode ? "#FFFFFF" : "#F7F8FA", height: "100%" }}
      >
        {/* z:0–1 — optional ambient background layers (Version B only) */}
        {isSubtle && <SubtleBackground />}

        {/* z:2 — page content */}
        <div
          className="relative flex flex-col flex-1 min-h-0 overflow-hidden"
          style={{ zIndex: 2 }}
        >
          {isCompareMode && isLanding ? (
            <CompareLandingPage
              original={original}
              revised={revised}
              canCompare={canCompare}
              onFileSelect={setFile}
              onRemove={removeCompareFile}
              onReplace={replaceFile}
              onCompare={handleCompare}
            />
          ) : isCompareMode ? (
            <CompareResultsState
              messages={messages}
              isLoading={isLoading}
              originalName={original?.name}
              revisedName={revised?.name}
              composerProps={composerProps}
              onReset={handleReset}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onCloseHistory={() => setHistoryOpen(false)}
              historyEntries={historyEntries}
              activeHistoryId={activeHistoryId}
              onSelectHistory={handleSelectHistory}
              onDeleteHistory={handleDeleteHistory}
            />
          ) : isLanding ? (
            <LandingState
              composerProps={composerProps}
              onQuickAction={handleQuickAction}
            />
          ) : (
            <ChatView
              messages={messages}
              composerProps={composerProps}
              onReset={handleReset}
              activeWorkflow={activeWorkflow}
              isCompareMode={isCompareChatActive()}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onCloseHistory={() => setHistoryOpen(false)}
              historyEntries={historyEntries}
              activeHistoryId={activeHistoryId}
              onSelectHistory={handleSelectHistory}
              onDeleteHistory={handleDeleteHistory}
            />
          )}
        </div>

        {/* Compare modal — workspace quick-action only */}
        {!isCompareMode && (
          <CompareDocumentsModal
            isOpen={isCompareOpen}
            original={original}
            revised={revised}
            canCompare={canCompare}
            onClose={handleCloseCompare}
            onFileSelect={setFile}
            onRemove={removeCompareFile}
            onReplace={replaceFile}
            onCompare={handleCompare}
          />
        )}
      </div>
    </>
  );
}
