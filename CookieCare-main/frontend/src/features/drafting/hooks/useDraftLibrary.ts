import { useEffect, useState } from "react";
import { apiUrl } from "../../../config";

export interface DraftLibraryItem {
  id: string;
  name: string;
  description: string;
  details: string;
}

function asDetails(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return "";
    }
  }
  return "";
}

export function useDraftLibrary(authToken: string) {
  const [templates, setTemplates] = useState<DraftLibraryItem[]>([]);
  const [clauses, setClauses] = useState<DraftLibraryItem[]>([]);
  const [playbooks, setPlaybooks] = useState<DraftLibraryItem[]>([]);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(apiUrl("/api/library-items"), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;

        const mapItem = (i: any): DraftLibraryItem => ({
          id: String(i.id),
          name: String(i.name || "Untitled"),
          description: String(i.description || ""),
          details: asDetails(i.details),
        });

        setTemplates(data.filter((i: any) => i.type === "templates").map(mapItem));
        setClauses(data.filter((i: any) => i.type === "clauses").map(mapItem));
        setPlaybooks(
          data
            .filter((i: any) => i.type === "rulebook" || i.type === "playbook")
            .map(mapItem)
        );
      } catch (err) {
        console.error("Draft library fetch failed", err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  return { templates, clauses, playbooks };
}
