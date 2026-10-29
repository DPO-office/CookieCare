import type { DraftProvision } from "./reconstruct.js";

export interface DefinedTerm {
  term: string;
  provisionId: string;
  start: number;
  end: number;
  scopeProvisionId: string | null;
  scopeStatus: "document" | "structural_parent" | "unresolved";
}

/** Definitions are source facts independent of the model's structural type. */
export function collectDefinitions(provisions: DraftProvision[]): DefinedTerm[] {
  const byId = new Map(provisions.map(p => [p.id, p]));
  const occurrences = new Map<string, DefinedTerm>();
  for (const provision of [...provisions].sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
    for (const match of provision.text.matchAll(/["'“‘]([^"'”’\n]{2,100})["'”’]\s*(?:means|includes|has the meaning|refers to)\b/giu)) {
      const start = provision.start + match.index!;
      const key = `${start}:${match[0].length}`;
      if (occurrences.has(key)) continue;
      const ancestors: DraftProvision[] = [provision];
      const seen = new Set([provision.id]);
      let parent = provision.parentId ? byId.get(provision.parentId) : undefined;
      while (parent && !seen.has(parent.id)) {
        ancestors.push(parent); seen.add(parent.id);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      // Only inspect introductions before the definition, not later scope wording.
      const introduction = ancestors.map(p => p.text.slice(0, Math.min(500, Math.max(0, start - p.start)))).join("\n");
      const local = /(?:for the purposes of|in|under)\s+this\s+(section|article|rule|chapter|part)\b/iu.exec(introduction);
      const documentScope = !local && /(?:for the purposes of|in|under)\s+(?:this|these)\s+(?:act|regulation|rules|agreement|document)\b/iu.test(introduction);
      const scope = local ? ancestors.find(p => p.kind === local[1]!.toLowerCase()) :
        ancestors.find(p => ["section", "article", "rule", "chapter", "part"].includes(p.kind));
      occurrences.set(key, { term: match[1]!.replace(/\s+/gu, " ").trim(), provisionId: provision.id,
        start, end: start + match[0].length, scopeProvisionId: documentScope ? null : scope?.id ?? null,
        scopeStatus: documentScope ? "document" : scope ? "structural_parent" : "unresolved" });
    }
  }
  return [...occurrences.values()];
}

export function definitionApplies(definition: DefinedTerm, use: DraftProvision, byId: Map<string, DraftProvision>): boolean {
  if (definition.scopeStatus === "unresolved") return false;
  if (!definition.scopeProvisionId) return true;
  const seen = new Set<string>();
  let cursor: DraftProvision | undefined = use;
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === definition.scopeProvisionId) return true;
    seen.add(cursor.id); cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return false;
}
