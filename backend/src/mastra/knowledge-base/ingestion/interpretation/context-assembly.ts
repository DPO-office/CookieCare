import type { LegalRelationRevision } from "../schemas/legal-structure.js";
import type { ContextProvision } from "./legal-meaning.js";

export interface LegalContextPackage {
  target: { id: string; revision: number };
  provisions: ContextProvision[];
  relations: LegalRelationRevision[];
  complete: boolean;
  missing: string[];
  characterCount: number;
}

function key(id: string, revision: number) { return `${id}:${revision}`; }

/** Includes all named dependencies; over-limit context fails instead of being cut off. */
export function assembleLegalContext(target: { id: string; revision: number },
  provisions: ContextProvision[], relations: LegalRelationRevision[],
  acceptedRevisions: ReadonlySet<string>, maxCharacters: number): LegalContextPackage {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) throw new Error("Invalid context limit");
  const byKey = new Map(provisions.map(provision => [key(provision.id, provision.revision), provision]));
  const visited = new Set<string>();
  const missing: string[] = [];
  const selected: ContextProvision[] = [];
  const usedRelations: LegalRelationRevision[] = [];
  const queue = [{ ...target, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    const identity = key(current.id, current.revision);
    if (visited.has(identity)) continue;
    visited.add(identity);
    if (current.depth > 32) { missing.push(`relationship_depth:${identity}`); continue; }
    const provision = byKey.get(identity);
    if (!provision || !acceptedRevisions.has(identity)) { missing.push(`unaccepted_or_missing:${identity}`); continue; }
    selected.push(provision);
    for (const relation of relations.filter(relation =>
      relation.source.id === current.id && relation.source.revision === current.revision)) {
      usedRelations.push(relation);
      if (!relation.target) { missing.push(`unresolved_relation:${relation.id}:${relation.revision}`); continue; }
      queue.push({ ...relation.target, depth: current.depth + 1 });
    }
  }
  const characterCount = selected.reduce((sum, provision) => sum + provision.text.length, 0);
  if (characterCount > maxCharacters) throw new Error("Legal context exceeds configured limit; split into identified subparts");
  return { target, provisions: selected, relations: usedRelations,
    complete: missing.length === 0, missing, characterCount };
}
