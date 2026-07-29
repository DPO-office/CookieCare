import React from "react";
import {
  Sparkles,
  ChevronDown,
  ArrowUp,
  X,
} from "lucide-react";
import RichTextEditor from "../../../shared/components/RichTextEditor";
import type { RichTextSelectionSnapshot } from "../../../shared/components/RichTextEditor";
import type { Editor } from "@tiptap/react";

/** Rewrite types the drafting API understands, in the order users reach for them. */
const QUICK_REFINEMENTS = [
  { label: "Fix spelling & grammar", type: "grammar" },
  { label: "Make it shorter", type: "reduce" },
  { label: "Make it longer", type: "extend" },
  { label: "Simplify the language", type: "simplify" },
  { label: "Complete the sentence", type: "complete" },
] as const;

const TONES = ["Formal", "Professional", "Casual", "Friendly"] as const;

const AI_PANEL_WIDTH = 340;
/** Roughly the panel's tallest state, used to decide which way it opens. */
const AI_PANEL_HEIGHT = 330;
const TOOLBAR_HEIGHT = 38;
const VIEWPORT_MARGIN = 12;

interface EditorCanvasProps {
  editorContent: string;
  isFullySigned: boolean;
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
}

export default function EditorCanvas({
  editorContent,
  isFullySigned,
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
}: EditorCanvasProps) {
  const isAiPanelOpen = activeDropdown === "main";

  const closeMenu = () => {
    onSetActiveDropdown(null);
    onSetShowFloatingMenu(false);
    onSetSelectedTextRange(null);
  };

  const submitAskAi = () => {
    const instruction = askAiQuery.trim();
    if (instruction) onApplyRewrite("ask", instruction);
  };

  const toggleMark = (command: "toggleBold" | "toggleItalic" | "toggleUnderline") => {
    const ed = tiptapEditorRef.current;
    if (!ed) return;
    ed.chain().focus()[command]().run();
    onSetEditorContent(ed.getHTML());
  };

  // The toolbar sits above the selection, so the panel normally opens downward
  // over the document. Near the bottom of the viewport there is no room for it,
  // so the block is anchored by the toolbar's bottom edge and grows upward.
  const menuLeft = Math.min(
    Math.max(floatingMenuPos.x, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - AI_PANEL_WIDTH - VIEWPORT_MARGIN)
  );
  const opensUpward =
    floatingMenuPos.y + TOOLBAR_HEIGHT + AI_PANEL_HEIGHT > window.innerHeight;

  return (
    <div className="flex-1 relative overflow-y-auto bg-[#F7F8FA]">

      {/* Floating selection toolbar */}
      {showFloatingMenu && selectedTextRange && (
        <div
          className={`fixed z-30 flex items-start gap-1.5 ${opensUpward ? "flex-col-reverse" : "flex-col"}`}
          style={{
            left: `${menuLeft}px`,
            ...(opensUpward
              ? { bottom: `${window.innerHeight - floatingMenuPos.y - TOOLBAR_HEIGHT}px` }
              : { top: `${floatingMenuPos.y}px` }),
          }}
        >
          {/* Toolbar */}
          <div
            className="bg-white border border-gray-200 rounded-xl p-1 flex items-center gap-0.5 select-none"
            style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)" }}
          >
            {/* Inline format buttons */}
            {[
              { label: "B", className: "font-bold", command: "toggleBold" },
              { label: "I", className: "italic", command: "toggleItalic" },
              { label: "U", className: "underline", command: "toggleUnderline" },
            ].map(({ label, className, command }) => (
              <button
                key={label}
                onClick={() => toggleMark(command as "toggleBold" | "toggleItalic" | "toggleUnderline")}
                className={`w-7 h-7 flex items-center justify-center hover:bg-gray-100 text-gray-700 text-[11px] rounded-lg transition cursor-pointer ${className}`}
              >
                {label}
              </button>
            ))}

            <span className="w-px h-4 bg-gray-200 mx-0.5" />

            {/* AI trigger */}
            <button
              onClick={() => {
                const next = isAiPanelOpen ? null : "main";
                onSetActiveDropdown(next);
              }}
              className="h-7 inline-flex items-center gap-1.5 pl-2 pr-1.5 rounded-lg text-[11px] font-semibold text-white transition hover:opacity-90 cursor-pointer"
              style={{ background: "#2175D9" }}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Ask AI
              <ChevronDown className={`w-3 h-3 opacity-70 transition-transform ${isAiPanelOpen ? "rotate-180" : ""}`} />
            </button>

            <span className="w-px h-4 bg-gray-200 mx-0.5" />

            <button
              onClick={closeMenu}
              aria-label="Dismiss"
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Refinement panel: describe the change, or pick a preset */}
          {isAiPanelOpen && (
            <div
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              style={{
                width: `${AI_PANEL_WIDTH}px`,
                boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <form
                onSubmit={(e) => { e.preventDefault(); submitAskAi(); }}
                className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "#2175D9" }} />
                <input
                  autoFocus
                  type="text"
                  value={askAiQuery}
                  onChange={(e) => onSetAskAiQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeMenu(); }}
                  placeholder="Tell the AI how to rewrite this..."
                  className="flex-1 min-w-0 bg-transparent text-[12px] text-gray-800 placeholder:text-gray-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!askAiQuery.trim()}
                  aria-label="Apply instruction"
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-lg text-white transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                  style={{ background: "#2175D9" }}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </form>

              <div className="py-1">
                {QUICK_REFINEMENTS.map(({ label, type }) => (
                  <button
                    key={type}
                    onClick={() => onApplyRewrite(type)}
                    className="w-full px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-3 pt-2 pb-2.5 border-t border-gray-100">
                <p className="text-[11px] text-gray-400 mb-1.5">Change tone</p>
                <div className="flex flex-wrap gap-1">
                  {TONES.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => onApplyRewrite("tone", tone)}
                      className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] text-gray-600 hover:border-[#2175D9]/40 hover:text-[#2175D9] hover:bg-[#2175D9]/[0.06] transition cursor-pointer"
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document paper - held to the same max-w-5xl column as the generator
          form, so the draft does not stretch across the whole screen. */}
      <div className="draft-editor-workspace-scroll py-8 px-6 sm:px-10">
        <div className="draft-editor-body w-full max-w-5xl mx-auto bg-white border border-gray-200 rounded-[18px] shadow-xs px-10 py-10">
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



