import { useState, useEffect } from "react";
import { apiUrl } from "../../../config";
import { CustomFolder, SavedDraft } from "../types";
import {
  SYSTEM_FOLDER_NAME,
  DEFAULT_PROMPT_LIBRARY,
  DEFAULT_QUESTIONS_LIBRARY,
} from "../constants";

export interface PromptLibraryItem {
  title: string;
  prompt: string;
}

export function useAnalyzeData(authToken: string) {
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<PromptLibraryItem[]>([]);
  const [questionsLibrary, setQuestionsLibrary] = useState<string[]>([]);

  const fetchFoldersAndDocs = async () => {
    try {
      const [foldersRes, docsRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch(apiUrl("/api/documents"), { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);
      if (!foldersRes.ok || !docsRes.ok) return;

      const foldersData = await foldersRes.json();
      const docsData = await docsRes.json();

      const userFolders = foldersData.filter((f: any) => f.name !== SYSTEM_FOLDER_NAME);

      setFolders((prev) =>
        userFolders.map((f: any) => {
          const existing = prev.find((p) => p.id === f.id);
          const folderDocs = docsData.filter((d: any) => d.folder_id === f.id);
          return {
            id: f.id,
            name: f.name,
            filesCount: folderDocs.length,
            selected: existing?.selected ?? false,
            expanded: existing?.expanded ?? false,
            files: folderDocs.map((d: any) => ({
              id: d.id,
              title: d.title,
              selected:
                existing?.files.find((fi) => fi.id === d.id)?.selected ??
                (existing?.selected ?? false),
            })),
          } as CustomFolder;
        })
      );

      const drafts = docsData.filter((d: any) => d.type === "draft");
      setSavedDrafts((prev) =>
        drafts.map((d: any) => ({
          id: d.id,
          title: d.title,
          selected: prev.find((p) => p.id === d.id)?.selected ?? false,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  const fetchLibraryItems = async () => {
    try {
      const res = await fetch(apiUrl("/api/library-items"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      const prompts = data
        .filter((i: any) => i.type === "prompts")
        .map((p: any) => ({ title: p.name, prompt: p.details }));
      const questions = data
        .filter((i: any) => i.type === "questions")
        .flatMap((q: any) =>
          q.details.split("\n").filter((l: string) => l.trim())
        );

      setPromptLibrary(prompts.length > 0 ? prompts : DEFAULT_PROMPT_LIBRARY);
      setQuestionsLibrary(questions.length > 0 ? questions : DEFAULT_QUESTIONS_LIBRARY);
    } catch (err) {
      console.error("Library items fetch failed", err);
    }
  };

  useEffect(() => {
    fetchFoldersAndDocs();
    fetchLibraryItems();
  }, [authToken]);

  // --- Selection helpers ---
  const toggleFolderSelection = (id: string) => {
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const newSelected = !f.selected;
        return { ...f, selected: newSelected, files: f.files.map((fi) => ({ ...fi, selected: newSelected })) };
      })
    );
  };

  const toggleFolderExpanded = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, expanded: !f.expanded } : f))
    );
  };

  const toggleFileSelection = (folderId: string, fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id !== folderId) return f;
        const updatedFiles = f.files.map((fi) =>
          fi.id === fileId ? { ...fi, selected: !fi.selected } : fi
        );
        const allSelected = updatedFiles.length > 0 && updatedFiles.every((fi) => fi.selected);
        return { ...f, files: updatedFiles, selected: allSelected };
      })
    );
  };

  const toggleDraftSelection = (id: string) => {
    setSavedDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d))
    );
  };

  return {
    folders,
    savedDrafts,
    promptLibrary,
    questionsLibrary,
    fetchFoldersAndDocs,
    toggleFolderSelection,
    toggleFolderExpanded,
    toggleFileSelection,
    toggleDraftSelection,
  };
}
