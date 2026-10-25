import type { LegalRelationRevision } from "../schemas/legal-structure.js";
import type { ContextProvision } from "./legal-meaning.js";

export interface LegalContextPackage {
  target: { id: string; revision: number };
  provisions: ContextProvision[];
  relations: LegalRelationRevision[];
  complete: boolean;
  missing: string[];
  characterCount: number;
  selections: Array<{ provisionId: string; reason: "target" | "parent_condition" | "relationship" | "contained_provision" | "incoming_modifier" }>;
  selectedPaths: Array<{ provisionId: string; path: string[] }>;
  omitted: Array<{ provisionId: string; reason: "character_limit" | "depth_limit" }>;
  limitStatus: "complete" | "limited";
}

function key(id: string, revision: number) { return `${id}:${revision}`; }

/** Includes all named dependencies; over-limit context fails instead of being cut off. */
export function assembleLegalContext(target: { id: string; revision: number },
  provisions: ContextProvision[], relations: LegalRelationRevision[],
  acceptedRevisions: ReadonlySet<string>, maxCharacters: number,
  options: { onLimit?: "throw" | "report"; maxDepth?: number } = {}): LegalContextPackage {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) throw new Error("Invalid context limit");
  const byKey = new Map(provisions.map(provision => [key(provision.id, provision.revision), provision]));
  const visited = new Set<string>();
  const missing: string[] = [];
  const selected: ContextProvision[] = [];
  const usedRelations: LegalRelationRevision[] = [];
  const selections: LegalContextPackage["selections"] = [];
  const selectedPaths: LegalContextPackage["selectedPaths"] = [];
  const omitted: LegalContextPackage["omitted"] = [];
  const queue: Array<{ id: string; revision: number; depth: number;
    reason: LegalContextPackage["selections"][number]["reason"]; path: string[] }> = [
      { ...target, depth: 0, reason: "target", path: [] },
    ];
  let characterCount = 0;
  while (queue.length) {
    const current = queue.shift()!;
    const identity = key(current.id, current.revision);
    if (visited.has(identity)) continue;
    visited.add(identity);
    if (current.depth > (options.maxDepth ?? 32)) {
      missing.push(`relationship_depth:${identity}`); omitted.push({ provisionId: current.id, reason: "depth_limit" }); continue;
    }
    const provision = byKey.get(identity);
    if (!provision || !acceptedRevisions.has(identity)) { missing.push(`unaccepted_or_missing:${identity}`); continue; }
    if (characterCount + provision.text.length > maxCharacters) {
      if ((options.onLimit ?? "throw") === "throw") {
        throw new Error("Legal context exceeds configured limit; split into identified subparts");
      }
      missing.push(`character_limit:${identity}`); omitted.push({ provisionId: current.id, reason: "character_limit" });
      continue;
    }
    selected.push(provision); characterCount += provision.text.length;
    selections.push({ provisionId: provision.id, reason: current.reason });
    selectedPaths.push({ provisionId: provision.id, path: [...current.path, identity] });
    if (provision.parentId) {
      const parents = provisions.filter(item => item.id === provision.parentId &&
        item.sourceVersionId === provision.sourceVersionId && acceptedRevisions.has(key(item.id, item.revision)));
      const parent = parents.length === 1 ? parents[0] : undefined;
      if (parent) queue.push({ id: parent.id, revision: parent.revision, depth: current.depth + 1,
        reason: "parent_condition" as const, path: [...current.path, identity] });
      else missing.push(`missing_or_ambiguous_parent:${provision.parentId}`);
    }
    if (current.reason !== "parent_condition") {
      const children = provisions.filter(item => item.parentId === provision.id && item.sourceVersionId === provision.sourceVersionId);
      for (const childId of new Set(children.map(item => item.id))) {
        const revisions = children.filter(item => item.id === childId && acceptedRevisions.has(key(item.id, item.revision)));
        if (revisions.length !== 1) { missing.push(`unaccepted_or_ambiguous_child:${childId}`); continue; }
        queue.push({ id: childId, revision: revisions[0]!.revision, depth: current.depth + 1,
          reason: "contained_provision", path: [...current.path, identity] });
      }
    }
    // Relation input must be the accepted publication's relation set. Do not reverse
    // generic citations: only typed modifiers have meaningful incoming semantics.
    for (const relation of relations.filter(item => item.target?.id === current.id &&
        item.target.revision === current.revision && ["exception_to", "defines", "interprets"].includes(item.kind))) {
      if (!usedRelations.includes(relation)) usedRelations.push(relation);
      queue.push({ ...relation.source, depth: current.depth + 1, reason: "incoming_modifier",
        path: [...current.path, identity] });
    }
    for (const relation of relations.filter(relation =>
      relation.source.id === current.id && relation.source.revision === current.revision)) {
      usedRelations.push(relation);
      if (!relation.target) { missing.push(`unresolved_relation:${relation.id}:${relation.revision}`); continue; }
      queue.push({ ...relation.target, depth: current.depth + 1, reason: "relationship" as const,
        path: [...current.path, identity] });
    }
  }
  return { target, provisions: selected, relations: usedRelations,
    complete: missing.length === 0, missing, characterCount, selections, selectedPaths, omitted,
    limitStatus: omitted.length ? "limited" : "complete" };
}
