import { useEffect, useState } from "react";
import { fetchLibraryItems } from "../../vault/api/vaultApi";

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

const mapItem = (i: any): DraftLibraryItem => ({
  id: String(i.id),
  name: String(i.name || "Untitled"),
  description: String(i.description || ""),
  details: asDetails(i.details),
});

export interface DraftLibraryData {
  // Combined (private + org) — used for resolving selected items by ID
  templates: DraftLibraryItem[];
  clauses: DraftLibraryItem[];
  playbooks: DraftLibraryItem[];
  // Scope-split arrays — used by the picker to show Private / Organisation tabs
  privateTemplates: DraftLibraryItem[];
  orgTemplates: DraftLibraryItem[];
  privateClauses: DraftLibraryItem[];
  orgClauses: DraftLibraryItem[];
  privatePlaybooks: DraftLibraryItem[];
  orgPlaybooks: DraftLibraryItem[];
}

export function useDraftLibrary(authToken: string): DraftLibraryData {
  const [privateTemplates, setPrivateTemplates] = useState<DraftLibraryItem[]>([]);
  const [orgTemplates, setOrgTemplates] = useState<DraftLibraryItem[]>([]);
  const [privateClauses, setPrivateClauses] = useState<DraftLibraryItem[]>([]);
  const [orgClauses, setOrgClauses] = useState<DraftLibraryItem[]>([]);
  const [privatePlaybooks, setPrivatePlaybooks] = useState<DraftLibraryItem[]>([]);
  const [orgPlaybooks, setOrgPlaybooks] = useState<DraftLibraryItem[]>([]);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;

    const load = async () => {
      try {
        // Fetch both scopes in parallel — the vault cache deduplicates concurrent
        // calls automatically (different URLs, so independently cached entries).
        const [privateRows, orgRows] = await Promise.all([
          fetchLibraryItems(authToken, "private"),
          fetchLibraryItems(authToken, "org"),
        ]);
        if (cancelled) return;

        const pr = Array.isArray(privateRows) ? privateRows : [];
        const or = Array.isArray(orgRows) ? orgRows : [];

        setPrivateTemplates(pr.filter((i: any) => i.type === "templates").map(mapItem));
        setOrgTemplates(or.filter((i: any) => i.type === "templates").map(mapItem));

        setPrivateClauses(pr.filter((i: any) => i.type === "clauses").map(mapItem));
        setOrgClauses(or.filter((i: any) => i.type === "clauses").map(mapItem));

        setPrivatePlaybooks(
          pr
            .filter((i: any) => i.type === "rulebook" || i.type === "playbook")
            .map(mapItem)
        );
        setOrgPlaybooks(
          or
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

  // Combine for backward-compatible ID resolution (e.g. selectedTemplate lookup).
  // Deduplicate by id in case an org item also appears in the user's private list.
  const dedup = (a: DraftLibraryItem[], b: DraftLibraryItem[]): DraftLibraryItem[] => {
    const seen = new Set<string>();
    return [...a, ...b].filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  return {
    templates: dedup(privateTemplates, orgTemplates),
    clauses: dedup(privateClauses, orgClauses),
    playbooks: dedup(privatePlaybooks, orgPlaybooks),
    privateTemplates,
    orgTemplates,
    privateClauses,
    orgClauses,
    privatePlaybooks,
    orgPlaybooks,
  };
}
