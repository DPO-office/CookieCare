import type { DraftState } from "../../models/draft-state.js";
import { topologicalBatches } from "../../utils/topo-batches.js";
import { draftSection } from "./draft-section.js";
import { draftExhibit } from "./draft-exhibit.js";
import { assembleDocument } from "./assemble-document.js";
import { materializeExhibits } from "./materialize-exhibits.js";
import {
  applyDealIdentityToPlanGlossary,
  buildDealIdentity,
} from "./deal-identity.js";

/** Work units that define glossary / identity — run serially first. */
const GLOSSARY_MUTATING = new Set(["sec-parties", "sec-definitions"]);

/**
 * ACT — dependency-ordered batched drafting.
 * Default concurrency is 3 (tunable via DRAFTING_ACT_CONCURRENCY).
 * Glossary-mutating units (parties, definitions) always run in a serial first batch.
 */
export async function executeActPlan(state: DraftState): Promise<DraftState> {
  if (!state.plan) return state;

  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan.structuredFacts,
    state.plan.documentType
  );
  let current: DraftState = identity
    ? {
        ...state,
        plan: {
          ...state.plan,
          glossary: applyDealIdentityToPlanGlossary(state.plan.glossary, identity),
          structuredFacts: {
            ...(state.plan.structuredFacts ?? {}),
            ...(state.structuredFacts ?? {}),
            partyA: identity.partyA,
            partyB: identity.partyB,
            parties: [identity.partyA, identity.partyB],
          },
        },
        structuredFacts: {
          ...(state.structuredFacts ?? {}),
          partyA: identity.partyA,
          partyB: identity.partyB,
          parties: [identity.partyA, identity.partyB],
        },
      }
    : state;

  if (identity) {
    console.log(
      `[ACT] deal identity: ${identity.partyA} / ${identity.partyB}`
    );
  }

  const targets = current.fixPlan?.targetedOnly
    ? current.plan!.workUnits.filter(
        (u) => u.status === "flagged" || u.status === "pending"
      )
    : current.plan!.workUnits.filter((u) => u.status !== "drafted");

  const fullTextExhibitIds = new Set(
    (current.draftingContext?.exhibitSpecs ?? [])
      .filter((s) => s.requiresFullText)
      .map((s) => s.id)
  );
  const draftTargets = targets.filter((u) => !fullTextExhibitIds.has(u.id));

  const maxConcurrent = Math.max(
    1,
    Number(process.env.DRAFTING_ACT_CONCURRENCY || 3)
  );

  const glossaryUnits = draftTargets.filter((u) => GLOSSARY_MUTATING.has(u.id));
  const parallelUnits = draftTargets.filter((u) => !GLOSSARY_MUTATING.has(u.id));
  const batches = [
    ...topologicalBatches(glossaryUnits, 1),
    ...topologicalBatches(parallelUnits, maxConcurrent),
  ];

  console.log(
    `[ACT] drafting ${draftTargets.length} work units in ${batches.length} batch(es), concurrency=${maxConcurrent} (skipped full-text exhibits=${fullTextExhibitIds.size})`
  );

  for (const batch of batches) {
    if (batch.length === 0) continue;
    const results = await Promise.all(
      batch.map((unit) =>
        unit.kind === "exhibit"
          ? draftExhibit(current, unit)
          : draftSection(current, unit)
      )
    );

    for (const partial of results) {
      current = {
        ...current,
        ...partial,
        draft: partial.draft
          ? {
              ...(current.draft ?? partial.draft),
              ...partial.draft,
              sections: mergeByWorkUnitId(
                current.draft?.sections ?? [],
                partial.draft.sections ?? []
              ),
            }
          : current.draft,
        exhibits: mergeExhibits(current.exhibits ?? [], partial.exhibits ?? []),
        plan: partial.plan ?? current.plan,
      };
    }

    if (current.plan) {
      const doneIds = new Set(batch.map((b) => b.id));
      const glossary = identity
        ? applyDealIdentityToPlanGlossary(current.plan.glossary, identity)
        : current.plan.glossary;
      current = {
        ...current,
        plan: {
          ...current.plan,
          glossary,
          workUnits: current.plan.workUnits.map((u) =>
            doneIds.has(u.id) ? { ...u, status: "drafted" as const } : u
          ),
        },
      };
    }
  }

  current = await materializeExhibits(current);
  if (current.plan && fullTextExhibitIds.size > 0) {
    current = {
      ...current,
      plan: {
        ...current.plan,
        workUnits: current.plan.workUnits.map((u) =>
          fullTextExhibitIds.has(u.id)
            ? { ...u, status: "drafted" as const }
            : u
        ),
      },
    };
  }

  return assembleDocument(current);
}

function mergeByWorkUnitId<T extends { workUnitId?: string; id?: string }>(
  existing: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  for (const s of existing) {
    map.set(s.workUnitId || s.id || "", s);
  }
  for (const s of incoming) {
    map.set(s.workUnitId || s.id || "", s);
  }
  return [...map.values()].filter((s) => s.workUnitId || s.id);
}

function mergeExhibits(
  existing: NonNullable<DraftState["exhibits"]>,
  incoming: NonNullable<DraftState["exhibits"]>
): NonNullable<DraftState["exhibits"]> {
  const map = new Map(existing.map((e) => [e.workUnitId, e]));
  for (const e of incoming) map.set(e.workUnitId, e);
  return [...map.values()];
}
