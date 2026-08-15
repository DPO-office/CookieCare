import { useState } from "react";
import { FileText, Save, Upload, Minus, Plus, Loader2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { RichTextSelectionSnapshot } from "../../../shared/components/RichTextEditor";
import EditorToolbar from "./EditorToolbar";
import EditorCanvas from "./EditorCanvas";
import DraftChatPanel from "./DraftChatPanel";
import { DRAFT_WORKSPACE_STYLES } from "../styles/draftWorkspaceStyles";
import { useResizableRail } from "../hooks/useResizableSplit";
import type { DraftChatMessage } from "../hooks/useDraftChat";

export interface DraftSplitWorkspaceProps {
  sessionTitle: string;
  documentTitle: string;
  messages: DraftChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onChatSubmit: () => void;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  attachedFileName?: string;
  isStreaming: boolean;
  isParsing: boolean;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  editorContent: string;
  isFullySigned: boolean;
  isSaving: boolean;
  savingMsg: string;
  showFloatingMenu: boolean;
  floatingMenuPos: { x: number; y: number };
  selectedTextRange: { start: number; end: number } | null;
  activeDropdown: string | null;
  askAiQuery: string;
  tiptapEditorRef: React.MutableRefObject<Editor | null>;
  onEditorChange: (html: string) => void;
  onEditorReady: (editor: Editor) => void;
  onSelectionChange: (sel: RichTextSelectionSnapshot | null) => void;
  onApplyRewrite: (type: string, param?: string) => void;
  onSetActiveDropdown: (d: string | null) => void;
  onSetAskAiQuery: (q: string) => void;
  onSetShowFloatingMenu: (show: boolean) => void;
  onSetSelectedTextRange: (r: { start: number; end: number } | null) => void;
  onSealDocument: () => void;
  onSetEditorContent: (content: string) => void;
  onInsertHtml: (html: string) => void;
  onToolbarFormat: (action: string) => void;
  onPushUndoSnapshot: (snapshot: string) => void;
  onSave: () => void;
  onExport: () => void;
  onAskSubmit?: (messageId: string, answers: Record<string, string>) => void;
}

export default function DraftSplitWorkspace(props: DraftSplitWorkspaceProps) {
  const [zoom, setZoom] = useState(100);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const { railWidth, containerRef, onDragStart } = useResizableRail(320);

  const handleEditorReady = (editor: Editor) => {
    setEditorInstance(editor);
    props.onEditorReady(editor);
  };

  return (
    <>
      <style>{DRAFT_WORKSPACE_STYLES}</style>
<<<<<<< HEAD
      <div
        ref={containerRef}
        className="draft-workspace flex-1 flex min-h-0 h-full overflow-hidden"
      >
        <div
          className="min-h-0 h-full overflow-hidden"
          style={{ width: `${leftPercent}%` }}
        >
          <DraftChatPanel
            title={props.sessionTitle}
            messages={props.messages}
            inputValue={props.chatInput}
            onInputChange={props.onChatInputChange}
            onSubmit={props.onChatSubmit}
            onFileSelect={props.onFileSelect}
            onRemoveFile={props.onRemoveFile}
            attachedFileName={props.attachedFileName}
            isLoading={props.isStreaming}
            isParsing={props.isParsing}
            isDragging={props.isDragging}
            onDragOver={props.onDragOver}
            onDragLeave={props.onDragLeave}
            onDrop={props.onDrop}
            onAskSubmit={props.onAskSubmit}
          />
        </div>
=======
      <div className="dpa-results-bg draft-workspace flex h-full min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="draft-card mb-3 shrink-0">
        <header className="draft-workspace-header flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <FileText className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="m-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                Legal Space · Draft
              </p>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <p className="m-0 truncate text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  {props.documentTitle}
                </p>
                <span className="score-badge shrink-0 bg-[#EEF2FF] text-[10px] font-medium text-[#4F5BD9]">
                  v1.0
                </span>
              </div>
            </div>
          </div>
>>>>>>> origin/development

          <div className="flex shrink-0 items-center gap-2">
            {props.isSaving && (
              <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-[#98A2B3]">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
              </span>
            )}
            {!props.isSaving && props.savingMsg && (
              <span className="score-badge bg-badge-green text-[11px] font-medium text-badge-green-text">
                {props.savingMsg}
              </span>
            )}
            <button
              type="button"
              onClick={props.onSave}
              disabled={props.isSaving || props.isFullySigned}
              className="draft-icon-ghost disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Save draft"
              title="Save draft"
            >
              <Save className="h-4 w-4" />
            </button>
            <button type="button" onClick={props.onExport} className="draft-export-btn primary-gradient">
              <Upload className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </header>

        <div className="relative z-30 overflow-visible px-2">
          <EditorToolbar
            editor={editorInstance ?? props.tiptapEditorRef.current}
            editorContent={props.editorContent}
            onSetEditorContent={props.onSetEditorContent}
            onInsertHtml={props.onInsertHtml}
            onToolbarFormat={props.onToolbarFormat}
            onPushUndoSnapshot={props.onPushUndoSnapshot}
          />
        </div>
        </div>

        <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
          <div className="draft-editor-canvas relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="scrollbar-hide h-full overflow-y-auto px-8 py-6 sm:px-12">
              <div className="draft-editor-paper mx-auto" style={{ zoom: zoom / 100 }}>
                {props.isStreaming && (
                  <div className="draft-streaming-badge mb-4">
                    <span className="draft-streaming-dot" />
                    Writing draft live…
                  </div>
                )}
                <EditorCanvas
                  embedded
                  editorContent={props.editorContent}
                  isFullySigned={props.isFullySigned || props.isStreaming}
                  showFloatingMenu={props.showFloatingMenu}
                  floatingMenuPos={props.floatingMenuPos}
                  selectedTextRange={props.selectedTextRange}
                  activeDropdown={props.activeDropdown}
                  askAiQuery={props.askAiQuery}
                  tiptapEditorRef={props.tiptapEditorRef}
                  onEditorChange={props.onEditorChange}
                  onEditorReady={handleEditorReady}
                  onSelectionChange={props.onSelectionChange}
                  onApplyRewrite={props.onApplyRewrite}
                  onSetActiveDropdown={props.onSetActiveDropdown}
                  onSetAskAiQuery={props.onSetAskAiQuery}
                  onSetShowFloatingMenu={props.onSetShowFloatingMenu}
                  onSetSelectedTextRange={props.onSetSelectedTextRange}
                  onSealDocument={props.onSealDocument}
                  onSetEditorContent={props.onSetEditorContent}
                />
              </div>
            </div>

            <div className="draft-zoom-pill absolute bottom-5 left-5 flex items-center gap-0.5 px-1.5 py-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(75, z - 10))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                aria-label="Zoom out"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-10 text-center text-[11px] font-medium tabular-nums text-[#667085]">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(150, z + 10))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                aria-label="Zoom in"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div
            className="draft-resize-handle h-full"
            onMouseDown={onDragStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize follow-ups panel"
          />

          <div
            className="draft-card draft-followup-rail min-h-0 h-full overflow-hidden"
            style={{ width: railWidth, flex: `0 0 ${railWidth}px` }}
          >
            <DraftChatPanel
              title={props.sessionTitle}
              messages={props.messages}
              inputValue={props.chatInput}
              onInputChange={props.onChatInputChange}
              onSubmit={props.onChatSubmit}
              onFileSelect={props.onFileSelect}
              onRemoveFile={props.onRemoveFile}
              attachedFileName={props.attachedFileName}
              isLoading={props.isStreaming}
              isParsing={props.isParsing}
              isDragging={props.isDragging}
              onDragOver={props.onDragOver}
              onDragLeave={props.onDragLeave}
              onDrop={props.onDrop}
              composerPlaceholder="Ask a follow-up…"
            />
          </div>
        </div>
      </div>
    </>
  );
}
