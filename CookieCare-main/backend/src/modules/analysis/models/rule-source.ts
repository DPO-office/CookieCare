import type { Locator } from "./locator.js";

/** Where a compliance "rule" text comes from — never invent rules at runtime. */
export type RuleSource =
  | {
      kind: "authored";
      ruleId: string;
      skillId: string;
      ruleVersion: string;
      findingCategory: string;
    }
  | {
      kind: "playbook_derived";
      positionId: string;
      sourceDocId: string;
      requirementText: string;
      sourceLocator: Locator;
      clauseType?: string;
      severityIfViolated?: "low" | "medium" | "high";
    }
  | {
      kind: "web_derived";
      query: string;
      retrievedText: string;
      sourceUrl: string;
      /** ISO date — required for staleness visibility. */
      retrievedAt: string;
    };

export type RuleSourceTier = "B" | "P" | "C";

export function tierFor(kind: RuleSource["kind"]): RuleSourceTier {
  if (kind === "authored") return "B";
  if (kind === "playbook_derived") return "P";
  return "C";
}

/** Normative position extracted from an uploaded playbook / reference doc. */
export interface PlaybookPosition {
  positionId: string;
  clauseType: string;
  requirementText: string;
  severityIfViolated: "low" | "medium" | "high";
  sourceLocator: Locator;
}
