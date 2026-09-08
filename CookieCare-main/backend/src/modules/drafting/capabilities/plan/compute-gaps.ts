import type { MissingFact } from "../../models/draft-plan.js";
import type { DraftState } from "../../models/draft-state.js";
import type { DraftGap } from "../../models/draft-requirements.js";
import { canonicalizeFieldId } from "../../models/draft-requirements.js";
import {
  isFactSatisfied,
  prioritizeMissingFacts,
  resolveDocTypeKey,
} from "./core-deal-facts.js";
import { requirementToMissingFact } from "./resolve-requirements.js";
import { privacyRegimeKnown } from "../../packs/regimes/dpdpa/signals.js";

/**
 * ASK is the unresolved required facts of the skills that actually apply.
 * detect-gaps may rephrase those questions. It cannot invent a new field,
 * and it cannot reopen a satisfied fact.
 *
 * When a DPA has no named privacy regime, ask only that choice first.
 */
export function computeGapsAndConflicts(
  state: DraftState,
  detectGapsMissing: MissingFact[] = []
): MissingFact[] {
  const byId = state.draftRequirements?.byId ?? {};
  const facts = (state.structuredFacts ?? {}) as Record<string, unknown>;
  const documentType =
    state.plan?.documentType ||
    (typeof facts.documentType === "string" ? facts.documentType : undefined) ||
    state.requirements?.contractType;

  const gaps: DraftGap[] = [];
  const missingByField = new Map<string, MissingFact>();
  const skillFieldIds = new Set(Object.keys(byId));

  for (const req of Object.values(byId)) {
    if (!req.blocking && req.priority === "optional") continue;

    if (req.status === "satisfied" || req.status === "assumed" || req.status === "not_applicable") {
      continue;
    }

    if (req.status === "missing" || req.status === "conflict") {
      gaps.push({
        requirementId: req.id,
        reason: req.reasonRequired || req.status,
        blocking: req.blocking,
        suggestedQuestionContext: req.question,
      });
      missingByField.set(req.id, requirementToMissingFact(req));
    }
  }

  // Model may phrase a question for a skill fact that is still missing.
  // It may not add a field no loaded skill required.
  for (const hint of detectGapsMissing) {
    const id = canonicalizeFieldId(hint.field);
    const resolved = byId[id];

    if (
      resolved &&
      (resolved.status === "satisfied" ||
        resolved.status === "assumed" ||
        resolved.status === "not_applicable")
    ) {
      continue;
    }

    if (isFactSatisfied(facts, id)) continue;
    if (!skillFieldIds.has(id) && !missingByField.has(id)) continue;

    const existing = missingByField.get(id);
    if (!existing) continue;

    missingByField.set(id, {
      ...existing,
      question: hint.question?.trim() || existing.question,
      reasonRequired: existing.reasonRequired || hint.reasonRequired,
      options: existing.options?.length ? existing.options : hint.options,
    });
  }

  let result = prioritizeMissingFacts(Array.from(missingByField.values()), 8);

  const docKey = resolveDocTypeKey(
    typeof documentType === "string" ? documentType : undefined
  );
  if (docKey === "dpa" && !privacyRegimeKnown(facts) && missingByField.has("privacyRegime")) {
    result = result.filter((f) => f.field === "privacyRegime");
  }

  console.log(
    `[computeGaps] gaps=${result.length} fields=${result.map((f) => f.field).join(",") || "(none)"} draftGapCount=${gaps.length}`
  );

  return result;
}
