import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import { displayRequirementStatus, isGapLike } from "../../models/requirement-assessment.js";
import { humanizeRequirementId } from "../../shared/group-assessments.js";

// Excludes "0 Gap" / "no gaps" style zero-count mentions in the deterministic
// fact rollup — a real, pre-existing false positive surfaced by ACT-Phase 7
// testing: a scenario with zero true gaps still says "0 Gap" in its counts.
const GAP_CLAIM_RE =
  /\b(?<!0 )(?<!\bno )(gap|missing|absent|must be amended|wholesale absence)\b/i;

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
      row.judgement?.compliance === "partial" ||
      // ACT-Phase 7 — a locked, verifier-authored gapDescription is exactly
      // the grounding this guard exists to require; a cannot_determine row
      // that VERIFY explicitly says is "missing" some element is not an
      // unsupported inference when RENDER echoes that specific language.
      Boolean(row.gapDescription)
  );
  if (!GAP_CLAIM_RE.test(markdown) || hasMaterialGap) return [];
  return [
    "Output uses gap/amend language that is not supported by locked requirement findings.",
  ];
}

const DEPENDENCY_CLAIM_RE =
  /\b(delegated to|not verifiable from .* alone|incorporated by reference|must (?:be )?review(?:ed)? (?:the )?(?:annex|schedule|appendix|exhibit|sow|statement of work|offer disclosure)|referenced (?:annex|schedule|appendix|exhibit|sow))\b/i;

/**
 * ACT-Phase 7 — same discipline as `guardUnsupportedInference`, extended to
 * the `dependency` enrichment field (research doc §8: "delegated to Annex 1/
 * SOW, not verifiable from the DPA alone" must be a first-class locked
 * field, not a footnote RENDER invents on its own). RENDER may only surface
 * a dependency claim that some row actually carries.
 */
export function guardUnsupportedDependencyClaim(
  markdown: string,
  assessments: RequirementAssessment[]
): string[] {
  const hasLockedDependency = assessments.some((row) => Boolean(row.dependency));
  if (!DEPENDENCY_CLAIM_RE.test(markdown) || hasLockedDependency) return [];
  return [
    "Output uses dependency/incorporated-by-reference language that is not supported by any locked requirement's dependency field.",
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
