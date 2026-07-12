import React, { useEffect, useRef } from "react";
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

/**
 * Normalise any string to HTML suitable for TipTap's setContent.
 * - Already-HTML strings are passed through unchanged.
 * - Plain-text strings are wrapped in <p> tags per paragraph.
 */
const normalizeHtml = (content: string): string => {
  const trimmed = content.trim();
  if (!trimmed) return "<p></p>";

  // If content already contains HTML tags, return as-is.
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;

  // Plain text fallback: escape and wrap paragraphs.
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
  // Stable refs so useEditor callbacks never become stale closures
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onEditorReadyRef = useRef(onEditorReady);

  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; });
  useEffect(() => { onEditorReadyRef.current = onEditorReady; });

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: normalizeHtml(content),
    editable: !readOnly,
    editorProps: {
      attributes: {
        // px-0 / py-0 — padding lives on the .draft-editor-body card, not here.
        // text-[15px] overrides Tailwind's text-sm (14px) to match the CSS variable.
        // leading-[1.85] gives legal-document-quality line rhythm.
        class:
          "richtext-editor focus:outline-none min-h-[70vh] text-[15px] leading-[1.85] text-[#1a2234]",
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

  // Notify parent once the editor instance is available (fires once on mount).
  const editorReadyFiredRef = useRef(false);
  useEffect(() => {
    if (editor && !editorReadyFiredRef.current) {
      editorReadyFiredRef.current = true;
      onEditorReadyRef.current?.(editor);
    }
    // If editor is destroyed and recreated, reset so the new instance is reported.
    if (!editor) editorReadyFiredRef.current = false;
  }, [editor]);

  // Sync editor when parent `content` prop changes (e.g. doc switch or AI generation).
  // Uses emitUpdate: false to avoid triggering the onChange → parent re-render loop.
  useEffect(() => {
    if (!editor) return;
    const next = normalizeHtml(content);
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [content, editor]);

  // Keep the editable flag in sync with the readOnly prop.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly, false);
  }, [readOnly, editor]);

  return <EditorContent editor={editor} className={className} />;
}