import type { DraftProvision } from "./reconstruct.js";

export interface DefinedTerm {
  term: string;
  provisionId: string;
  start: number;
  end: number;
  scopeProvisionId: string | null;
  scopeStatus: "document" | "structural_parent" | "unresolved";
}

/** General English inflection generator for singular/plural legal defined terms. */
export function termInflections(term: string): string[] {
  const words = term.trim().split(/\s+/);
  if (!words.length) return [term];
  const last = words[words.length - 1]!;
  const prefix = words.slice(0, -1).join(" ");
  const withPrefix = (w: string) => prefix ? `${prefix} ${w}` : w;
  const variants = new Set<string>([term]);
  const lower = last.toLowerCase();

  if (lower === "child") variants.add(withPrefix("children"));
  else if (lower === "children") variants.add(withPrefix("child"));
  else if (lower === "person") { variants.add(withPrefix("persons")); variants.add(withPrefix("people")); }
  else if (lower === "persons" || lower === "people") variants.add(withPrefix("person"));
  else if (/[bcdfghjklmnpqrstvwxyz]y$/iu.test(last)) {
    variants.add(withPrefix(last.slice(0, -1) + "ies"));
  } else if (last.toLowerCase().endsWith("ies") && last.length > 3) {
    variants.add(withPrefix(last.slice(0, -3) + "y"));
  } else if (/(?:[sxz]|ch|sh)$/iu.test(last)) {
    variants.add(withPrefix(last + "es"));
  } else if (last.toLowerCase().endsWith("es") && /(?:[sxz]|ch|sh)es$/iu.test(last)) {
    variants.add(withPrefix(last.slice(0, -2)));
  } else if (last.toLowerCase().endsWith("s") && !last.toLowerCase().endsWith("ss")) {
    variants.add(withPrefix(last.slice(0, -1)));
  } else {
    variants.add(withPrefix(last + "s"));
  }
  return [...variants];
}

/** Definitions are source facts independent of the model's structural type. */
export function collectDefinitions(provisions: DraftProvision[]): DefinedTerm[] {
  const byId = new Map(provisions.map(p => [p.id, p]));
  const occurrences = new Map<string, DefinedTerm>();
  for (const provision of [...provisions].sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
    for (const match of provision.text.matchAll(/["'“‘]([^"'”’\n]{2,100})["'”’]\s*(?:means|includes|has the meaning|refers to)\b/giu)) {
      const start = provision.start + match.index!;
      // A marker-only fragment ending at "means" is not a usable definition target.
      if (!provision.text.slice(match.index! + match[0].length).trim()) continue;
      const key = `${start}:${match[0].length}`;
      if (occurrences.has(key)) continue;
      const ancestors: DraftProvision[] = [provision];
      const seen = new Set([provision.id]);
      let parent = provision.parentId ? byId.get(provision.parentId) : undefined;
      while (parent && !seen.has(parent.id)) {
        ancestors.push(parent); seen.add(parent.id);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      const sourceContainers = provisions.filter(p => p.id !== provision.id &&
        ["section", "article", "rule", "chapter", "part"].includes(p.kind) &&
        p.start <= start && p.end >= start + match[0].length)
        .sort((a, b) => (a.end - a.start) - (b.end - b.start));
      const contexts = [...new Map([...sourceContainers, ...ancestors].map(p => [p.id, p])).values()];
      // Only inspect introductions before the definition, not later scope wording.
      const introduction = contexts.map(p => p.text.slice(0, Math.min(500, Math.max(0, start - p.start)))).join("\n");
      const local = /(?:for the purposes of|in|under)\s+this\s+(section|article|rule|chapter|part)\b/iu.exec(introduction);
      const isStandaloneDefSection = contexts.some(p =>
        ["section", "article", "rule"].includes(p.kind) &&
        /\bdefinitions\b/iu.test(p.label ?? p.text.slice(0, 100))
      );
      const documentScope = (!local && /(?:for the purposes of|in|under)\s+(?:this|these)\s+(?:act|regulation|rules|agreement|document)\b/iu.test(introduction)) ||
        (!local && isStandaloneDefSection);
      const scope = local ? contexts.find(p => p.kind === local[1]!.toLowerCase()) :
        contexts.find(p => ["section", "article", "rule", "chapter", "part"].includes(p.kind));
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
