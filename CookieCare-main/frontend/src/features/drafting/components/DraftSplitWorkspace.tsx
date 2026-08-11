import DraftChatPanel from "./DraftChatPanel";
import DraftEditorPanel from "./DraftEditorPanel";
import { DRAFT_WORKSPACE_STYLES } from "../styles/draftWorkspaceStyles";
import { useResizableSplit } from "../hooks/useResizableSplit";
import type { DraftChatMessage } from "../hooks/useDraftChat";
import type { Editor } from "@tiptap/react";
import type { RichTextSelectionSnapshot } from "../../../shared/components/RichTextEditor";

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
  const { leftPercent, containerRef, onDragStart } = useResizableSplit(32);

  return (
    <>
      <style>{DRAFT_WORKSPACE_STYLES}</style>
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

        <div
          className="draft-resize-handle h-full"
          onMouseDown={onDragStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
        />

        <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
          <DraftEditorPanel
            title={props.documentTitle}
            editorContent={props.editorContent}
            isFullySigned={props.isFullySigned}
            isStreaming={props.isStreaming}
            isSaving={props.isSaving}
            savingMsg={props.savingMsg}
            showFloatingMenu={props.showFloatingMenu}
            floatingMenuPos={props.floatingMenuPos}
            selectedTextRange={props.selectedTextRange}
            activeDropdown={props.activeDropdown}
            askAiQuery={props.askAiQuery}
            tiptapEditorRef={props.tiptapEditorRef}
            onEditorChange={props.onEditorChange}
            onEditorReady={props.onEditorReady}
            onSelectionChange={props.onSelectionChange}
            onApplyRewrite={props.onApplyRewrite}
            onSetActiveDropdown={props.onSetActiveDropdown}
            onSetAskAiQuery={props.onSetAskAiQuery}
            onSetShowFloatingMenu={props.onSetShowFloatingMenu}
            onSetSelectedTextRange={props.onSetSelectedTextRange}
            onSealDocument={props.onSealDocument}
            onSetEditorContent={props.onSetEditorContent}
            onInsertHtml={props.onInsertHtml}
            onToolbarFormat={props.onToolbarFormat}
            onPushUndoSnapshot={props.onPushUndoSnapshot}
            onSave={props.onSave}
            onExport={props.onExport}
          />
        </div>
      </div>
    </>
  );
}
