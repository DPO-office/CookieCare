import React from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import RichTextEditor from "../../../shared/components/RichTextEditor";
import type { RichTextSelectionSnapshot } from "../../../shared/components/RichTextEditor";
import type { Editor } from "@tiptap/react";

interface EditorCanvasProps {
  editorContent: string;
  isFullySigned: boolean;
  isAiRefiningText: boolean;
  showFloatingMenu: boolean;
  floatingMenuPos: { x: number; y: number };
  selectedTextRange: { start: number; end: number } | null;
  activeDropdown: string | null;
  showAskAiInput: boolean;
  askAiQuery: string;
  tiptapEditorRef: React.MutableRefObject<Editor | null>;
  onEditorChange: (html: string) => void;
  onEditorReady: (editor: Editor) => void;
  onSelectionChange: (sel: RichTextSelectionSnapshot | null) => void;
  onApplyRewrite: (type: string, param?: string) => void;
  onSetActiveDropdown: (d: string | null) => void;
  onSetShowAskAiInput: (show: boolean) => void;
  onSetAskAiQuery: (q: string) => void;
  onSetShowFloatingMenu: (show: boolean) => void;
  onSetSelectedTextRange: (r: { start: number; end: number } | null) => void;
  onSealDocument: () => void;
  onSetEditorContent: (content: string) => void;
}

export default function EditorCanvas({
  editorContent,
  isFullySigned,
  isAiRefiningText,
  showFloatingMenu,
  floatingMenuPos,
  selectedTextRange,
  activeDropdown,
  showAskAiInput,
  askAiQuery,
  tiptapEditorRef,
  onEditorChange,
  onEditorReady,
  onSelectionChange,
  onApplyRewrite,
  onSetActiveDropdown,
  onSetShowAskAiInput,
  onSetAskAiQuery,
  onSetShowFloatingMenu,
  onSetSelectedTextRange,
  onSealDocument,
  onSetEditorContent,
}: EditorCanvasProps) {
  return (
    <div className="flex-1 relative overflow-y-auto bg-[#F7F8FA]">

      {/* Floating selection toolbar */}
      {showFloatingMenu && selectedTextRange && (
        <div
          className="fixed bg-white border border-gray-200 rounded-xl shadow-lg p-1 flex items-center gap-0.5 z-30 select-none"
          style={{
            left: `${floatingMenuPos.x}px`,
            top: `${floatingMenuPos.y}px`,
            boxShadow: "0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {/* Inline format buttons */}
          {[
            {
              label: "B",
              className: "font-bold",
              action: () => {
                const ed = tiptapEditorRef.current;
                if (!ed) return;
                ed.chain().focus().toggleBold().run();
                onSetEditorContent(ed.getHTML());
              },
            },
            {
              label: "I",
              className: "italic",
              action: () => {
                const ed = tiptapEditorRef.current;
                if (!ed) return;
                ed.chain().focus().toggleItalic().run();
                onSetEditorContent(ed.getHTML());
              },
            },
            {
              label: "U",
              className: "underline",
              action: () => {
                const ed = tiptapEditorRef.current;
                if (!ed) return;
                ed.chain().focus().toggleUnderline().run();
                onSetEditorContent(ed.getHTML());
              },
            },
          ].map(({ label, className, action }) => (
            <button
              key={label}
              onClick={action}
              className={`w-7 h-7 flex items-center justify-center hover:bg-gray-100 text-gray-700 text-[11px] rounded-lg transition cursor-pointer ${className}`}
            >
              {label}
            </button>
          ))}

          <span className="w-px h-4 bg-gray-200 mx-0.5" />

          {/* AI Assistant */}
          <div className="relative">
            <button
              onClick={() => onSetActiveDropdown(activeDropdown === "main" ? null : "main")}
              className="h-7 px-2.5 bg-gray-900 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 hover:bg-gray-800 transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>AI</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-70" />
            </button>

            {activeDropdown === "main" && (
              <div className="absolute left-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl py-1 z-40 overflow-hidden">
                <div className="relative group/sub">
                  <div className="px-3.5 py-2 hover:bg-gray-50 flex justify-between items-center cursor-pointer text-xs text-gray-700">
                    <span>Adjust tone</span>
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                  </div>
                  <div className="absolute left-full top-0 ml-1 w-36 bg-white border border-gray-200 rounded-2xl shadow-xl py-1 hidden group-hover/sub:block z-50">
                    {["Formal", "Professional", "Casual", "Friendly"].map((tone) => (
                      <div
                        key={tone}
                        onClick={() => onApplyRewrite("tone", tone)}
                        className="px-3.5 py-2 hover:bg-gray-50 cursor-pointer text-xs text-gray-700"
                      >
                        {tone}
                      </div>
                    ))}
                  </div>
                </div>
                {[
                  { label: "Fix spelling & grammar", type: "grammar" },
                  { label: "Extend text", type: "extend" },
                  { label: "Reduce text", type: "reduce" },
                  { label: "Simplify text", type: "simplify" },
                ].map(({ label, type }) => (
                  <div
                    key={type}
                    onClick={() => onApplyRewrite(type)}
                    className="px-3.5 py-2 hover:bg-gray-50 cursor-pointer text-xs text-gray-700"
                  >
                    {label}
                  </div>
                ))}
                <div
                  onClick={(e) => { e.stopPropagation(); onSetShowAskAiInput(!showAskAiInput); }}
                  className="px-3.5 py-2 hover:bg-gray-50 cursor-pointer border-t border-gray-100 text-xs text-gray-700 flex justify-between items-center"
                >
                  <span>Ask AI</span>
                  <Sparkles className="w-3 h-3 text-amber-400" />
                </div>
                {showAskAiInput && (
                  <div className="p-2 bg-gray-50 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={askAiQuery}
                      onChange={(e) => onSetAskAiQuery(e.target.value)}
                      placeholder="e.g. rewrite in negative legal tone…"
                      className="w-full border border-gray-200 rounded-xl p-2 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition placeholder:text-gray-400"
                    />
                    <button
                      onClick={() => onApplyRewrite("ask", askAiQuery)}
                      className="mt-1.5 w-full bg-gray-900 hover:bg-gray-800 text-white py-1.5 rounded-xl text-[10px] font-semibold transition cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}
                <div
                  onClick={() => onApplyRewrite("complete")}
                  className="px-3.5 py-2 hover:bg-gray-50 cursor-pointer border-t border-gray-100 text-xs text-gray-700"
                >
                  Complete sentence
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => { onSetShowFloatingMenu(false); onSetSelectedTextRange(null); }}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* AI refinement overlay */}
      {isAiRefiningText && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-gray-900 text-white rounded-2xl px-5 py-3.5 shadow-xl flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-xs font-medium tracking-wide">Rewriting with AI…</span>
          </div>
        </div>
      )}

      {/* Document paper */}
      <div className="draft-editor-workspace-scroll py-8 px-6 sm:px-10">
        <div className="draft-editor-body">
          <RichTextEditor
            content={editorContent}
            readOnly={isFullySigned}
            onChange={onEditorChange}
            onEditorReady={onEditorReady}
            onSelectionChange={onSelectionChange}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
