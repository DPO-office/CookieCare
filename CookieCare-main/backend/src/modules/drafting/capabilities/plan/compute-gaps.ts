import type { MissingFact } from "../../models/draft-plan.js";
import type { DraftState } from "../../models/draft-state.js";
import type { DraftGap } from "../../models/draft-requirements.js";
import { canonicalizeFieldId } from "../../models/draft-requirements.js";
import {
  getCatalogEntry,
  isFactSatisfied,
  prioritizeMissingFacts,
} from "./core-deal-facts.js";
import { requirementToMissingFact } from "./resolve-requirements.js";

/**
 * Compute ASK list from resolved requirement status + optional detect-gaps hints.
 * detect-gaps cannot re-open satisfied/assumed/not_applicable fields.
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

  // Merge detect-gaps hints only when canonical field is still unresolved.
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

    if (isFactSatisfied(facts, id)) {
      continue;
    }

    if (missingByField.has(id)) {
      // Keep catalog question; optionally adopt LLM options if catalog has none.
      const existing = missingByField.get(id)!;
      if (!existing.options?.length && hint.options?.length) {
        missingByField.set(id, { ...existing, options: hint.options });
      }
      continue;
    }

    const catalog = getCatalogEntry(id, documentType);
    missingByField.set(id, {
      field: id,
      question: catalog?.question || hint.question,
      severity: "critical",
      reasonRequired: catalog?.reasonRequired || hint.reasonRequired,
      options: catalog?.options?.length ? catalog.options : hint.options,
    });
  }

  const result = prioritizeMissingFacts(Array.from(missingByField.values()), 10);

  console.log(
    `[computeGaps] gaps=${result.length} fields=${result.map((f) => f.field).join(",") || "(none)"} draftGapCount=${gaps.length}`
  );

  return result;
}
