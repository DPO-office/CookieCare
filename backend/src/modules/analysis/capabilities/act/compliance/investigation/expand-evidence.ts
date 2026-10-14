import { buildEvidenceUnits, evidenceUnitFromNode } from "./evidence-index.js";
import type {
  EvidenceDecision,
  EvidenceUnit,
  InvestigationRequirement,
  RankedEvidenceCandidate,
} from "./types.js";
import type { RelationSemanticEffect } from "../../../ingest/document-structure/types.js";

const PRIORITY_EFFECTS = new Set<RelationSemanticEffect>([
  "details_provided_by",
  "procedure_provided_by",
  "implements",
  "incorporates",
  "subject_to",
  "exception_provided_by",
  "limits",
  "modifies",
  "overrides",
  "prevails_over",
]);
// A resolved `details_provided_by`/`incorporates` reference can point at a
// large appendix or schedule whose operative descendants cover several distinct
// particulars of one requirement (e.g. Article 28(3)'s subject matter, data
// categories, data-subject categories, nature/purpose). A tight cap taken in raw
// document order starves the later particulars: the earliest descendants consume
// every slot. The cap stays bounded but is wide enough to admit the relevant
// sections once they are ordered by relevance below.
const MAX_EXPANSIONS = 12;

const EXPANSION_STOPWORDS = new Set([
  "this", "that", "with", "from", "which", "their", "there", "shall", "will",
  "must", "such", "under", "into", "onto", "upon", "than", "then", "them",
  "they", "have", "been", "were", "also", "only", "does", "not", "any", "all",
  "the", "and", "for", "are", "its", "may", "per", "who", "what", "when",
  "processing", "personal", "data", "contract", "agreement", "processor",
  "controller", "proven", "proof", "text", "sets", "state", "states", "stating",
  "document", "provided", "required", "requirement", "clause", "section",
]);

/** Vocabulary describing what this requirement is trying to prove, drawn from
 *  the authored hypothesis, evidence hints and per-element descriptions. Used to
 *  rank the operative descendants of a referenced container so the sections that
 *  actually cover the requirement's particulars win the bounded expansion slots. */
function requirementVocabulary(requirement: InvestigationRequirement): Set<string> {
  const parts: string[] = [];
  if (requirement.profile.hypothesis) parts.push(requirement.profile.hypothesis);
  for (const hint of requirement.profile.evidenceHints ?? []) parts.push(hint);
  for (const element of requirement.proofElements ?? []) parts.push(element.description);
  const tokens = parts.join(" ").toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return new Set(tokens.filter((token) => !EXPANSION_STOPWORDS.has(token)));
}

/** Distinct requirement-vocabulary tokens present in a unit's searchable text
 *  (which already carries the unit's section heading), so a "Categories of data"
 *  or "Nature and purpose" section outranks a redundant leading bullet. */
function relevanceScore(unit: EvidenceUnit, vocabulary: Set<string>): number {
  const tokens = unit.searchText.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const matched = new Set<string>();
  for (const token of tokens) if (vocabulary.has(token)) matched.add(token);
  return matched.size;
}

/** One-hop, requirement-aware expansion from reviewed evidence only. */
export function expandSelectedEvidence(args: {
  requirement: InvestigationRequirement;
  candidates: RankedEvidenceCandidate[];
  decisions: EvidenceDecision[];
}): RankedEvidenceCandidate[] {
  const graph = args.candidates[0]?.unit.sourceGraph;
  if (!graph) return [];
  const unitById = new Map(args.candidates.map((candidate) => [candidate.unit.unitId, candidate.unit]));
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const searchableUnits = buildEvidenceUnits(graph);
  const selected = args.decisions.filter(
    (decision) =>
      (decision.role === "primary" || decision.role === "supporting") &&
      decision.confidence >= 0.75
  );
  const hasPrimary = selected.some((decision) => decision.role === "primary");
  const added = new Map<string, RankedEvidenceCandidate>();

  const add = (
    unit: EvidenceUnit,
    signal: string,
    seedNodeId: string,
    reason: "internal_reference" | "definition" | "parent"
  ) => {
    if (added.size >= MAX_EXPANSIONS || unitById.has(unit.unitId) || added.has(unit.unitId)) return;
    added.set(unit.unitId, {
      unit,
      fusedScore: 0,
      rerankScore: 0,
      channelRanks: {},
      channelScores: {},
      matchedQueries: [signal],
      signals: ["graph_expansion", signal],
      expansion: { seedNodeId, reason },
    });
  };

  for (const decision of selected) {
    if (added.size >= MAX_EXPANSIONS) break;
    const seedUnit = unitById.get(decision.nodeId);
    const seed = seedUnit ? nodeById.get(seedUnit.nodeId) : undefined;
    if (!seed || !seedUnit) continue;

    for (const edge of graph.relationEdges) {
      if (edge.sourceNodeId !== seed.nodeId || edge.status !== "resolved" || !edge.targetNodeId) continue;
      const target = nodeById.get(edge.targetNodeId);
      if (!target?.text.trim()) continue;
      const isDefinition = edge.semanticEffect === "defined_by";
      const isGenericReference = edge.semanticEffect === "refers_to";
      if (!PRIORITY_EFFECTS.has(edge.semanticEffect) && !isDefinition && !isGenericReference) continue;
      if (isDefinition) {
        const term = target.definedTerm?.trim();
        if (!term || !seedUnit.rawText.toLowerCase().includes(term.toLowerCase())) continue;
      }
      if (isGenericReference && hasPrimary) continue;
      const directUnits = searchableUnits.filter((unit) => unit.nodeId === target.nodeId);
      if (directUnits.length > 0) {
        for (const unit of directUnits) {
          add(
            unit,
            `relation:${edge.semanticEffect}`,
            seedUnit.nodeId,
            edge.semanticEffect === "defined_by" ? "definition" : "internal_reference"
          );
        }
      } else if (target.kind === "definition") {
        add(evidenceUnitFromNode(graph, target), `relation:${edge.semanticEffect}`, seedUnit.nodeId, "definition");
      } else {
        // Resolved references frequently point to a section/schedule container.
        // Admit its operative descendants, never the container text itself.
        const isDescendant = (nodeId: string): boolean => {
          let current = nodeById.get(nodeId);
          while (current?.parentId) {
            if (current.parentId === target.nodeId) return true;
            current = nodeById.get(current.parentId);
          }
          return false;
        };
        // Order descendants by relevance to the requirement's particulars, not
        // by document position, so a bounded number of slots reaches the
        // sections that actually establish the still-open elements instead of
        // whichever descendants happen to appear first in the container.
        const vocabulary = requirementVocabulary(args.requirement);
        const descendants = searchableUnits
          .map((unit, index) => ({ unit, index }))
          .filter(({ unit }) => isDescendant(unit.nodeId))
          .sort((a, b) =>
            relevanceScore(b.unit, vocabulary) - relevanceScore(a.unit, vocabulary) ||
            a.index - b.index
          );
        for (const { unit } of descendants) {
          add(unit, `relation:${edge.semanticEffect}`, seedUnit.nodeId, "internal_reference");
        }
      }
    }

    if (added.size < MAX_EXPANSIONS && seed.parentId) {
      const parent = nodeById.get(seed.parentId);
      if (parent?.text.trim() && parent.text.trim().length <= 2000) {
        add(evidenceUnitFromNode(graph, parent), "structural:parent_context", seedUnit.nodeId, "parent");
      }
    }
  }
  return [...added.values()];
}
