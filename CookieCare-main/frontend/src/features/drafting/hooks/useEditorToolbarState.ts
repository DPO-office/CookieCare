import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

/** Re-render toolbar when editor selection or content changes. */
export function useEditorToolbarState(editor: Editor | null) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => setTick((t) => t + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  return editor;
}
