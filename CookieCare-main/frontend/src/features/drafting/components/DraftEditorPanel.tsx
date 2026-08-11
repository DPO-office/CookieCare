import { useState } from "react";

import {

  FileText,

  MoreVertical,

  Save,

  Upload,

  Minus,

  Plus,

  Loader2,

} from "lucide-react";

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

    <div className="flex flex-col h-full min-h-0 bg-white overflow-hidden">

      <header className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-5 h-[52px] border-b border-[#EBEBEB] bg-white">

        <div className="flex items-center gap-3 min-w-0 justify-self-start">

          <div className="w-8 h-8 rounded-lg bg-[#F4F4F5] flex items-center justify-center shrink-0 border border-[#EBEBEB]">

            <FileText className="w-4 h-4 text-[#52525B]" />

          </div>

          <div className="min-w-0">

            <p className="text-[13px] font-semibold text-[#18181B] truncate tracking-[-0.01em]">{title}</p>

            <p className="text-[10.5px] text-[#A1A1AA] font-medium">{version}</p>

          </div>

        </div>



        <button

          type="button"

          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors justify-self-center"

          aria-label="Document options"

        >

          <MoreVertical className="w-4 h-4" />

        </button>



        <div className="flex items-center gap-2 shrink-0 justify-self-end">

          {isSaving && (

            <span className="inline-flex items-center gap-1 text-[11px] text-[#A1A1AA] mr-1">

              <Loader2 className="w-3 h-3 animate-spin" />

              Saving

            </span>

          )}

          {!isSaving && savingMsg && (

            <span className="text-[11px] text-emerald-600 mr-1">{savingMsg}</span>

          )}

          <button

            type="button"

            onClick={onSave}

            disabled={isSaving || isFullySigned}

            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#52525B] hover:bg-[#F4F4F5] transition-colors disabled:opacity-40 border border-transparent hover:border-[#EBEBEB]"

            aria-label="Save draft"

            title="Save draft"

          >

            <Save className="w-4 h-4" />

          </button>

          <button

            type="button"

            onClick={onExport}

            className="inline-flex items-center gap-2 h-8 px-3.5 rounded-lg bg-[#18181B] text-white text-[12px] font-medium hover:bg-[#27272A] transition-colors shadow-sm"

          >

            <Upload className="w-3.5 h-3.5" />

            Export

          </button>

        </div>

      </header>



      <div className="shrink-0 relative z-30 overflow-visible">
        <EditorToolbar

        editor={editorInstance ?? tiptapEditorRef.current}

        editorContent={editorContent}

        onSetEditorContent={onSetEditorContent}

        onInsertHtml={onInsertHtml}

        onToolbarFormat={onToolbarFormat}

        onPushUndoSnapshot={onPushUndoSnapshot}

      />
      </div>



      <div className="flex-1 relative min-h-0 overflow-hidden draft-editor-canvas">

        <div className="h-full overflow-y-auto py-4 px-3">

          <div
            className="draft-editor-paper mx-auto"
            style={{ zoom: zoom / 100 }}
          >

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

            className="w-6 h-6 flex items-center justify-center rounded-full text-[#71717A] hover:bg-[#F4F4F5] transition-colors"

            aria-label="Zoom out"

          >

            <Minus className="w-3 h-3" />

          </button>

          <span className="text-[11px] text-[#71717A] w-10 text-center tabular-nums font-medium">{zoom}%</span>

          <button

            type="button"

            onClick={() => setZoom((z) => Math.min(150, z + 10))}

            className="w-6 h-6 flex items-center justify-center rounded-full text-[#71717A] hover:bg-[#F4F4F5] transition-colors"

            aria-label="Zoom in"

          >

            <Plus className="w-3 h-3" />

          </button>

        </div>

      </div>

    </div>

  );

}


