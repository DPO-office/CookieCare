import React, { useEffect, useRef } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, FontFamily, FontSize, Color } from "@tiptap/extension-text-style";
import Link from "@tiptap/extension-link";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

export interface RichTextSelectionSnapshot {
  from: number;
  to: number;
  text: string;
  rect: DOMRect | null;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onSelectionChange?: (selection: RichTextSelectionSnapshot | null) => void;
  onEditorReady?: (editor: Editor | null) => void;
  readOnly?: boolean;
  className?: string;
}

const normalizeHtml = (content: string): string => {
  const trimmed = content.trim();
  if (!trimmed) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;

  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
    .join("");
};

export default function RichTextEditor({
  content,
  onChange,
  onSelectionChange,
  onEditorReady,
  readOnly = false,
  className = "",
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onEditorReadyRef = useRef(onEditorReady);

  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; });
  useEffect(() => { onEditorReadyRef.current = onEditorReady; });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "draft-editor-link" },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: normalizeHtml(content),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "richtext-editor focus:outline-none min-h-[60vh] text-[12pt] leading-[1.65] text-[#111827]",
      },
    },
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getHTML());
    },
    onSelectionUpdate: ({ editor: e }) => {
      const handler = onSelectionChangeRef.current;
      if (!handler) return;

      const { from, to } = e.state.selection;
      if (from === to) {
        handler(null);
        return;
      }

      const text = e.state.doc.textBetween(from, to, "\n");
      try {
        const anchor = e.view.coordsAtPos(from);
        const head = e.view.coordsAtPos(to);
        handler({
          from,
          to,
          text,
          rect: new DOMRect(
            anchor.left,
            anchor.top,
            Math.max(1, head.right - anchor.left),
            Math.max(1, head.bottom - anchor.top)
          ),
        });
      } catch {
        handler({ from, to, text, rect: null });
      }
    },
  });

  const editorReadyFiredRef = useRef(false);
  useEffect(() => {
    if (editor && !editorReadyFiredRef.current) {
      editorReadyFiredRef.current = true;
      onEditorReadyRef.current?.(editor);
    }
    if (!editor) editorReadyFiredRef.current = false;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const next = normalizeHtml(content);
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly, false);
  }, [readOnly, editor]);

  return <EditorContent editor={editor} className={className} />;
}
