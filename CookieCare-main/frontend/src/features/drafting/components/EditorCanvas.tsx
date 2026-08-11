import React, { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ArrowUp,
  X,
  Bold,
  Italic,
  Underline,
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
const TOOLBAR_HEIGHT = 44;
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
  /** When true, renders only the editor without outer scroll/paper chrome. */
  embedded?: boolean;
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
  embedded = false,
}: EditorCanvasProps) {
  const [, setFormatTick] = useState(0);
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
    setFormatTick((t) => t + 1);
  };

  const isMarkActive = (mark: "bold" | "italic" | "underline") =>
    tiptapEditorRef.current?.isActive(mark) ?? false;

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
    <div className={embedded ? "relative w-full" : "flex-1 relative overflow-y-auto bg-[#F7F8FA]"}>

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
          {/* Floating selection toolbar */}
          <div className="draft-selection-toolbar select-none">
            <div className="draft-selection-toolbar-inner">
              {[
                { icon: Bold, mark: "bold" as const, command: "toggleBold" as const, title: "Bold" },
                { icon: Italic, mark: "italic" as const, command: "toggleItalic" as const, title: "Italic" },
                { icon: Underline, mark: "underline" as const, command: "toggleUnderline" as const, title: "Underline" },
              ].map(({ icon: Icon, mark, command, title }) => (
                <button
                  key={mark}
                  type="button"
                  title={title}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleMark(command)}
                  className={`draft-selection-format-btn ${isMarkActive(mark) ? "active" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
                </button>
              ))}

              <span className="draft-selection-divider" aria-hidden />

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const next = isAiPanelOpen ? null : "main";
                  onSetActiveDropdown(next);
                }}
                className={`draft-selection-ai-btn ${isAiPanelOpen ? "open" : ""}`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" strokeWidth={2} />
                <span>Ask AI</span>
                <ChevronDown
                  className={`w-3 h-3 opacity-80 transition-transform duration-200 ${isAiPanelOpen ? "rotate-180" : ""}`}
                  strokeWidth={2.25}
                />
              </button>

              <span className="draft-selection-divider" aria-hidden />

              <button
                type="button"
                onClick={closeMenu}
                aria-label="Dismiss"
                className="draft-selection-close-btn"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Refinement panel */}
          {isAiPanelOpen && (
            <div className="draft-selection-panel">
              <form
                onSubmit={(e) => { e.preventDefault(); submitAskAi(); }}
                className="draft-selection-panel-input-row"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" strokeWidth={2} />
                <input
                  autoFocus
                  type="text"
                  value={askAiQuery}
                  onChange={(e) => onSetAskAiQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeMenu(); }}
                  placeholder="Tell the AI how to rewrite this…"
                  className="draft-selection-panel-input"
                />
                <button
                  type="submit"
                  disabled={!askAiQuery.trim()}
                  aria-label="Apply instruction"
                  className="draft-selection-panel-send"
                >
                  <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.25} />
                </button>
              </form>

              <div className="py-1">
                {QUICK_REFINEMENTS.map(({ label, type }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onApplyRewrite(type)}
                    className="draft-selection-panel-item"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="draft-selection-panel-tones">
                <p className="draft-selection-panel-tones-label">Change tone</p>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => onApplyRewrite("tone", tone)}
                      className="draft-selection-tone-chip"
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
      {embedded ? (
        <RichTextEditor
          content={editorContent}
          readOnly={isFullySigned}
          onChange={onEditorChange}
          onEditorReady={onEditorReady}
          onSelectionChange={onSelectionChange}
          className="w-full"
        />
      ) : (
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
      )}
    </div>
  );
}



