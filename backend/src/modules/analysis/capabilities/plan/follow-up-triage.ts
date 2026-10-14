import type { RequirementAssessment } from "../../models/requirement-assessment.js";

export type TriageDecision =
  | "full_replan"
  | "narrow_addition"
  | "answerable_from_locks";

export interface TriageResult {
  decision: TriageDecision;
  reason: string;
  matchedLockIds?: string[];
}

const SCOPING_RE =
  /\b(focus on|narrow down|zoom in|drill into|just the|only the|specifically|about the|regarding the)\b/i;

const SYNTHESIS_RE =
  /\b(negotiate|recommendation|suggest|advise|what should|how should|what can|how can|what would|action item|next step)\b/i;

const REFERENCE_PRIOR_RE =
  /\b(that clause|that finding|that risk|that gap|the previous|the above|you found|you said|you mentioned|you flagged|as you noted)\b/i;

const NOVEL_QUESTION_RE =
  /\b(can we|could we|is it possible|what if|what happens|does the|is there|are there|how does|how do)\b/i;

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findRelevantLocks(
  instruction: string,
  locks: RequirementAssessment[]
): RequirementAssessment[] {
  const normalized = normalizeForMatch(instruction);
  return locks.filter((lock) => {
    const idParts = lock.requirementId.replace(/[._]/g, " ").toLowerCase();
    const summaryNorm = normalizeForMatch(lock.summary);
    return (
      idParts.split(" ").some((part) => part.length > 3 && normalized.includes(part)) ||
      summaryNorm.split(" ").some((word) => word.length > 4 && normalized.includes(word))
    );
  });
}

/**
 * §6 three-way triage: given a follow-up instruction and a set of locked
 * facts from a prior analysis turn, classify whether the follow-up:
 * - is answerable from existing locks (re-scope or synthesize)
 * - needs one narrow addition (a new proposition added to the locked set)
 * - needs a full re-plan (materially different analysis)
 */
export function triageFollowUp(
  instruction: string,
  lockedFacts: RequirementAssessment[]
): TriageResult {
  if (lockedFacts.length === 0) {
    return {
      decision: "full_replan",
      reason: "no locked facts from a prior turn — full investigation needed",
    };
  }

  const text = instruction.trim();
  const relevant = findRelevantLocks(text, lockedFacts);

  if (SCOPING_RE.test(text) && relevant.length > 0) {
    return {
      decision: "answerable_from_locks",
      reason: "scoping/focus instruction — re-render existing locked facts with narrower scope",
      matchedLockIds: relevant.map((l) => l.requirementId),
    };
  }

  if (SYNTHESIS_RE.test(text) && (relevant.length > 0 || REFERENCE_PRIOR_RE.test(text))) {
    return {
      decision: "answerable_from_locks",
      reason: "synthesis/recommendation ask — answerable from existing locked facts",
      matchedLockIds: relevant.map((l) => l.requirementId),
    };
  }

  if (REFERENCE_PRIOR_RE.test(text) && !NOVEL_QUESTION_RE.test(text)) {
    return {
      decision: "answerable_from_locks",
      reason: "references prior findings without a genuinely new question",
      matchedLockIds: relevant.map((l) => l.requirementId),
    };
  }

  if (NOVEL_QUESTION_RE.test(text)) {
    return {
      decision: "narrow_addition",
      reason: "new question that doesn't match existing locked facts — one new proposition needed",
      matchedLockIds: relevant.map((l) => l.requirementId),
    };
  }

  if (relevant.length > 0) {
    return {
      decision: "answerable_from_locks",
      reason: "instruction matches existing locked topics",
      matchedLockIds: relevant.map((l) => l.requirementId),
    };
  }

  return {
    decision: "full_replan",
    reason: "no overlap with existing locked facts — materially new analysis needed",
  };
}
