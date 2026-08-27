export const EVALUATE_PACKAGE_SYSTEM_PROMPT = [
  "You are a precise legal/compliance analyst evaluating requirements against authored rule text and supplied document evidence.",
  "Evaluate each requirement independently against its own hypothesis and its own candidate evidence. Never fabricate evidence.",
  "Your job is to classify axes. Do not write the user-facing report.",
  "NLI is not compliance: entailed may still be partial; not_mentioned is not automatically a gap.",
].join(" ");

export function buildEvaluatePackageUserPrompt(input: {
  instruction: string;
  depth: string;
  requirements: Array<{
    requirementId: string;
    hypothesis: string;
    candidateEvidenceRefs: string[];
  }>;
  authoredRuleText: string;
  evidenceLines: string[];
  previousFeedback?: string;
  /** Reference-only legal context — do not evaluate as standalone requirements. */
  contextRuleText?: string;
}): string {
  const requirementBlock = input.requirements
    .map((req) => {
      const refs =
        req.candidateEvidenceRefs.length > 0
          ? req.candidateEvidenceRefs.join(", ")
          : "(none — do not cite extracts assigned to a sibling requirement)";
      return `- ${req.requirementId}\n  hypothesis: ${req.hypothesis}\n  candidateEvidenceRefs: ${refs}`;
    })
    .join("\n");

  return [
    `User instruction: ${input.instruction}`,
    `Evaluation depth: ${input.depth}`,
    "",
    "Requirements to establish (return exactly one result per requirementId).",
    "Judge the hypothesis against that row's candidateEvidenceRefs only.",
    requirementBlock,
    "",
    "Authored legal rule text (evaluate only against this — do not invent law):",
    input.authoredRuleText,
    input.contextRuleText
      ? [
          "",
          "Reference legal context (background only — do NOT evaluate these as separate requirements):",
          input.contextRuleText,
        ].join("\n")
      : "",
    "",
    "Evidence extracted from the document (cite by ref in evidenceRefs; only use refs listed as candidates for THAT requirement):",
    input.evidenceLines.length > 0
      ? input.evidenceLines.join("\n")
      : "(no clause evidence was extracted for this package)",
    input.previousFeedback
      ? `\nPrior attempt feedback to address:\n${input.previousFeedback}`
      : "",
    "",
    "Return separate axes. Do not derive compliance from nli.",
    "",
    "nli — does THIS requirement's hypothesis follow from its candidate extracts?",
    "- entailed: the cited text supports the hypothesis.",
    "- contradicted: the cited text is inconsistent with the hypothesis.",
    "- not_mentioned: the candidate extracts do not speak to the hypothesis.",
    "not_mentioned is not a gap. A gap requires the reviewed text that should have contained the obligation to be complete and silent.",
    "not_mentioned applies only when THIS requirement's candidate extracts do not speak to the hypothesis. If a candidate states the obligation, nli is entailed even if particulars are elsewhere.",
    "",
    "compliance — does the contract satisfy the legal requirement adequately?",
    "- present: the requirement is substantively met in the reviewed instrument (entailed can still be partial if the legal test is not fully satisfied).",
    "- partial: some but not all of the requirement is met.",
    "- gap: the relevant complete text was reviewed and the obligation is affirmatively absent.",
    "- insufficient_evidence: cannot judge adequacy — empty extract, unread truncated text, or a non-binding/floating pointer to a schedule that was not supplied.",
    "- not_applicable: outside this agreement or request.",
    "Baseline contractual substance in this instrument is present even if a granular list or particulars live in a named agreement, schedule, or disclosure. Do not mark gap merely because a list is not enumerated here.",
    "Missing granular particulars in a referenced disclosure are Obtain/Confirm, not Gap and not Amend.",
    "Legacy status aliases: strong/adequate → present; conditional/partial → partial; missing → gap; cannot_determine → insufficient_evidence.",
    "",
    "evidenceState: direct | incorporated | truncated | unavailable | conflicting | not_found",
    "referenceBinding: binding | floating | none",
    "- binding: the main instrument incorporates a named schedule with enough contractual substance that the requirement is materially covered, even if particulars live in the schedule.",
    "- floating: a mere 'see Schedule X' / annex pointer without enough contractual substance. This is insufficient_evidence or partial — not present, not a drafting gap, not Amend.",
    "Do not mark present merely because a pointer exists.",
    "",
    "draftingQuality (only if compliance is present or partial): clean | could_be_clearer | operational_weakness",
    "materiality: low | medium | high",
    "evidenceConfidence: high | medium | low",
    "",
    "If evidence is marked truncated=true or heading_only=true, you did not receive the complete logical clause. Do NOT use gap. Default to insufficient_evidence / evidenceState=truncated.",
    "Recommendations: never recommend amending the agreement from insufficient_evidence, truncated, heading_only, floating pointers, or unavailable annexes. Use Obtain/Confirm. Recommend Amend only for gap or partial when the cited quote is complete and the defect is in this instrument.",
    "Ground every conclusion in evidence refs from THAT requirement's candidate list. If you cannot cite a valid candidate ref, do not claim coverage.",
    "Evaluate each requirementId independently. Do not copy another requirement's rationale, gap, or evidenceRefs unless that quote independently substantiates THIS hypothesis.",
    "An extract that matches a sibling hypothesis does not prove this one. Cite none and use nli=not_mentioned with compliance=insufficient_evidence when the candidate extracts do not speak to this hypothesis.",
  ].join("\n");
}
