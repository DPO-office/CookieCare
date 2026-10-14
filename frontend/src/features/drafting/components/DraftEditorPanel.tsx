import { useState } from "react";
import { FileText, Save, Upload, Minus, Plus, Loader2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { RichTextSelectionSnapshot } from "../../../shared/components/RichTextEditor";
import EditorToolbar from "./EditorToolbar";
import EditorCanvas from "./EditorCanvas";

interface DraftEditorPanelProps {
  title: string;
  version?: string;
  editorContent: string;
  isFullySigned: boolean;
  isStreaming: boolean;
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
}

export default function DraftEditorPanel({
  title,
  version = "v1.0",
  editorContent,
  isFullySigned,
  isStreaming,
  isSaving,
  savingMsg,
  showFloatingMenu,
  floatingMenuPos,
  selectedTextRange,
  activeDropdown,
  askAiQuery,
  tiptapEditorRef,
  onEditorChange,
  onEditorReady,
  onSelectionChange,
  onApplyRewrite,
  onSetActiveDropdown,
  onSetAskAiQuery,
  onSetShowFloatingMenu,
  onSetSelectedTextRange,
  onSealDocument,
  onSetEditorContent,
  onInsertHtml,
  onToolbarFormat,
  onPushUndoSnapshot,
  onSave,
  onExport,
}: DraftEditorPanelProps) {
  const [zoom, setZoom] = useState(100);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const handleEditorReady = (editor: Editor) => {
    setEditorInstance(editor);
    onEditorReady(editor);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white font-sans">
      <header className="draft-workspace-header flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
            <FileText className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="m-0 truncate text-[14px] font-semibold tracking-[-0.02em] text-[#0F172A]">
                {title}
              </p>
              <span className="score-badge shrink-0 bg-[#EEF2FF] text-[10px] font-medium text-[#4F5BD9]">
                {version}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isSaving && (
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-[#98A2B3]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </span>
          )}
          {!isSaving && savingMsg && (
            <span className="score-badge bg-badge-green text-[11px] font-medium text-badge-green-text">
              {savingMsg}
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || isFullySigned}
            className="draft-icon-ghost disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Save draft"
            title="Save draft"
          >
            <Save className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onExport}
            className="draft-export-btn"
          >
            <Upload className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </header>

      <div className="relative z-30 shrink-0 overflow-visible">
        <EditorToolbar
          editor={editorInstance ?? tiptapEditorRef.current}
          editorContent={editorContent}
          onSetEditorContent={onSetEditorContent}
          onInsertHtml={onInsertHtml}
          onToolbarFormat={onToolbarFormat}
          onPushUndoSnapshot={onPushUndoSnapshot}
        />
      </div>

      <div className="draft-editor-canvas relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto px-8 py-7">
          <div className="draft-editor-paper mx-auto" style={{ zoom: zoom / 100 }}>
            {isStreaming && (
              <div className="draft-streaming-badge mb-4">
                <span className="draft-streaming-dot" />
                Writing draft live…
              </div>
            )}
            <EditorCanvas
              embedded
              editorContent={editorContent}
              isFullySigned={isFullySigned || isStreaming}
              showFloatingMenu={showFloatingMenu}
              floatingMenuPos={floatingMenuPos}
              selectedTextRange={selectedTextRange}
              activeDropdown={activeDropdown}
              askAiQuery={askAiQuery}
              tiptapEditorRef={tiptapEditorRef}
              onEditorChange={onEditorChange}
              onEditorReady={handleEditorReady}
              onSelectionChange={onSelectionChange}
              onApplyRewrite={onApplyRewrite}
              onSetActiveDropdown={onSetActiveDropdown}
              onSetAskAiQuery={onSetAskAiQuery}
              onSetShowFloatingMenu={onSetShowFloatingMenu}
              onSetSelectedTextRange={onSetSelectedTextRange}
              onSealDocument={onSealDocument}
              onSetEditorContent={onSetEditorContent}
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
    </div>
  );
}
