import React, { useEffect } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

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

const normalizeHtml = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return "<p></p>";
  }

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
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
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: normalizeHtml(content),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "richtext-editor focus:outline-none min-h-[640px] px-1 py-2 text-sm leading-7 text-gray-800",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      if (!onSelectionChange) {
        return;
      }

      const { from, to } = currentEditor.state.selection;
      if (from === to) {
        onSelectionChange(null);
        return;
      }

      const text = currentEditor.state.doc.textBetween(from, to, "\n");
      try {
        const anchor = currentEditor.view.coordsAtPos(from);
        const head = currentEditor.view.coordsAtPos(to);
        onSelectionChange({
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
        onSelectionChange({ from, to, text, rect: null });
      }
    },
  });

  useEffect(() => {
    onEditorReady?.(editor ?? null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = normalizeHtml(content);
    if (nextContent !== editor.getHTML()) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [content, editor]);

  return <EditorContent editor={editor} className={className} />;
}