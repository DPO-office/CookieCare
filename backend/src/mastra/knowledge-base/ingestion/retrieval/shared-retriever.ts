export type SearchPurpose = "legal_passage" | "rule_discovery" | "evidence_query";
export interface RetrievalScope {
  publicationId: string;
  indexVersion: string;
  allowedSourceVersionIds: string[];
  approvedRecordKeys: string[];
}
export interface SearchHit { entryId: string }
export interface PublishedEntry {
  id: string;
  indexVersion: string;
  sourceVersionId: string;
  purpose: SearchPurpose;
  recordKind: "provision" | "requirement" | "profile";
  recordId: string;
  recordRevision: number;
  text: string;
  citation: string;
  dependencyEntryIds: string[];
}
export interface RetrievalAdapters {
  scope(actorId: string, publicationId: string): Promise<RetrievalScope>;
  exactCitation(query: string, scope: RetrievalScope, purpose: SearchPurpose): Promise<SearchHit[]>;
  lexical(query: string, scope: RetrievalScope, purpose: SearchPurpose): Promise<SearchHit[]>;
  dense(query: string, scope: RetrievalScope, purpose: SearchPurpose): Promise<SearchHit[]>;
  loadEntries(ids: string[]): Promise<PublishedEntry[]>;
}

/** One access-fenced path for analysis, drafting and legal Q&A. */
export class SharedKbRetriever {
  constructor(private readonly adapters: RetrievalAdapters) {}

  async retrieve(actorId: string, publicationId: string, query: string,
    purpose: SearchPurpose, limit = 10): Promise<{
      publicationId: string; indexVersion: string; entries: PublishedEntry[];
      incompleteContext: boolean }> {
    if (!query.trim() || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Invalid retrieval request");
    }
    const scope = await this.adapters.scope(actorId, publicationId);
    if (scope.publicationId !== publicationId || !scope.indexVersion) throw new Error("Publication scope mismatch");
    const allowedSources = new Set(scope.allowedSourceVersionIds);
    const approved = new Set(scope.approvedRecordKeys);
    const accepted = (entry: PublishedEntry, expectedPurpose: SearchPurpose | null): boolean =>
      entry.indexVersion === scope.indexVersion && allowedSources.has(entry.sourceVersionId) &&
      (!expectedPurpose || entry.purpose === expectedPurpose) &&
      approved.has(`${entry.recordKind}:${entry.recordId}:${entry.recordRevision}`);
    const [exact, lexical, dense] = await Promise.all([
      this.adapters.exactCitation(query, scope, purpose),
      this.adapters.lexical(query, scope, purpose),
      this.adapters.dense(query, scope, purpose),
    ]);
    const scores = new Map<string, number>();
    const add = (hits: SearchHit[], weight: number) => hits.forEach((hit, rank) => {
      scores.set(hit.entryId, (scores.get(hit.entryId) ?? 0) + weight / (60 + rank + 1));
    });
    add(exact, 3); add(lexical, 1); add(dense, 1);
    const rankedIds = [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const loaded = new Map((await this.adapters.loadEntries(rankedIds)).map(entry => [entry.id, entry]));
    const primary = rankedIds.map(id => loaded.get(id)).filter((entry): entry is PublishedEntry =>
      !!entry && accepted(entry, purpose)).slice(0, limit);
    const entries = [...primary];
    const seen = new Set(entries.map(entry => entry.id));
    let incompleteContext = false;
    const queue = primary.flatMap(entry => entry.dependencyEntryIds);
    while (queue.length) {
      if (seen.size >= 200) { incompleteContext = true; break; }
      const batch = [...new Set(queue.splice(0, 50))].filter(id => !seen.has(id));
      if (!batch.length) continue;
      const dependencies = new Map((await this.adapters.loadEntries(batch)).map(entry => [entry.id, entry]));
      for (const id of batch) {
        seen.add(id);
        const dependency = dependencies.get(id);
        if (!dependency || !accepted(dependency, null)) { incompleteContext = true; continue; }
        entries.push(dependency);
        queue.push(...dependency.dependencyEntryIds);
      }
    }
    return { publicationId, indexVersion: scope.indexVersion, entries, incompleteContext };
  }
}
