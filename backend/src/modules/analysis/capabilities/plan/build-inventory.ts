import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import { classifyDocument } from "../act/operations/classify-document.js";
import { extractClauses } from "../act/operations/extract-clauses.js";
import { resolveSkills } from "../../skills/runtime/selection/resolve-skills.js";
import { graphToSegments } from "../ingest/document-structure/projection.js";

/**
 * Upload/version ingestion owns segmentation. PLAN may project a persisted
 * graph, but must never reconstruct structure from flattened text.
 */
export function ensureSegmented(state: AnalysisState, docId: string): AnalysisState {
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (doc?.segments.length) return state;

  if (!doc?.structureGraph) {
    throw new Error(`Canonical document graph missing for ${docId}; PLAN cannot rebuild structure.`);
  }
  const segmented = { ...doc, fullText: doc.structureGraph.canonicalText, segments: graphToSegments(doc.structureGraph) };

  const documents = doc
    ? state.workspace.documents.map((d) => (d.docId === docId ? { ...segmented, docType: doc.docType } : d))
    : [...state.workspace.documents, segmented];

  return { ...state, workspace: { ...state.workspace, documents } };
}

export interface InventoryItem {
  clauseType: string;
  /** Structural locator (heading path / section) the clause was found at. */
  section: string;
  /** Short preview of the clause text — recall-oriented, not a judgment. */
  brief: string;
  evidenceStatus: string;
}

function workUnit(
  tool: AnalysisWorkUnit["tool"],
  input: Record<string, unknown>
): AnalysisWorkUnit {
  return {
    workUnitId: `inventory_${tool}`,
    tool,
    input,
    dependsOn: [],
    outputSchema: "ClauseObject[]",
    status: "pending",
  };
}

/**
 * §4 step 8a — a cheap, generic structural inventory of a document, built
 * entirely from the two existing generic ACT tools (`classify_document` +
 * `extract_clauses`, unmodified). Intentionally recall-oriented: it is not
 * judging anything, just inventorying what clause types exist so PLAN has
 * something concrete to generate propositions against (Plan-Phase 5) —
 * no clause-type curation of our own, no proposition generation here.
 */
export async function buildInventory(
  state: AnalysisState,
  docId: string
): Promise<{ state: AnalysisState; inventory: InventoryItem[] }> {
  // extract_clauses only finds what a skill's own clauseRetrieval hints
  // (headings/aliases/anchor terms) point it at — without active skills
  // resolved first, retrieval has nothing to search for and the inventory
  // comes back empty. resolveSkills is the same PLAN-side skill-selection
  // step build-plan.ts already runs; reused here unmodified.
  let next = ensureSegmented(state, docId);
  next = await resolveSkills(next);
  next = await classifyDocument(next, workUnit("classify_document", { docId }));

  const extracted = await extractClauses(
    next,
    workUnit("extract_clauses", { docId, skillIds: next.activeSkillIds }),
    []
  );
  next = extracted.state;

  const doc = next.workspace.documents.find((d) => d.docId === docId);
  const clauses = doc?.clauses ?? [];

  const inventory: InventoryItem[] = clauses
    .filter((c) => c.text.trim().length > 0)
    .map((c) => ({
      clauseType: c.clauseType,
      section: c.locator.structuralPath,
      brief: c.text.trim().slice(0, 200),
      evidenceStatus: c.evidenceStatus ?? "found",
    }));

  return { state: next, inventory };
}
