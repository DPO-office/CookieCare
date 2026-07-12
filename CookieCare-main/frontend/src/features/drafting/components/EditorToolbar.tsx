import React from "react";
import {
  Undo2,
  Redo2,
  Eraser,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Outdent,
  Indent,
  Table,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

interface EditorToolbarProps {
  tiptapEditor: Editor | null;
  editorContent: string;
  onUndo: () => void;
  onRedo: () => void;
  onSetEditorContent: (content: string) => void;
  onInsertHtml: (html: string) => void;
  onToolbarFormat: (action: string) => void;
  onPushUndoSnapshot: (snapshot: string) => void;
  // These remain in the interface for compatibility but actions live in the header
  onCopy?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  isFullySigned?: boolean;
}

function TBtn({
  onClick,
  title,
  active,
  children,
  className = "",
}: {
  onClick: () => void;
  title?: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors text-sm shrink-0
        ${
          active
            ? "bg-gray-900 text-white"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        } ${className}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-4 bg-gray-200 mx-1 shrink-0" />;
}

function ToolSelect({
  children,
  minWidth,
  onChange,
}: {
  children: React.ReactNode;
  minWidth?: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="relative flex items-center shrink-0">
      <select
        onChange={onChange}
        className="h-7 appearance-none bg-gray-50 border border-gray-200 text-gray-600 text-[11px] font-medium rounded-lg pl-2.5 pr-6 focus:outline-none focus:border-gray-300 cursor-pointer hover:border-gray-300 transition-colors"
        style={{ minWidth: minWidth ?? "auto" }}
      >
        {children}
      </select>
      <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 pointer-events-none" />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function EditorToolbar({
  tiptapEditor,
  editorContent,
  onUndo,
  onRedo,
  onSetEditorContent,
  onInsertHtml,
  onToolbarFormat,
  onPushUndoSnapshot,
}: EditorToolbarProps) {
  const run = (fn: () => void) => {
    fn();
    if (tiptapEditor) onSetEditorContent(tiptapEditor.getHTML());
  };

  const isActive = (type: string, attrs?: object) =>
    tiptapEditor?.isActive(type, attrs) ?? false;

  return (
    <div className="border-b border-gray-200 bg-white shrink-0 select-none">
      <div className="flex items-center gap-0.5 px-4 py-2 overflow-x-auto">
        <TBtn onClick={onUndo} title="Undo"><Undo2 className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={onRedo} title="Redo"><Redo2 className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => { onPushUndoSnapshot(editorContent); if (tiptapEditor) { tiptapEditor.chain().focus().clearContent().run(); onSetEditorContent(tiptapEditor.getHTML()); } else { onSetEditorContent("<p></p>"); } }} title="Clear document" className="hover:bg-rose-50 hover:!text-rose-500">
          <Eraser className="w-3.5 h-3.5" />
        </TBtn>
        <Divider />
        <ToolSelect minWidth="110px" onChange={(e) => { if (!tiptapEditor) return; const val = e.target.value; if (val === "p") tiptapEditor.chain().focus().setParagraph().run(); else if (val === "h1") tiptapEditor.chain().focus().toggleHeading({ level: 1 }).run(); else if (val === "h2") tiptapEditor.chain().focus().toggleHeading({ level: 2 }).run(); else if (val === "h3") tiptapEditor.chain().focus().toggleHeading({ level: 3 }).run(); onSetEditorContent(tiptapEditor.getHTML()); }}>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </ToolSelect>
        <div className="ml-1">
          <ToolSelect minWidth="72px" onChange={() => {}}>
            <option>Default</option>
            <option>Small</option>
            <option>Large</option>
          </ToolSelect>
        </div>
        <Divider />
        <TBtn onClick={() => onToolbarFormat("bold")} title="Bold" active={isActive("bold")}><Bold className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().toggleItalic().run())} title="Italic" active={isActive("italic")}><Italic className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().toggleUnderline().run())} title="Underline" active={isActive("underline")}><Underline className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().toggleStrike().run())} title="Strikethrough" active={isActive("strike")}><Strikethrough className="w-3.5 h-3.5" /></TBtn>
        <button type="button" onMouseDown={(e) => e.preventDefault()} title="Text color" className="flex flex-col items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
          <span className="text-[11px] font-bold text-gray-600 leading-none">A</span>
          <span className="w-3.5 h-[2.5px] rounded-full bg-gray-900 mt-0.5" />
        </button>
        <Divider />
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().setTextAlign("left").run())} title="Align left" active={isActive({ textAlign: "left" })}><AlignLeft className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().setTextAlign("center").run())} title="Align center" active={isActive({ textAlign: "center" })}><AlignCenter className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().setTextAlign("right").run())} title="Align right" active={isActive({ textAlign: "right" })}><AlignRight className="w-3.5 h-3.5" /></TBtn>
        <Divider />
        <TBtn onClick={() => onToolbarFormat("list")} title="Bullet list" active={isActive("bulletList")}><List className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().toggleOrderedList().run())} title="Numbered list" active={isActive("orderedList")}><ListOrdered className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().liftListItem("listItem").run())} title="Outdent"><Outdent className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => run(() => tiptapEditor?.chain().focus().sinkListItem("listItem").run())} title="Indent"><Indent className="w-3.5 h-3.5" /></TBtn>
        <Divider />
        <TBtn onClick={() => onInsertHtml("<table><tbody><tr><td>Column 1</td><td>Column 2</td></tr><tr><td></td><td></td></tr></tbody></table>")} title="Insert table"><Table className="w-3.5 h-3.5" /></TBtn>
        <TBtn onClick={() => onInsertHtml("<hr />")} title="Insert divider"><Minus className="w-3.5 h-3.5" /></TBtn>
        <Divider />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onToolbarFormat("disclaimer")} className="h-7 px-2.5 text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors shrink-0">
          Disclaimer
        </button>
      </div>
    </div>
  );
}
