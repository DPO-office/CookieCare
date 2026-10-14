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
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
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
  { label: "Mona Sans", value: '"Mona Sans", ui-sans-serif, system-ui, sans-serif' },
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
      className={`draft-toolbar-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "bg-[#0F172A] text-white"
          : "text-[#64748B] hover:bg-white hover:text-[#0F172A]"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="draft-toolbar-group">{children}</div>;
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
  if (!editor.view) return "Times New Roman, Times, serif";
  const attrs = editor.getAttributes("textStyle");
  return attrs.fontFamily || "Times New Roman, Times, serif";
}

function getActiveFontSize(editor: Editor): string {
  if (!editor.view) return "12pt";
  const attrs = editor.getAttributes("textStyle");
  return attrs.fontSize || "12pt";
}

function getActiveBlockStyle(editor: Editor): string {
  if (!editor.view) return "paragraph";
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
}

function getActiveColor(editor: Editor): string {
  if (!editor.view) return "#111827";
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

  // An editor instance is only safe to query when it exists AND its ProseMirror
  // view is mounted. During streaming or content updates the view can briefly be
  // null even while the editor object is non-null.
  const editorReady = !!(editor && editor.view);
  const disabled = !editorReady;

  // Safe wrapper around editor.can() — Tiptap throws if view is null
  const safeCanUndo = (): boolean => {
    if (!editorReady) return false;
    try { return editor!.can().undo(); } catch { return false; }
  };
  const safeCanRedo = (): boolean => {
    if (!editorReady) return false;
    try { return editor!.can().redo(); } catch { return false; }
  };

  const sync = () => {
    if (editorReady) onSetEditorContent(editor!.getHTML());
  };

  const run = (fn: () => void) => {
    if (!editorReady) return;
    fn();
    sync();
  };

  const isActive = (type: string | Record<string, unknown>, attrs?: object) => {
    if (!editorReady) return false;
    try {
      return typeof type === "string"
        ? (editor!.isActive(type, attrs) ?? false)
        : (editor!.isActive(type) ?? false);
    } catch { return false; }
  };

  const applyBlockStyle = (value: string) => {
    if (!editorReady) return;
    const chain = editor.chain().focus();
    if (value === "paragraph") chain.setParagraph().run();
    else if (value === "h1") chain.toggleHeading({ level: 1 }).run();
    else if (value === "h2") chain.toggleHeading({ level: 2 }).run();
    else if (value === "h3") chain.toggleHeading({ level: 3 }).run();
    sync();
  };

  const setLink = () => {
    if (!editorReady) return;
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
    if (!editorReady) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
    sync();
  };

  return (
    <div className="draft-toolbar relative z-30 shrink-0 overflow-visible select-none">
      <div className="draft-toolbar-row">
        <Group>
        <TBtn
          disabled={disabled || !safeCanUndo()}
          onClick={() => run(() => editor!.chain().focus().undo().run())}
          title="Undo"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled || !safeCanRedo()}
          onClick={() => run(() => editor!.chain().focus().redo().run())}
          title="Redo"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </TBtn>
        <TBtn
          disabled={disabled}
          onClick={() => {
            onPushUndoSnapshot(editorContent);
            if (editorReady) {
              editor!.chain().focus().clearContent().run();
              sync();
            } else {
              onSetEditorContent("<p></p>");
            }
          }}
          title="Clear document"
        >
          <Eraser className="w-3.5 h-3.5" />
        </TBtn>
        </Group>

        <Group>
        <ToolbarDropdown
          value={editorReady ? getActiveFontFamily(editor!) : FONT_FAMILIES[0].value}
          label="Font family"
          minWidth="132px"
          disabled={disabled}
          options={FONT_FAMILIES}
          onChange={(v) => run(() => editor!.chain().focus().setFontFamily(v).run())}
        />

        <ToolbarDropdown
          value={editorReady ? getActiveFontSize(editor!) : "12pt"}
          label="Font size"
          minWidth="52px"
          disabled={disabled}
          options={FONT_SIZES.map((s) => ({ label: s.replace("pt", ""), value: s }))}
          onChange={(v) => run(() => editor!.chain().focus().setFontSize(v).run())}
        />

        <ToolbarDropdown
          value={editorReady ? getActiveBlockStyle(editor!) : "paragraph"}
          label="Block style"
          minWidth="96px"
          disabled={disabled}
          options={BLOCK_STYLES}
          onChange={(v) => applyBlockStyle(v)}
        />
        </Group>

        <Group>
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
            className="draft-toolbar-btn flex h-8 w-8 flex-col items-center justify-center rounded-lg text-[#64748B] transition-all hover:bg-white hover:text-[#0F172A] disabled:opacity-35"
          >
            <span className="text-[11px] font-bold leading-none">A</span>
            <span
              className="w-3.5 h-[2.5px] rounded-full mt-0.5"
              style={{ background: editorReady ? getActiveColor(editor!) : "#0F172A" }}
            />
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="sr-only"
            value={editorReady ? getActiveColor(editor!) : "#0F172A"}
            onChange={(e) =>
              run(() => editor!.chain().focus().setColor(e.target.value).run())
            }
          />
        </div>
        </Group>

        <Group>
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
        </Group>

        <Group>
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
        </Group>

        <Group>
        <ToolbarDropdown
          value="insert"
          label="Insert"
          minWidth="88px"
          disabled={disabled}
          options={[
            { label: "Insert", value: "insert" },
            { label: "Link", value: "link" },
            { label: "Table", value: "table" },
            { label: "Divider", value: "hr" },
            { label: "Disclaimer", value: "disclaimer" },
            { label: "Increase indent", value: "indent" },
            { label: "Decrease indent", value: "outdent" },
          ]}
          onChange={(v) => {
            if (v === "link") setLink();
            if (v === "table") insertTable();
            if (v === "hr") run(() => editor!.chain().focus().setHorizontalRule().run());
            if (v === "disclaimer") onToolbarFormat("disclaimer");
            if (v === "indent") run(() => editor!.chain().focus().sinkListItem("listItem").run());
            if (v === "outdent") run(() => editor!.chain().focus().liftListItem("listItem").run());
          }}
        />
        </Group>
      </div>
    </div>
  );
}
