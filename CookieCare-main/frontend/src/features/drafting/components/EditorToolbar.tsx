import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
  AlignJustify,
  Link2,
  ChevronDown,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { useEditorToolbarState } from "../hooks/useEditorToolbarState";

interface EditorToolbarProps {
  editor: Editor | null;
  editorContent: string;
  onSetEditorContent: (content: string) => void;
  onInsertHtml: (html: string) => void;
  onToolbarFormat: (action: string) => void;
  onPushUndoSnapshot: (snapshot: string) => void;
}

const FONT_FAMILIES = [
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Courier New", value: "Courier New, monospace" },
];

const FONT_SIZES = ["10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt"];

const BLOCK_STYLES = [
  { label: "Paragraph", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
];

const TEXT_COLORS = [
  "#111827",
  "#374151",
  "#DC2626",
  "#2563EB",
  "#059669",
  "#7C3AED",
];

function TBtn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`draft-toolbar-btn flex items-center justify-center w-7 h-7 rounded-md transition-all text-sm shrink-0 disabled:opacity-35 disabled:cursor-not-allowed ${
        active
          ? "bg-[#111827] text-white shadow-sm"
          : "text-[#6B7280] hover:bg-white hover:text-[#111827] hover:shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-4 bg-[#E5E7EB] mx-0.5 shrink-0" />;
}

function ToolbarDropdown({
  value,
  label,
  options,
  minWidth,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  options: { label: string; value: string }[];
  minWidth?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const reposition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={`draft-toolbar-dropdown ${open ? "open" : ""}`}
      style={{ minWidth }}
    >
      <button
        type="button"
        disabled={disabled}
        title={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`draft-toolbar-dropdown-trigger w-full ${open ? "open" : ""}`}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown
          className={`draft-toolbar-dropdown-chevron w-3 h-3 shrink-0 ${open ? "open" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="draft-toolbar-dropdown-menu"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.width,
              zIndex: 9999,
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`draft-toolbar-dropdown-item ${opt.value === value ? "active" : ""}`}
                style={label === "Font family" ? { fontFamily: opt.value } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function getActiveFontFamily(editor: Editor): string {
  const attrs = editor.getAttributes("textStyle");
  return attrs.fontFamily || "Times New Roman, Times, serif";
}

function getActiveFontSize(editor: Editor): string {
  const attrs = editor.getAttributes("textStyle");
  return attrs.fontSize || "12pt";
}

function getActiveBlockStyle(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
}

function getActiveColor(editor: Editor): string {
  return editor.getAttributes("textStyle").color || "#111827";
}

export default function EditorToolbar({
  editor: editorProp,
  editorContent,
  onSetEditorContent,
  onInsertHtml,
  onToolbarFormat,
  onPushUndoSnapshot,
}: EditorToolbarProps) {
  const editor = useEditorToolbarState(editorProp);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const disabled = !editor;

  const sync = () => {
    if (editor) onSetEditorContent(editor.getHTML());
  };

  const run = (fn: () => void) => {
    if (!editor) return;
    fn();
    sync();
  };

  const isActive = (type: string | Record<string, unknown>, attrs?: object) =>
    typeof type === "string"
      ? (editor?.isActive(type, attrs) ?? false)
      : (editor?.isActive(type) ?? false);

  const applyBlockStyle = (value: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (value === "paragraph") chain.setParagraph().run();
    else if (value === "h1") chain.toggleHeading({ level: 1 }).run();
    else if (value === "h2") chain.toggleHeading({ level: 2 }).run();
    else if (value === "h3") chain.toggleHeading({ level: 3 }).run();
    sync();
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    sync();
  };

  const insertTable = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
    sync();
  };

  return (
    <div className="draft-toolbar shrink-0 select-none border-b border-[#ECECEC] bg-[#F9FAFB] overflow-visible relative z-30">
      <div className="flex items-center gap-0.5 px-3 py-2 overflow-x-auto">
        <TBtn
          disabled={disabled || !editor?.can().undo()}
          onClick={() => run(() => editor!.chain().focus().undo().run())}
          title="Undo"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled || !editor?.can().redo()}
          onClick={() => run(() => editor!.chain().focus().redo().run())}
          title="Redo"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => {
            onPushUndoSnapshot(editorContent);
            if (editor) {
              editor.chain().focus().clearContent().run();
              sync();
            } else {
              onSetEditorContent("<p></p>");
            }
          }}
          title="Clear document"
        >
          <Eraser className="w-3.5 h-3.5" />
        </TBtn>

        <Divider />

        <ToolbarDropdown
          value={editor ? getActiveFontFamily(editor) : FONT_FAMILIES[0].value}
          label="Font family"
          minWidth="132px"
          disabled={disabled}
          options={FONT_FAMILIES}
          onChange={(v) => run(() => editor!.chain().focus().setFontFamily(v).run())}
        />

        <ToolbarDropdown
          value={editor ? getActiveFontSize(editor) : "12pt"}
          label="Font size"
          minWidth="52px"
          disabled={disabled}
          options={FONT_SIZES.map((s) => ({ label: s.replace("pt", ""), value: s }))}
          onChange={(v) => run(() => editor!.chain().focus().setFontSize(v).run())}
        />

        <ToolbarDropdown
          value={editor ? getActiveBlockStyle(editor) : "paragraph"}
          label="Block style"
          minWidth="96px"
          disabled={disabled}
          options={BLOCK_STYLES}
          onChange={(v) => applyBlockStyle(v)}
        />

        <Divider />

        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().toggleBold().run())}
          title="Bold"
          active={isActive("bold")}
        >
          <Bold className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().toggleItalic().run())}
          title="Italic"
          active={isActive("italic")}
        >
          <Italic className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().toggleUnderline().run())}
          title="Underline"
          active={isActive("underline")}
        >
          <Underline className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().toggleStrike().run())}
          title="Strikethrough"
          active={isActive("strike")}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </TBtn>

        <div className="relative shrink-0">
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => colorInputRef.current?.click()}
            title="Text color"
            className="draft-toolbar-btn flex flex-col items-center justify-center w-7 h-7 rounded-md text-[#6B7280] hover:bg-white hover:shadow-sm transition-all disabled:opacity-35"
          >
            <span className="text-[11px] font-bold leading-none">A</span>
            <span
              className="w-3.5 h-[2.5px] rounded-full mt-0.5"
              style={{ background: editor ? getActiveColor(editor) : "#111827" }}
            />
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="sr-only"
            value={editor ? getActiveColor(editor) : "#111827"}
            onChange={(e) =>
              run(() => editor!.chain().focus().setColor(e.target.value).run())
            }
          />
          <div className="absolute top-full left-0 mt-1 hidden group-hover:flex gap-1 p-1 bg-white border rounded-lg shadow-lg z-10">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-4 h-4 rounded-full border border-black/10"
                style={{ background: c }}
                onClick={() => run(() => editor!.chain().focus().setColor(c).run())}
              />
            ))}
          </div>
        </div>

        <Divider />

        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().setTextAlign("left").run())}
          title="Align left"
          active={isActive({ textAlign: "left" })}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().setTextAlign("center").run())}
          title="Align center"
          active={isActive({ textAlign: "center" })}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().setTextAlign("right").run())}
          title="Align right"
          active={isActive({ textAlign: "right" })}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().setTextAlign("justify").run())}
          title="Justify"
          active={isActive({ textAlign: "justify" })}
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </TBtn>

        <Divider />

        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().toggleBulletList().run())}
          title="Bullet list"
          active={isActive("bulletList")}
        >
          <List className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().toggleOrderedList().run())}
          title="Numbered list"
          active={isActive("orderedList")}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().liftListItem("listItem").run())}
          title="Outdent"
        >
          <Outdent className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().sinkListItem("listItem").run())}
          title="Indent"
        >
          <Indent className="w-3.5 h-3.5" />
        </TBtn>

        <Divider />

        <TBtn disabled={disabled} onClick={setLink} title="Insert link" active={isActive("link")}>
          <Link2 className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn disabled={disabled} onClick={insertTable} title="Insert table">
          <Table className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => run(() => editor!.chain().focus().setHorizontalRule().run())}
          title="Insert divider"
        >
          <Minus className="w-3.5 h-3.5" />
        </TBtn>

        <Divider />

        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToolbarFormat("disclaimer")}
          className="h-7 px-2.5 text-[11px] font-medium text-[#6B7280] hover:text-[#111827] hover:bg-white border border-[#E5E7EB] rounded-md transition-all shrink-0 disabled:opacity-35"
        >
          Disclaimer
        </button>
      </div>
    </div>
  );
}
