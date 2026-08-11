import type { DraftState } from "../../models/draft-state.js";
import { topologicalBatches } from "../../utils/topo-batches.js";
import { draftSection } from "./draft-section.js";
import { draftExhibit } from "./draft-exhibit.js";
import { assembleDocument } from "./assemble-document.js";

/**
 * ACT — dependency-ordered batched drafting.
 * Default concurrency is 1 to avoid Gemini 429 bursts (PAC drafts many sections).
 * Raise via DRAFTING_ACT_CONCURRENCY when quota allows.
 */
export async function executeActPlan(state: DraftState): Promise<DraftState> {
  if (!state.plan) return state;

  const targets = state.fixPlan?.targetedOnly
    ? state.plan.workUnits.filter((u) => u.status === "flagged" || u.status === "pending")
    : state.plan.workUnits.filter((u) => u.status !== "drafted");

  const maxConcurrent = Math.max(
    1,
    Number(process.env.DRAFTING_ACT_CONCURRENCY || 1)
  );
  const batches = topologicalBatches(targets, maxConcurrent);
  let current = state;

  console.log(
    `[ACT] drafting ${targets.length} work units in ${batches.length} batch(es), concurrency=${maxConcurrent}`
  );

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
