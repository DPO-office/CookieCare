import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../../../config";
import { DRAFT_STARTER_PROMPTS, type DraftPrompt } from "../constants";

const STORAGE_KEY = "cookiecare_draft_prompts_v1";

function readLocal(): DraftPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is DraftPrompt =>
        p && typeof p.id === "string" && typeof p.title === "string" && typeof p.prompt === "string"
    );
  } catch {
    return [];
  }
}

function writeLocal(items: DraftPrompt[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function isDraftingTag(tags: unknown): boolean {
  const value = Array.isArray(tags) ? tags.join(" ") : String(tags ?? "");
  return value.toLowerCase().includes("drafting");
}

export function useDraftPromptLibrary(authToken: string) {
  const [customPrompts, setCustomPrompts] = useState<DraftPrompt[]>(() => readLocal());

  const persist = useCallback((next: DraftPrompt[]) => {
    setCustomPrompts(next);
    writeLocal(next);
  }, []);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/library-items"), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || cancelled) return;
        const remote: DraftPrompt[] = data
          .filter((i: { type?: string; tags?: unknown }) => i.type === "prompts" && isDraftingTag(i.tags))
          .map((i: { id: string; name: string; details: string }) => ({
            id: i.id,
            title: i.name,
            prompt: i.details,
          }));
        if (remote.length === 0) return;
        const local = readLocal();
        const byTitle = new Map(local.map((p) => [p.title.toLowerCase(), p]));
        for (const item of remote) {
          if (!byTitle.has(item.title.toLowerCase())) byTitle.set(item.title.toLowerCase(), item);
        }
        persist([...byTitle.values()]);
      } catch {
        // Demo / SKIP_DB: local prompts still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, persist]);

  const addPrompt = useCallback(
    async (title: string, prompt: string) => {
      const trimmedTitle = title.trim();
      const trimmedPrompt = prompt.trim();
      if (!trimmedTitle || !trimmedPrompt) return null;

      const localItem: DraftPrompt = {
        id: `draft_custom_${Date.now()}`,
        title: trimmedTitle,
        prompt: trimmedPrompt,
      };
      persist([localItem, ...customPrompts]);

      try {
        const res = await fetch(apiUrl("/api/library-items"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type: "prompts",
            name: trimmedTitle,
            description: trimmedTitle,
            tags: "drafting",
            details: trimmedPrompt,
          }),
        });
        if (res.ok) {
          const row = await res.json();
          if (row?.id) {
            const synced = { ...localItem, id: row.id };
            persist([synced, ...customPrompts.filter((p) => p.id !== localItem.id)]);
            return synced;
          }
        }
      } catch {
        // Keep the locally saved prompt.
      }
      return localItem;
    },
    [authToken, customPrompts, persist]
  );

  const removePrompt = useCallback(
    async (id: string) => {
      persist(customPrompts.filter((p) => p.id !== id));
      if (!id.startsWith("lib_")) return;
      try {
        await fetch(apiUrl(`/api/library-items/${id}`), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } catch {
        // Local removal is enough for demo mode.
      }
    },
    [authToken, customPrompts, persist]
  );

  return {
    starterPrompts: DRAFT_STARTER_PROMPTS,
    customPrompts,
    addPrompt,
    removePrompt,
  };
}
