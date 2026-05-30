import React, { forwardRef, useEffect, useImperativeHandle } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

export interface DraftRichEditorHandle {
  getEditor: () => Editor | null;
}

interface DraftRichEditorProps {
  content: string;
  disabled?: boolean;
  onChange: (html: string) => void;
  onSelectionChange?: (selection: { start: number; end: number } | null) => void;
  onReady?: (editor: Editor | null) => void;
}

const DraftRichEditor = forwardRef<DraftRichEditorHandle, DraftRichEditorProps>(
  ({ content, disabled = false, onChange, onSelectionChange, onReady }, ref) => {
    const editor = useEditor({
      extensions: [StarterKit, Underline],
      editorProps: {
        attributes: {
          class:
            "w-full flex-1 min-h-[640px] border-0 outline-none focus:ring-0 text-sm font-sans tracking-wide leading-relaxed text-gray-800 placeholder-gray-300 bg-transparent prose max-w-none",
        },
      },
      content: content || "<p></p>",
      editable: !disabled,
      onUpdate({ editor }) {
        onChange(editor.getHTML());
      },
      onSelectionUpdate({ editor }) {
        const { from, to } = editor.state.selection;
        onSelectionChange?.(from === to ? null : { start: from, end: to });
      },
      immediatelyRender: false,
    });

    useImperativeHandle(ref, () => ({
      getEditor: () => editor ?? null,
    }));

    useEffect(() => {
      onReady?.(editor ?? null);
    }, [editor, onReady]);

    useEffect(() => {
      if (!editor) return;
      const currentHtml = editor.getHTML();
      if ((content || "<p></p>") !== currentHtml) {
        editor.commands.setContent(content || "<p></p>", { emitUpdate: false });
      }
    }, [content, editor]);

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
    }, [disabled, editor]);

    return <EditorContent editor={editor} />;
  },
);

DraftRichEditor.displayName = "DraftRichEditor";

export default DraftRichEditor;
