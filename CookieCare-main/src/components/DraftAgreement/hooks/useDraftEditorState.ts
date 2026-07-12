import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { LegalDocument } from "../../../types";
import { markdownToHtml } from "../../../utils/markdownToHtml";

export function useDraftEditorState(documents: LegalDocument[], initialDocumentId?: string) {
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument | null>(documents[0] || null);
  const [editorContent, setEditorContent] = useState(() => {
    if (!documents[0]?.content) return "";
    const raw = documents[0].content;
    return /<[a-z][\s\S]*>/i.test(raw.trim()) ? raw : markdownToHtml(raw);
  });
  const [isGeneratorActive, setIsGeneratorActive] = useState(!documents[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState("");

  const tiptapEditorRef = useRef<Editor | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);

  // When an initialDocumentId is provided, pre-select that document
  useEffect(() => {
    if (!initialDocumentId) return;
    const target = documents.find((d) => d.id === initialDocumentId);
    if (target) {
      setSelectedDoc(target);
      const raw = target.content || "";
      const isHtml = /<[a-z][\s\S]*>/i.test(raw.trim());
      setEditorContent(isHtml ? raw : markdownToHtml(raw));
      setIsGeneratorActive(false);
    }
  }, [initialDocumentId, documents]);

  // Sync editor if document selection changes
  useEffect(() => {
    if (selectedDoc) {
      const raw = selectedDoc.content || "";
      const isHtml = /<[a-z][\s\S]*>/i.test(raw.trim());
      setEditorContent(isHtml ? raw : markdownToHtml(raw));
      setIsGeneratorActive(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
    }
  }, [selectedDoc]);

  const pushUndoSnapshot = (snapshot: string) => {
    if (undoStackRef.current[0] !== snapshot) {
      undoStackRef.current = [snapshot, ...undoStackRef.current].slice(0, 50);
    }
    redoStackRef.current = [];
  };

  const handleUndo = () => {
    const editor = tiptapEditorRef.current;
    if (editor) {
      editor.chain().focus().undo().run();
      setEditorContent(editor.getHTML());
      return;
    }
    const previous = undoStackRef.current[0];
    if (previous === undefined) return;
    redoStackRef.current = [editorContent, ...redoStackRef.current].slice(0, 50);
    undoStackRef.current = undoStackRef.current.slice(1);
    setEditorContent(previous);
  };

  const handleRedo = () => {
    const editor = tiptapEditorRef.current;
    if (editor) {
      editor.chain().focus().redo().run();
      setEditorContent(editor.getHTML());
      return;
    }
    const next = redoStackRef.current[0];
    if (next === undefined) return;
    undoStackRef.current = [editorContent, ...undoStackRef.current].slice(0, 50);
    redoStackRef.current = redoStackRef.current.slice(1);
    setEditorContent(next);
  };

  const insertHtmlAtCursor = (html: string) => {
    const editor = tiptapEditorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(html).run();
    setEditorContent(editor.getHTML());
  };

  const handleToolbarFormat = (action: string) => {
    const editor = tiptapEditorRef.current;
    if (!editor) return;
    if (action === "h1") {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    } else if (action === "h2") {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    } else if (action === "bold") {
      editor.chain().focus().toggleBold().run();
    } else if (action === "list") {
      editor.chain().focus().toggleBulletList().run();
    } else if (action === "disclaimer") {
      editor
        .chain()
        .focus()
        .insertContent(
          "<p><em>COMPLIANCE DISCLAIMER: This clause represents vetted statutory privacy rules and does not alternate professional legal vetting.</em></p>"
        )
        .run();
    } else if (action === "signature-block") {
      const cryptoStamp = Array.from(window.crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      editor
        .chain()
        .focus()
        .insertContent(
          `<p><strong>[EXECUTED SIGNATURE SPECIFICATION]</strong><br>Approved legal representative: Lexify Workspace<br>Crypto Seal Identifier: STAMP_${cryptoStamp}_SECURE<br>Date: ${new Date().toLocaleDateString()}</p>`
        )
        .run();
    }
    setEditorContent(editor.getHTML());
  };

  return {
    selectedDoc,
    setSelectedDoc,
    editorContent,
    setEditorContent,
    isGeneratorActive,
    setIsGeneratorActive,
    isSaving,
    setIsSaving,
    savingMsg,
    setSavingMsg,
    tiptapEditorRef,
    undoStackRef,
    redoStackRef,
    pushUndoSnapshot,
    handleUndo,
    handleRedo,
    insertHtmlAtCursor,
    handleToolbarFormat,
  };
}
