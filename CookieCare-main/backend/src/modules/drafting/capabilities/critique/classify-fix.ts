import type { FixItem } from "../../models/critique-report.js";
import type { CritiqueResult } from "../../models/critique-report.js";

export type FixStrategy = "deterministic" | "section_redraft" | "plan_change";

export interface ClassifiedFix {
  item: FixItem;
  strategy: FixStrategy;
  reason: string;
}

const DETERMINISTIC_ITEM_IDS = new Set([
  "placeholders",
  "party-consistency",
  "party-presence",
]);

/**
 * Classify critique fix items by how they should be remediations.
 * - deterministic: regex / template scrub (no LLM)
 * - section_redraft: one work unit flagged for targeted ACT
 * - plan_change: needs new work unit or ASK (skeleton mismatch / missing exhibit unit)
 */
export function classifyFixItems(
  fixPlan: FixItem[],
  results: CritiqueResult[] = []
): ClassifiedFix[] {
  const resultById = new Map(results.map((r) => [r.itemId, r]));

  return fixPlan.map((item) => {
    const source = item.sourceChecklistItemId || "";
    const result =
      resultById.get(source) ||
      resultById.get(`skill:${source}`);

    if (
      DETERMINISTIC_ITEM_IDS.has(source) ||
      source === "placeholders" ||
      source.startsWith("assembly:")
    ) {
      return {
        item,
        strategy: "deterministic" as const,
        reason: `deterministic source=${source}`,
      };
    }

    // Party-consistency can often be fixed deterministically for simple swaps,
    // but multi-section party drift still needs section_redraft if many units.
    if (source === "party-consistency") {
      return {
        item,
        strategy: "deterministic" as const,
        reason: "party name scrub",
      };
    }

    if (
      source.startsWith("skeleton:") ||
      (result?.status === "missing" && source.startsWith("skill:") && source.includes("exhibit"))
    ) {
      // Missing whole unit that isn't in plan yet → plan_change; else section_redraft.
      if (source.startsWith("skeleton:")) {
        return {
          item,
          strategy: "plan_change" as const,
          reason: "skeleton missing — may need PLAN rebuild",
        };
      }
    }

    return {
      item,
      strategy: "section_redraft" as const,
      reason: `section redraft for ${item.workUnitId}`,
    };
  });
}

export function partitionClassifiedFixes(classified: ClassifiedFix[]): {
  deterministic: ClassifiedFix[];
  sectionRedraft: ClassifiedFix[];
  planChange: ClassifiedFix[];
} {
  return {
    deterministic: classified.filter((c) => c.strategy === "deterministic"),
    sectionRedraft: classified.filter((c) => c.strategy === "section_redraft"),
    planChange: classified.filter((c) => c.strategy === "plan_change"),
  };
}
