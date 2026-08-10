import type { DraftState } from "../../models/draft-state.js";
import { topologicalBatches } from "../../utils/topo-batches.js";
import { draftSection } from "./draft-section.js";
import { draftExhibit } from "./draft-exhibit.js";
import { assembleDocument } from "./assemble-document.js";

/**
 * ACT — dependency-ordered batched drafting.
 * Phase 0/2: section + exhibit capabilities; glossary merges between batches.
 */
export async function executeActPlan(state: DraftState): Promise<DraftState> {
  if (!state.plan) return state;

  const targets = state.fixPlan?.targetedOnly
    ? state.plan.workUnits.filter((u) => u.status === "flagged" || u.status === "pending")
    : state.plan.workUnits.filter((u) => u.status !== "drafted");

  const batches = topologicalBatches(targets, 4);
  let current = state;

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((unit) =>
        unit.kind === "exhibit" ? draftExhibit(current, unit) : draftSection(current, unit)
      )
    );

    // Merge section/exhibit results into state
    for (const partial of results) {
      current = partial;
    }

    // Mark batch units drafted
    if (current.plan) {
      const doneIds = new Set(batch.map((b) => b.id));
      current = {
        ...current,
        plan: {
          ...current.plan,
          workUnits: current.plan.workUnits.map((u) =>
            doneIds.has(u.id) ? { ...u, status: "drafted" as const } : u
          ),
        },
      };
    }
  }

  return assembleDocument(current);
}
