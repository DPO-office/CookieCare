import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import { displayRequirementStatus, isGapLike } from "../../models/requirement-assessment.js";
import { humanizeRequirementId } from "../../shared/group-assessments.js";

const GAP_CLAIM_RE = /\b(gap|missing|absent|must be amended|wholesale absence)\b/i;

/**
 * Claims in final output that use gap language without a locked gap/partial row.
 */
export function guardUnsupportedInference(
  markdown: string,
  assessments: RequirementAssessment[]
): string[] {
  const hasMaterialGap = assessments.some(
    (row) =>
      isGapLike(row.status) ||
      row.judgement?.compliance === "gap" ||
      row.judgement?.compliance === "partial"
  );
  if (!GAP_CLAIM_RE.test(markdown) || hasMaterialGap) return [];
  return [
    "Output uses gap/amend language that is not supported by locked requirement findings.",
  ];
}

export function redundancyRate(sections: string[]): number {
  if (sections.length < 2) return 0;
  const normalized = sections.map((section) =>
    section.toLowerCase().replace(/\s+/g, " ").trim()
  );
  let overlap = 0;
  let pairs = 0;
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      pairs += 1;
      const a = new Set(normalized[i].split(" ").filter((w) => w.length > 5));
      const b = normalized[j].split(" ").filter((w) => w.length > 5);
      const hits = b.filter((word) => a.has(word)).length;
      if (hits >= 8) overlap += 1;
    }
  }
  return pairs === 0 ? 0 : overlap / pairs;
}

export function lockedStatusLine(assessment: RequirementAssessment): string {
  return `${humanizeRequirementId(assessment.requirementId)}: ${displayRequirementStatus(assessment)}`;
}
